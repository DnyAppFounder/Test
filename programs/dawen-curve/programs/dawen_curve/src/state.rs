use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum LaunchStatus {
    Active,
    Graduated,
}

/// On-chain state for a single bonding curve launch.
///
/// Accounts layout (space = 8 discriminator + LAUNCH_STATE_SIZE):
///   - bump / sol_vault_bump: PDA bump caches
///   - creator: wallet that initialized the launch
///   - mint: the SPL token mint being traded
///   - token_vault: ATA of the launch_state PDA (holds unsold tokens)
///   - sol_vault: PDA that holds real SOL collected from buyers
///   - virtual_sol_reserve / virtual_token_reserve: current virtual reserves
///     defining the constant-product curve (k = vSol * vToken stays constant)
///   - real_sol_collected: running total of net SOL deposited by buyers
///     (excluding platform fees); compared against graduation_threshold
///   - tokens_sold: running total of tokens transferred to buyers
///   - total_supply / curve_token_allocation: informational; curve_token_allocation
///     is the subset of total supply placed into the token vault at launch
///   - graduation_threshold: realSolCollected value (lamports) that triggers
///     automatic graduation
///   - platform_fee_bps: DAWEN platform fee in basis points (e.g. 100 = 1%)
///   - status: Active while trading; Graduated once threshold is hit
///   - created_at / graduated_at: Unix timestamps
#[account]
#[derive(Debug)]
pub struct LaunchState {
    pub bump: u8,
    pub sol_vault_bump: u8,
    pub creator: Pubkey,
    pub mint: Pubkey,
    pub token_vault: Pubkey,
    pub sol_vault: Pubkey,
    pub virtual_sol_reserve: u64,
    pub virtual_token_reserve: u64,
    pub real_sol_collected: u64,
    pub tokens_sold: u64,
    pub total_supply: u64,
    pub curve_token_allocation: u64,
    pub graduation_threshold: u64,
    pub platform_fee_bps: u16,
    pub status: LaunchStatus,
    pub created_at: i64,
    pub graduated_at: Option<i64>,
}

impl LaunchState {
    /// Anchor discriminator (8) + all fields
    pub const SIZE: usize = 8
        + 1  // bump
        + 1  // sol_vault_bump
        + 32 // creator
        + 32 // mint
        + 32 // token_vault
        + 32 // sol_vault
        + 8  // virtual_sol_reserve
        + 8  // virtual_token_reserve
        + 8  // real_sol_collected
        + 8  // tokens_sold
        + 8  // total_supply
        + 8  // curve_token_allocation
        + 8  // graduation_threshold
        + 2  // platform_fee_bps
        + 1  // status enum
        + 8  // created_at
        + 1 + 8; // Option<i64> graduated_at

    pub fn is_active(&self) -> bool {
        self.status == LaunchStatus::Active
    }

    pub fn is_graduated(&self) -> bool {
        self.status == LaunchStatus::Graduated
    }
}
