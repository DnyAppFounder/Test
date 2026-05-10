use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CurveError;
use crate::math::{calc_fee, get_tokens_out};
use crate::state::{LaunchState, LaunchStatus};
use crate::{LAUNCH_SEED, SOL_VAULT_SEED, TREASURY};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct BuyArgs {
    /// Gross SOL (lamports) the buyer sends. The 1% DAWEN fee is taken first,
    /// then net SOL enters the constant-product formula.
    pub sol_amount: u64,
    /// Minimum tokens the buyer will accept. Transaction reverts if
    /// tokens_out < min_tokens_out.
    pub min_tokens_out: u64,
}

#[derive(Accounts)]
pub struct Buy<'info> {
    /// Buyer wallet — pays SOL, receives tokens.
    #[account(mut)]
    pub buyer: Signer<'info>,

    pub mint: Account<'info, Mint>,

    /// LaunchState — holds virtual reserves and status.
    #[account(
        mut,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump = launch_state.bump,
        has_one = mint,
        has_one = token_vault,
        has_one = sol_vault,
    )]
    pub launch_state: Account<'info, LaunchState>,

    /// Bonding curve token vault — source of tokens for buyers.
    #[account(
        mut,
        token::mint = mint,
        token::authority = launch_state,
        address = launch_state.token_vault,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// SOL vault PDA — receives net SOL from buyers.
    ///
    /// CHECK: Program-owned PDA that only stores lamports. Safe.
    #[account(
        mut,
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump = launch_state.sol_vault_bump,
        address = launch_state.sol_vault,
    )]
    pub sol_vault: SystemAccount<'info>,

    /// Buyer's ATA — receives purchased tokens. Created if it doesn't exist.
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    /// DAWEN platform treasury — receives the 1% buy fee.
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

pub fn handler(ctx: Context<Buy>, args: BuyArgs) -> Result<()> {
    let state = &mut ctx.accounts.launch_state;

    // ── Guards ────────────────────────────────────────────────────────────────
    require!(state.is_active(), CurveError::LaunchNotActive);
    require!(args.sol_amount > 0, CurveError::ZeroAmount);

    // ── Fee split: 1% → treasury, 99% → curve ────────────────────────────────
    let fee = calc_fee(args.sol_amount, state.platform_fee_bps)?;
    let net_sol = args
        .sol_amount
        .checked_sub(fee)
        .ok_or(CurveError::MathOverflow)?;

    // ── Constant-product price calculation ────────────────────────────────────
    let tokens_out = get_tokens_out(
        state.virtual_sol_reserve,
        state.virtual_token_reserve,
        net_sol,
    )?;

    require!(
        tokens_out >= args.min_tokens_out,
        CurveError::SlippageExceeded
    );
    require!(
        tokens_out <= ctx.accounts.token_vault.amount,
        CurveError::InsufficientTokenLiquidity
    );

    // ── Transfer 1% fee: buyer → treasury ────────────────────────────────────
    if fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.buyer.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            fee,
        )?;
    }

    // ── Transfer net SOL: buyer → sol_vault ──────────────────────────────────
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.sol_vault.to_account_info(),
            },
        ),
        net_sol,
    )?;

    // ── Transfer tokens: token_vault → buyer ATA (signed by launch_state) ────
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[LAUNCH_SEED, mint_key.as_ref(), &[state.bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.launch_state.to_account_info(),
            },
            signer_seeds,
        ),
        tokens_out,
    )?;

    // ── Update virtual reserves (constant-product invariant maintained) ───────
    state.virtual_sol_reserve = state
        .virtual_sol_reserve
        .checked_add(net_sol)
        .ok_or(CurveError::MathOverflow)?;
    state.virtual_token_reserve = state
        .virtual_token_reserve
        .checked_sub(tokens_out)
        .ok_or(CurveError::MathOverflow)?;

    // ── Update real-SOL and token counters ────────────────────────────────────
    state.real_sol_collected = state
        .real_sol_collected
        .checked_add(net_sol)
        .ok_or(CurveError::MathOverflow)?;
    state.tokens_sold = state
        .tokens_sold
        .checked_add(tokens_out)
        .ok_or(CurveError::MathOverflow)?;

    msg!(
        "BUY: gross_sol={} fee={} tokens_out={} vSol={} vToken={} realSol={}",
        args.sol_amount,
        fee,
        tokens_out,
        state.virtual_sol_reserve,
        state.virtual_token_reserve,
        state.real_sol_collected,
    );

    // ── Auto-graduate when threshold is reached ───────────────────────────────
    if state.real_sol_collected >= state.graduation_threshold {
        let clock = Clock::get()?;
        state.status = LaunchStatus::Graduated;
        state.graduated_at = Some(clock.unix_timestamp);
        msg!(
            "AUTO-GRADUATED: mint={} realSol={} threshold={}",
            state.mint,
            state.real_sol_collected,
            state.graduation_threshold,
        );
    }

    Ok(())
}
