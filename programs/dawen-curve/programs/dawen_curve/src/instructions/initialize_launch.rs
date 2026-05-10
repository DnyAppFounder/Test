use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CurveError;
use crate::state::{LaunchState, LaunchStatus};
use crate::{LAUNCH_SEED, SOL_VAULT_SEED};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeLaunchArgs {
    /// Initial virtual SOL reserve (lamports).
    /// Defines the starting price together with virtual_token_reserve.
    /// Recommended default: 30_000_000_000 (30 SOL).
    pub virtual_sol_reserve: u64,
    /// Initial virtual token reserve (smallest token units).
    /// Must be >= curve_token_allocation.
    /// Recommended default: 1_073_000_191 * 10^decimals.
    pub virtual_token_reserve: u64,
    /// Tokens (smallest units) placed into the token vault for the curve.
    /// Must be <= total_supply and <= virtual_token_reserve.
    pub curve_token_allocation: u64,
    /// Total token supply (informational).
    pub total_supply: u64,
    /// realSolCollected (lamports) at which the launch graduates.
    /// Recommended default: 85_000_000_000 (85 SOL).
    pub graduation_threshold: u64,
    /// DAWEN platform fee in basis points. Max 1000 (10%).
    pub platform_fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeLaunch<'info> {
    /// Wallet paying for account creation and transferring curve tokens.
    #[account(mut)]
    pub creator: Signer<'info>,

    /// The existing SPL token mint being launched on the bonding curve.
    pub mint: Account<'info, Mint>,

    /// LaunchState PDA — stores all curve parameters and running state.
    #[account(
        init,
        payer = creator,
        space = LaunchState::SIZE,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump,
    )]
    pub launch_state: Account<'info, LaunchState>,

    /// SOL vault PDA — collects real SOL from buyers (held by program).
    /// Initialized as a zero-data account; SOL accumulates via direct transfer.
    ///
    /// CHECK: This is a program-owned PDA used only to store lamports.
    #[account(
        init,
        payer = creator,
        space = 0,
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump,
    )]
    pub sol_vault: SystemAccount<'info>,

    /// Token vault — ATA of launch_state PDA that holds unsold curve tokens.
    #[account(
        init,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = launch_state,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Creator's token account — source of the curve_token_allocation.
    #[account(
        mut,
        token::mint = mint,
        token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeLaunch>, args: InitializeLaunchArgs) -> Result<()> {
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
        args.curve_token_allocation > 0
            && args.curve_token_allocation <= args.total_supply,
        CurveError::InvalidCurveAllocation
    );
    require!(
        args.virtual_token_reserve >= args.curve_token_allocation,
        CurveError::ReserveBelowAllocation
    );

    // ── Transfer curve tokens from creator into the token vault ───────────────
    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.creator_token_account.to_account_info(),
            to: ctx.accounts.token_vault.to_account_info(),
            authority: ctx.accounts.creator.to_account_info(),
        },
    );
    token::transfer(cpi_ctx, args.curve_token_allocation)?;

    // ── Capture bumps before mutable borrow of launch_state ──────────────────
    let launch_bump = ctx.bumps.launch_state;
    let sol_vault_bump = ctx.bumps.sol_vault;

    // ── Initialise LaunchState ────────────────────────────────────────────────
    let state = &mut ctx.accounts.launch_state;
    let clock = Clock::get()?;

    state.bump = launch_bump;
    state.sol_vault_bump = sol_vault_bump;
    state.creator = ctx.accounts.creator.key();
    state.mint = ctx.accounts.mint.key();
    state.token_vault = ctx.accounts.token_vault.key();
    state.sol_vault = ctx.accounts.sol_vault.key();
    state.virtual_sol_reserve = args.virtual_sol_reserve;
    state.virtual_token_reserve = args.virtual_token_reserve;
    state.real_sol_collected = 0;
    state.tokens_sold = 0;
    state.total_supply = args.total_supply;
    state.curve_token_allocation = args.curve_token_allocation;
    state.graduation_threshold = args.graduation_threshold;
    state.platform_fee_bps = args.platform_fee_bps;
    state.status = LaunchStatus::Active;
    state.created_at = clock.unix_timestamp;
    state.graduated_at = None;

    msg!(
        "DAWEN launch initialized: mint={}, vSol={}, vToken={}, allocation={}, grad_threshold={}",
        state.mint,
        state.virtual_sol_reserve,
        state.virtual_token_reserve,
        state.curve_token_allocation,
        state.graduation_threshold,
    );

    Ok(())
}
