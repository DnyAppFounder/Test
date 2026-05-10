use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, CreateAccount};
use anchor_lang::AccountSerialize;
use anchor_spl::associated_token::{self, AssociatedToken, Create};
use anchor_spl::token::{
    self, initialize_account3, InitializeAccount3, Mint, Token, TokenAccount, Transfer,
};

use crate::errors::CurveError;
use crate::state::{LaunchState, LaunchStatus};
use crate::{CREATOR_REWARD_SEED, LAUNCH_SEED, SOL_VAULT_SEED};

/// Arguments for initialize_launch.
///
/// V1 defaults (6-decimal token, 1B total supply):
///   virtual_sol_reserve    = 30_000_000_000        (30 SOL)
///   virtual_token_reserve  = 1_073_000_191_000_000 (~1.073B tokens in raw)
///   curve_token_allocation = 950_000_000_000_000   (950M tokens → 95%)
///   creator_reward_amount  = 50_000_000_000_000    ( 50M tokens →  5%)
///   total_supply           = 1_000_000_000_000_000 (1B tokens in raw)
///   graduation_threshold   = 85_000_000_000        (85 SOL in lamports)
///   platform_fee_bps       = 100                   (1%)
///
/// Validation enforced:
///   curve_token_allocation + creator_reward_amount == total_supply
///   virtual_token_reserve >= curve_token_allocation
///   platform_fee_bps <= 1000
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeLaunchArgs {
    /// Initial virtual SOL reserve (lamports). No real SOL required.
    pub virtual_sol_reserve: u64,
    /// Initial virtual token reserve (raw units). Sets the initial price.
    /// Must be >= curve_token_allocation.
    pub virtual_token_reserve: u64,
    /// Tokens (raw) placed into bonding curve vault. Expected: 95% of supply.
    pub curve_token_allocation: u64,
    /// Tokens (raw) placed into creator reward vault. Expected: 5% of supply.
    pub creator_reward_amount: u64,
    /// Full token supply (raw). Must equal curve_token_allocation + creator_reward_amount.
    pub total_supply: u64,
    /// realSolCollected (lamports) at which the launch graduates. Default: 85 SOL.
    pub graduation_threshold: u64,
    /// DAWEN platform fee in basis points (100 = 1%, max 1000 = 10%).
    pub platform_fee_bps: u16,
}

