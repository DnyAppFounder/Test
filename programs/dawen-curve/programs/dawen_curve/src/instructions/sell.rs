use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CurveError;
use crate::math::{calc_fee, get_sol_out};
use crate::state::LaunchState;
use crate::{LAUNCH_SEED, SOL_VAULT_SEED, TREASURY};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SellArgs {
    /// Number of tokens (raw units) to sell back to the bonding curve.
    pub token_amount: u64,
    /// Minimum net SOL (lamports) the seller will accept after the 1% fee.
    pub min_sol_out: u64,
}

#[derive(Accounts)]
pub struct Sell<'info> {
    /// Seller wallet — pays tokens, receives SOL.
    #[account(mut)]
    pub seller: Signer<'info>,

    pub mint: Box<Account<'info, Mint>>,

    /// LaunchState — holds virtual reserves and status.
    #[account(
        mut,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump = launch_state.bump,
        has_one = mint,
        has_one = token_vault,
        has_one = sol_vault,
    )]
    pub launch_state: Box<Account<'info, LaunchState>>,

    /// Bonding curve token vault — receives tokens from seller.
    #[account(
        mut,
        token::mint = mint,
        token::authority = launch_state,
        address = launch_state.token_vault,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    /// SOL vault PDA — source of SOL paid to the seller.
    ///
    /// CHECK: Program-derived PDA validated by seeds. Only stores lamports.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump = launch_state.sol_vault_bump,
        address = launch_state.sol_vault,
    )]
    pub sol_vault: UncheckedAccount<'info>,

    /// Seller's ATA — source of tokens being sold.
    #[account(
        mut,
        token::mint = mint,
        token::authority = seller,
    )]
    pub seller_token_account: Box<Account<'info, TokenAccount>>,

    /// DAWEN platform treasury — receives the 1% sell fee.
    ///
    /// CHECK: Verified against hardcoded TREASURY constant.
    #[account(
        mut,
        constraint = treasury.key() == TREASURY @ CurveError::InvalidTreasury,
    )]
    pub treasury: SystemAccount<'info>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Sell>, args: SellArgs) -> Result<()> {
    // ── Phase 1: read + validate (no mutable borrows stored) ─────────────────
    require!(ctx.accounts.launch_state.is_active(), CurveError::LaunchNotActive);
    require!(args.token_amount > 0, CurveError::ZeroAmount);

    // Snapshot seller token balance before CPIs.
    let seller_balance = ctx.accounts.seller_token_account.amount;
    require!(
        seller_balance >= args.token_amount,
        CurveError::InsufficientTokenLiquidity
    );

    // Copy all fields we need from launch_state before any mutable borrow.
    let platform_fee_bps      = ctx.accounts.launch_state.platform_fee_bps;
    let virtual_sol_reserve   = ctx.accounts.launch_state.virtual_sol_reserve;
    let virtual_token_reserve = ctx.accounts.launch_state.virtual_token_reserve;

    // Snapshot SOL vault balance before CPIs.
    let vault_lamports = ctx.accounts.sol_vault.lamports();

    // Curve calculation.
    let gross_sol_out = get_sol_out(virtual_sol_reserve, virtual_token_reserve, args.token_amount)?;

    let fee = calc_fee(gross_sol_out, platform_fee_bps)?;
    let net_sol_out = gross_sol_out
        .checked_sub(fee)
        .ok_or(CurveError::MathOverflow)?;

    require!(net_sol_out >= args.min_sol_out, CurveError::SlippageExceeded);
    require!(vault_lamports >= gross_sol_out, CurveError::InsufficientSolLiquidity);

    // ── Phase 2: CPIs (no stored mutable borrow during this phase) ───────────

    // Transfer tokens: seller ATA → token_vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        args.token_amount,
    )?;

    // Transfer 1% fee: sol_vault → treasury (direct lamport transfer).
    // sol_vault is program-owned so we can manipulate lamports directly.
    if fee > 0 {
        **ctx
            .accounts
            .sol_vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= fee;
        **ctx
            .accounts
            .treasury
            .to_account_info()
            .try_borrow_mut_lamports()? += fee;
    }

    // Transfer net SOL: sol_vault → seller.
    **ctx
        .accounts
        .sol_vault
        .to_account_info()
        .try_borrow_mut_lamports()? -= net_sol_out;
    **ctx
        .accounts
        .seller
        .to_account_info()
        .try_borrow_mut_lamports()? += net_sol_out;

    // ── Phase 3: mutate state (single mutable borrow at the end) ─────────────
    let state = &mut ctx.accounts.launch_state;

    state.virtual_sol_reserve = state
        .virtual_sol_reserve
        .checked_sub(gross_sol_out)
        .ok_or(CurveError::MathOverflow)?;
    state.virtual_token_reserve = state
        .virtual_token_reserve
        .checked_add(args.token_amount)
        .ok_or(CurveError::MathOverflow)?;

    state.real_sol_collected = state.real_sol_collected.saturating_sub(gross_sol_out);
    state.tokens_sold = state.tokens_sold.saturating_sub(args.token_amount);

    msg!(
        "SELL: tokens_in={} gross_sol={} fee={} net_sol={} vSol={} vToken={} realSol={}",
        args.token_amount,
        gross_sol_out,
        fee,
        net_sol_out,
        state.virtual_sol_reserve,
        state.virtual_token_reserve,
        state.real_sol_collected,
    );

    Ok(())
}
