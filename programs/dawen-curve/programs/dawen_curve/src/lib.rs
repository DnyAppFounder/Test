/// DAWEN Bonding Curve Program — V1
///
/// Pump.fun-style virtual-reserve AMM for DAWEN token launches on Solana.
/// Creators need zero real SOL liquidity to launch. Price is set by virtual
/// reserves from day one.
///
/// V1 Tokenomics
/// ─────────────
///   Total supply:   1,000,000,000 tokens (6 decimals)
///   Curve vault:      950,000,000 tokens (95%) — bonding curve buys/sells
///   Creator reward:    50,000,000 tokens ( 5%) — locked until graduation
///
/// Instructions
/// ────────────
///   1. initialize_launch      — split tokens into two vaults, set reserves
///   2. buy                    — SOL in → tokens out (1% fee to treasury)
///   3. sell                   — tokens in → SOL out (1% fee to treasury)
///   4. graduate               — permissionless once 85 SOL threshold is hit
///   5. claim_creator_reward   — creator claims 5% after graduation (once)
///
/// Graduation
/// ──────────
///   Once realSolCollected >= graduation_threshold (default 85 SOL):
///     - buy/sell are permanently blocked
///     - creator reward becomes claimable
///     - collected SOL + remaining tokens preserved for Raydium/Meteora migration
///
/// Vaults (all program-owned)
/// ─────────────────────────
///   token_vault          [ATA of launch_state PDA]   curve tokens
///   sol_vault            [sol_vault, mint]            real SOL
///   creator_reward_vault [creator_reward, mint]       locked 5%
///
/// Treasury
/// ────────
///   FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X
///
/// Program ID
/// ──────────
///   Replace the placeholder below with the keypair from `anchor keys list`
///   before deploying. Never use this placeholder in production.
use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("HJfJJunBLeF4MRAQ4ZXEB29dYsyRbojgD95GNTCDPh1q");

/// DAWEN platform fee treasury — buy/sell fees are forwarded here atomically.
/// Using declare_id! submodule avoids all pubkey! macro import issues across Anchor versions.
mod treasury_key {
    anchor_lang::declare_id!("FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X");
}
pub use treasury_key::ID as TREASURY;

/// LaunchState PDA seed.
pub const LAUNCH_SEED: &[u8] = b"launch";

/// SOL vault PDA seed.
pub const SOL_VAULT_SEED: &[u8] = b"sol_vault";

/// Creator reward vault token account seed.
pub const CREATOR_REWARD_SEED: &[u8] = b"creator_reward";

#[program]
pub mod dawen_curve {
    use super::*;

    /// Create a bonding curve launch for an existing SPL token mint.
    ///
    /// Transfers 95% of total supply (curve_token_allocation) into the
    /// program-owned bonding curve token vault and 5% (creator_reward_amount)
    /// into the creator reward vault. Sets virtual reserves, graduation
    /// threshold, and platform fee. Status starts as Active.
    pub fn initialize_launch(
        ctx: Context<InitializeLaunch>,
        args: InitializeLaunchArgs,
    ) -> Result<()> {
        instructions::initialize_launch::handler(ctx, args)
    }

    /// Buy tokens through the bonding curve with SOL.
    ///
    /// 1% platform fee deducted from sol_amount → treasury.
    /// Net SOL enters the constant-product formula → tokens_out.
    /// Automatically graduates the launch once 85 SOL threshold is reached.
    /// Fails with SlippageExceeded if tokens_out < min_tokens_out.
    pub fn buy(ctx: Context<Buy>, args: BuyArgs) -> Result<()> {
        instructions::buy::handler(ctx, args)
    }

    /// Sell tokens back to the bonding curve for SOL.
    ///
    /// Curve returns gross SOL; 1% platform fee deducted → treasury;
    /// net SOL sent to seller. Fails if net_sol_out < min_sol_out.
    pub fn sell(ctx: Context<Sell>, args: SellArgs) -> Result<()> {
        instructions::sell::handler(ctx, args)
    }

    /// Permissionlessly graduate the launch once threshold is met.
    ///
    /// The buy instruction auto-graduates; this is a fallback so indexers
    /// or the DAWEN backend can trigger it explicitly.
    pub fn graduate(ctx: Context<Graduate>) -> Result<()> {
        instructions::graduate::handler(ctx)
    }

    /// Claim the creator's 5% reward allocation.
    ///
    /// Only callable after status = Graduated. Transfers all tokens from the
    /// creator reward vault to the creator's ATA. Blocked before graduation
    /// and blocked if already claimed.
    pub fn claim_creator_reward(ctx: Context<ClaimCreatorReward>) -> Result<()> {
        instructions::claim_creator_reward::handler(ctx)
    }
}
