use anchor_lang::prelude::*;

use crate::errors::CurveError;
use crate::state::{LaunchState, LaunchStatus};
use crate::{LAUNCH_SEED, SOL_VAULT_SEED};
use anchor_spl::token::Mint;

/// Permissionless graduation instruction.
///
/// Anyone can call this once realSolCollected >= graduation_threshold.
/// The `buy` instruction also auto-graduates, so this exists as an explicit
/// fallback that indexers or the DAWEN backend can trigger.
///
/// After graduation:
///   - status is set to Graduated
///   - buy/sell are permanently blocked
///   - collected SOL and remaining tokens remain in their vaults, ready for
///     a separate migrate_to_raydium / migrate_to_meteora instruction
#[derive(Accounts)]
pub struct Graduate<'info> {
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [LAUNCH_SEED, mint.key().as_ref()],
        bump = launch_state.bump,
        has_one = mint,
        has_one = sol_vault,
    )]
    pub launch_state: Account<'info, LaunchState>,

    /// CHECK: Program-owned PDA. Validated by seeds constraint.
    #[account(
        seeds = [SOL_VAULT_SEED, mint.key().as_ref()],
        bump = launch_state.sol_vault_bump,
        address = launch_state.sol_vault,
    )]
    pub sol_vault: SystemAccount<'info>,
}

pub fn handler(ctx: Context<Graduate>) -> Result<()> {
    let state = &mut ctx.accounts.launch_state;

    require!(!state.is_graduated(), CurveError::AlreadyGraduated);
    require!(
        state.real_sol_collected >= state.graduation_threshold,
        CurveError::ThresholdNotReached
    );

    let clock = Clock::get()?;
    state.status = LaunchStatus::Graduated;
    state.graduated_at = Some(clock.unix_timestamp);

    msg!(
        "GRADUATED (explicit): mint={} realSol={} threshold={} ts={}",
        state.mint,
        state.real_sol_collected,
        state.graduation_threshold,
        clock.unix_timestamp,
    );

    Ok(())
}
