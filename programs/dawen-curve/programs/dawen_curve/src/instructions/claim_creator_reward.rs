use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::CurveError;
use crate::state::LaunchState;
use crate::{CREATOR_REWARD_SEED, LAUNCH_SEED};

#[derive(Accounts)]
pub struct ClaimCreatorReward<'info> {
    /// Creator wallet — must match launch_state.creator.
    #[account(
        mut,
        constraint = creator.key() == launch_state.creator @ CurveError::NotCreator,
    )]
    pub creator: Signer<'info>,

    pub mint: Account<'info, Mint>,

    /// LaunchState — must be Graduated; enforces creator identity.
    #[account(
        mut,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump = launch_state.bump,
        has_one = mint,
        has_one = creator_reward_vault,
    )]
    pub launch_state: Account<'info, LaunchState>,

    /// Creator reward vault — program-owned token account holding the 5%.
    /// Authority is launch_state PDA; transfer is signed by launch_state seeds.
    #[account(
        mut,
        seeds = [CREATOR_REWARD_SEED, mint.key().as_ref()],
        bump = launch_state.creator_reward_bump,
        token::mint = mint,
        token::authority = launch_state,
        address = launch_state.creator_reward_vault,
    )]
    pub creator_reward_vault: Account<'info, TokenAccount>,

    /// Creator's ATA — receives the 5% creator reward.
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
    )]
    pub creator_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<ClaimCreatorReward>) -> Result<()> {
    let state = &mut ctx.accounts.launch_state;

    // ── Guards ────────────────────────────────────────────────────────────────
    require!(state.is_graduated(), CurveError::LaunchNotGraduated);
    require!(!state.creator_reward_claimed, CurveError::AlreadyClaimed);

    let reward_amount = ctx.accounts.creator_reward_vault.amount;
    require!(reward_amount > 0, CurveError::NoRewardToClaim);

    // ── Transfer creator reward vault → creator ATA ───────────────────────────
    // The creator_reward_vault's authority is the launch_state PDA, so we
    // sign the CPI with launch_state seeds.
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[LAUNCH_SEED, mint_key.as_ref(), &[state.bump]];
    let signer_seeds = &[seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.creator_reward_vault.to_account_info(),
                to: ctx.accounts.creator_token_account.to_account_info(),
                authority: ctx.accounts.launch_state.to_account_info(),
            },
            signer_seeds,
        ),
        reward_amount,
    )?;

    // ── Mark as claimed — prevents double-claim ───────────────────────────────
    state.creator_reward_claimed = true;

    msg!(
        "CREATOR REWARD CLAIMED: mint={} creator={} amount={}",
        state.mint,
        state.creator,
        reward_amount,
    );

    Ok(())
}
