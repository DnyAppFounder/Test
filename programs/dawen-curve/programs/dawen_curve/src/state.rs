use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum LaunchStatus {
    Active,
    Graduated,
}

/// On-chain state for a single DAWEN bonding curve launch.
///
/// V1 Tokenomics
/// ─────────────
///   Total supply:        1,000,000,000 tokens  (6 decimals)
///   Curve allocation:      950,000,000 tokens → token_vault (bonding curve)
///   Creator reward:         50,000,000 tokens → creator_reward_vault (locked
///                                               until graduation)
///
/// Virtual Reserve Pricing
/// ───────────────────────
///   price    = virtual_sol_reserve / virtual_token_reserve   (lamports/raw)
///   mcap_sol = price × total_supply_raw
///
///   Default initial values (configurable at initialize_launch):
///     virtual_sol_reserve  = 30_000_000_000  (30 SOL)
///     virtual_token_reserve = 1_073_000_191_000_000 (~1.073B tokens)
///     → initial mcap ≈ 27.96 SOL ($2,500 at $89/SOL, $4,200 at $150/SOL)
///
///   Graduation threshold: 85 SOL real SOL collected → status = Graduated
///
/// Vaults
/// ──────
///   token_vault          ATA of launch_state PDA   → bonding curve tokens
///   sol_vault            PDA [sol_vault, mint]      → real SOL from buyers
///   creator_reward_vault PDA [creator_reward, mint] → locked 5% creator reward
///
/// Creator Reward
/// ──────────────
///   Locked in creator_reward_vault at init. Claimable ONLY after graduation
///   via claim_creator_reward. Double-claim is blocked by creator_reward_claimed.
#[account]
#[derive(Debug)]
pub struct LaunchState {
    /// LaunchState PDA bump (seeds: [LAUNCH_SEED, mint]).
    pub bump: u8,
    /// SOL vault PDA bump (seeds: [SOL_VAULT_SEED, mint]).
    pub sol_vault_bump: u8,
    /// Creator reward vault bump (seeds: [CREATOR_REWARD_SEED, mint]).
    pub creator_reward_bump: u8,
    /// Wallet that called initialize_launch. Only this wallet can claim the
    /// creator reward.
    pub creator: Pubkey,
    /// The SPL token mint being traded on the bonding curve.
    pub mint: Pubkey,
    /// Bonding curve token vault (ATA of launch_state PDA). Holds 950M tokens.
    pub token_vault: Pubkey,
    /// SOL vault PDA. Accumulates real SOL from net buy amounts.
    pub sol_vault: Pubkey,
    /// Creator reward vault. Holds 50M tokens until graduation.
    pub creator_reward_vault: Pubkey,
    /// Current virtual SOL reserve (lamports). Updated on every buy/sell.
    pub virtual_sol_reserve: u64,
    /// Current virtual token reserve (raw units). Updated on every buy/sell.
    pub virtual_token_reserve: u64,
    /// Running total of net SOL deposited by buyers (lamports).
    /// Compared against graduation_threshold. Decreases on sells.
    pub real_sol_collected: u64,
    /// Running total of tokens transferred from token_vault to buyers.
    pub tokens_sold: u64,
    /// Total token supply (raw units, 6 decimals). Informational.
    pub total_supply: u64,
    /// Tokens placed into the bonding curve vault at launch (raw units).
    pub curve_token_allocation: u64,
    /// Tokens placed into the creator reward vault at launch (raw units).
    pub creator_reward_amount: u64,
    /// realSolCollected (lamports) at which the launch graduates.
    /// Default: 85_000_000_000 (85 SOL).
    pub graduation_threshold: u64,
    /// DAWEN platform fee in basis points. 100 = 1%.
    pub platform_fee_bps: u16,
    /// Active while trading; Graduated once threshold is hit.
    pub status: LaunchStatus,
    /// True once claim_creator_reward has been successfully called.
    /// Prevents double-claim.
    pub creator_reward_claimed: bool,
    /// Unix timestamp when initialize_launch was called.
    pub created_at: i64,
    /// Unix timestamp when the launch graduated (None if still Active).
    pub graduated_at: Option<i64>,
}

impl LaunchState {
    /// Total account space in bytes (discriminator + all fields).
    pub const SIZE: usize = 8   // anchor discriminator
        + 1   // bump
        + 1   // sol_vault_bump
        + 1   // creator_reward_bump
        + 32  // creator
        + 32  // mint
        + 32  // token_vault
        + 32  // sol_vault
        + 32  // creator_reward_vault
        + 8   // virtual_sol_reserve
        + 8   // virtual_token_reserve
        + 8   // real_sol_collected
        + 8   // tokens_sold
        + 8   // total_supply
        + 8   // curve_token_allocation
        + 8   // creator_reward_amount
        + 8   // graduation_threshold
        + 2   // platform_fee_bps
        + 1   // status enum
        + 1   // creator_reward_claimed
        + 8   // created_at
        + 1 + 8; // Option<i64> graduated_at

    pub fn is_active(&self) -> bool {
        self.status == LaunchStatus::Active
    }

    pub fn is_graduated(&self) -> bool {
        self.status == LaunchStatus::Graduated
    }
}