/// All four program-owned accounts (launch_state, sol_vault, token_vault,
/// creator_reward_vault) are declared as UncheckedAccount and created manually
/// in the handler via system_program and associated_token CPIs. This avoids the
/// `init` / `init_if_needed` Anchor constraint, which triggers a `try_from_unchecked`
/// code path that is incompatible with the current anchor-derive-accounts version.
#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    /// Creator wallet — pays rent for all new accounts and transfers tokens.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The existing SPL token mint being launched on the bonding curve.
    pub mint: Account<'info, Mint>,

    /// CHECK: Program-owned LaunchState PDA. Seeds validated here; account
    /// created and written entirely by the handler. Re-initialization is
    /// blocked at runtime by the data_is_empty guard in the handler.
    #[account(
        mut,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump,
    )]
    pub launch_state: UncheckedAccount<'info>,

    /// CHECK: SOL vault PDA — stores real SOL collected from net buys.
    /// Seeds validated here; created by the handler as a system-program-owned
    /// account so that SystemAccount<'info> validation passes in buy/sell.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// CHECK: ATA of launch_state PDA for this mint. Receives 95% of total
    /// supply. Created by the handler via associated_token::create CPI.
    #[account(mut)]
    pub token_vault: UncheckedAccount<'info>,

    /// CHECK: PDA token account for the creator reward allocation. Seeds
    /// validated here; created and initialized by the handler. Receives 5%
    /// of total supply, locked until graduation.
    #[account(
        mut,
        seeds = [CREATOR_REWARD_SEED, mint.key().as_ref()],
        bump,
    )]
    pub creator_reward_vault: UncheckedAccount<'info>,

    /// Creator's token account — source of both allocations.
    /// Must hold at least curve_token_allocation + creator_reward_amount.
    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeLaunch>, args: InitializeLaunchArgs) -> Result<()> {
    // Guard against re-initialization: a fresh PDA has no data (length == 0).
    require!(
        ctx.accounts.launch_state.data_is_empty(),
        CurveError::AlreadyInitialized
    );

    // ── Validate args ─────────────────────────────────────────────────────────
    require!(args.platform_fee_bps <= 1000, CurveError::InvalidFeeBps);
    require!(
        args.graduation_threshold > 0,
        CurveError::InvalidGraduationThreshold
    );
    require!(
        args.virtual_sol_reserve > 0 && args.virtual_token_reserve > 0,
        CurveError::InvalidVirtualReserves
    );
    require!(
        args.curve_token_allocation > 0,
        CurveError::InvalidCurveAllocation
    );
    require!(
        args.creator_reward_amount > 0,
        CurveError::InvalidCreatorReward
    );
    require!(
        args.curve_token_allocation
            .checked_add(args.creator_reward_amount)
            .ok_or(CurveError::MathOverflow)?
            == args.total_supply,
        CurveError::InvalidAllocationSplit
    );
    require!(
        args.virtual_token_reserve >= args.curve_token_allocation,
        CurveError::ReserveBelowAllocation
    );

    // ── Capture bumps and shared values ──────────────────────────────────────
    let launch_bump = ctx.bumps.launch_state;
    let sol_vault_bump = ctx.bumps.sol_vault;
    let creator_reward_bump = ctx.bumps.creator_reward_vault;
    let mint_key = ctx.accounts.mint.key();
    let rent = Rent::get()?;

    let launch_seeds: &[&[u8]] = &[LAUNCH_SEED, mint_key.as_ref(), &[launch_bump]];
    let sol_vault_seeds: &[&[u8]] = &[SOL_VAULT_SEED, mint_key.as_ref(), &[sol_vault_bump]];
    let reward_seeds: &[&[u8]] = &[CREATOR_REWARD_SEED, mint_key.as_ref(), &[creator_reward_bump]];

    // ── Create LaunchState PDA account (owned by dawen_curve) ────────────────
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.launch_state.to_account_info(),
            },
            &[launch_seeds],
        ),
        rent.minimum_balance(LaunchState::SIZE),
        LaunchState::SIZE as u64,
        ctx.program_id,
    )?;

    // ── Create SOL vault PDA (system-program owned, zero data, holds lamports) ─
    // Kept system-program owned so that SystemAccount<'info> validation in
    // buy.rs and sell.rs passes at runtime.
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
            &[sol_vault_seeds],
        ),
        rent.minimum_balance(0),
        0,
        &system_program::ID,
    )?;

    // ── Create bonding curve token vault (ATA of launch_state PDA) ───────────
    associated_token::create(
        CpiContext::new(
            ctx.accounts.associated_token_program.to_account_info(),
            Create {
                payer: ctx.accounts.creator.to_account_info(),
                associated_token: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.launch_state.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
        ),
    )?;

    // ── Create creator reward vault PDA (SPL token account, 165 bytes) ───────
    system_program::create_account(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            CreateAccount {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.creator_reward_vault.to_account_info(),
            },
            &[reward_seeds],
        ),
        rent.minimum_balance(165),
        165,
        ctx.accounts.token_program.key,
    )?;

    // initialize_account3 sets mint + authority without requiring a Rent sysvar.
    initialize_account3(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            InitializeAccount3 {
                account: ctx.accounts.creator_reward_vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.launch_state.to_account_info(),
            },
        ),
    )?;

    // ── Transfer 95% → bonding curve token vault ──────────────────────────────
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        args.curve_token_allocation,
    )?;

    // ── Transfer 5% → creator reward vault ───────────────────────────────────
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_token_account.to_account_info(),
                to: ctx.accounts.creator_reward_vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        args.creator_reward_amount,
    )?;

    // ── Build and serialize LaunchState into the new account ──────────────────
    let clock = Clock::get()?;
    let state = LaunchState {
        bump: launch_bump,
        sol_vault_bump,
        creator_reward_bump,
        creator: ctx.accounts.creator.key(),
        mint: mint_key,
        token_vault: ctx.accounts.token_vault.key(),
        sol_vault: ctx.accounts.sol_vault.key(),
        creator_reward_vault: ctx.accounts.creator_reward_vault.key(),
        virtual_sol_reserve: args.virtual_sol_reserve,
        virtual_token_reserve: args.virtual_token_reserve,
        real_sol_collected: 0,
        tokens_sold: 0,
        total_supply: args.total_supply,
        curve_token_allocation: args.curve_token_allocation,
        creator_reward_amount: args.creator_reward_amount,
        graduation_threshold: args.graduation_threshold,
        platform_fee_bps: args.platform_fee_bps,
        status: LaunchStatus::Active,
        creator_reward_claimed: false,
        created_at: clock.unix_timestamp,
        graduated_at: None,
    };

    let mut account_data = ctx.accounts.launch_state.try_borrow_mut_data()?;
    let mut writer: &mut [u8] = &mut *account_data;
    state.try_serialize(&mut writer)?;

    msg!(
        "DAWEN launch initialized: mint={} vSol={} vToken={} curveAlloc={} creatorReward={} threshold={}",
        state.mint,
        state.virtual_sol_reserve,
        state.virtual_token_reserve,
        state.curve_token_allocation,
        state.creator_reward_amount,
        state.graduation_threshold,
    );

    Ok(())
}
