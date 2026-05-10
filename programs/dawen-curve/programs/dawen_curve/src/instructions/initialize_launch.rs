use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

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

#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    /// Creator wallet — pays rent for all new accounts and transfers tokens.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The existing SPL token mint being launched on the bonding curve.
    pub mint: Box<Account<'info, Mint>>,

    /// LaunchState PDA — stores all curve parameters and running state.
    #[account(
        init,
        payer = creator,
        space = LaunchState::SIZE,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump,
    )]
    pub launch_state: Box<Account<'info, LaunchState>>,

    /// SOL vault PDA — holds real SOL collected from net buys.
    /// Not initialized here; receives SOL via system_program::transfer in buy.
    ///
    /// CHECK: Program-derived PDA validated by seeds. Only stores lamports.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// Bonding curve token vault — ATA of the launch_state PDA.
    /// Receives 95% of total supply (curve_token_allocation).
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = launch_state,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    /// Creator reward vault — program-derived token account at a fixed PDA.
    /// Receives 5% of total supply. Locked until graduation.
    #[account(
        init,
        payer = creator,
        seeds = [CREATOR_REWARD_SEED, mint.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = launch_state,
    )]
    pub creator_reward_vault: Box<Account<'info, TokenAccount>>,

    /// Creator's token account — source of both allocations.
    /// Must hold at least curve_token_allocation + creator_reward_amount.
    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeLaunch>, args: InitializeLaunchArgs) -> Result<()> {
    // Guard against re-initialization: created_at is 0 on a zero-initialised account.
    // A real Unix timestamp is always > 0 so this safely detects existing launches.
    require!(
        ctx.accounts.launch_state.created_at == 0,
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

    // ── Capture bumps before LaunchState mutable borrow ──────────────────────
    let launch_bump = ctx.bumps.launch_state;
    let sol_vault_bump = ctx.bumps.sol_vault;
    let creator_reward_bump = ctx.bumps.creator_reward_vault;

    // ── Initialize LaunchState ────────────────────────────────────────────────
    let state = &mut ctx.accounts.launch_state;
    let clock = Clock::get()?;

    state.bump = launch_bump;
    state.sol_vault_bump = sol_vault_bump;
    state.creator_reward_bump = creator_reward_bump;
    state.creator = ctx.accounts.creator.key();
    state.mint = ctx.accounts.mint.key();
    state.token_vault = ctx.accounts.token_vault.key();
    state.sol_vault = ctx.accounts.sol_vault.key();
    state.creator_reward_vault = ctx.accounts.creator_reward_vault.key();
    state.virtual_sol_reserve = args.virtual_sol_reserve;
    state.virtual_token_reserve = args.virtual_token_reserve;
    state.real_sol_collected = 0;
    state.tokens_sold = 0;
    state.total_supply = args.total_supply;
    state.curve_token_allocation = args.curve_token_allocation;
    state.creator_reward_amount = args.creator_reward_amount;
    state.graduation_threshold = args.graduation_threshold;
    state.platform_fee_bps = args.platform_fee_bps;
    state.status = LaunchStatus::Active;
    state.creator_reward_claimed = false;
    state.created_at = clock.unix_timestamp;
    state.graduated_at = None;

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
