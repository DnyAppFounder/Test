use anchor_lang::prelude::*;

#[error_code]
pub enum CurveError {
    #[msg("Launch is not active — trading has ended or has not been initialized")]
    LaunchNotActive,

    #[msg("Launch has not graduated yet — action requires graduated status")]
    LaunchNotGraduated,

    #[msg("Launch has already graduated — use Raydium/Meteora for further trading")]
    AlreadyGraduated,

    #[msg("Arithmetic overflow or underflow in bonding curve calculation")]
    MathOverflow,

    #[msg("Insufficient token liquidity in the bonding curve vault")]
    InsufficientTokenLiquidity,

    #[msg("Insufficient SOL liquidity in the SOL vault")]
    InsufficientSolLiquidity,

    #[msg("Slippage tolerance exceeded — output amount is below your minimum")]
    SlippageExceeded,

    #[msg("Trade amount must be greater than zero")]
    ZeroAmount,

    #[msg("Platform fee basis points must be between 0 and 1000 (max 10%)")]
    InvalidFeeBps,

    #[msg("Graduation threshold must be greater than zero")]
    InvalidGraduationThreshold,

    #[msg("Virtual reserves must both be greater than zero")]
    InvalidVirtualReserves,

    #[msg("curve_token_allocation and creator_reward_amount must sum to total_supply")]
    InvalidAllocationSplit,

    #[msg("curve_token_allocation must be > 0")]
    InvalidCurveAllocation,

    #[msg("creator_reward_amount must be > 0")]
    InvalidCreatorReward,

    #[msg("Treasury account does not match the DAWEN treasury address")]
    InvalidTreasury,

    #[msg("Virtual token reserve must be >= curve_token_allocation")]
    ReserveBelowAllocation,

    #[msg("Graduation threshold has not been reached yet")]
    ThresholdNotReached,

    #[msg("Creator reward has already been claimed")]
    AlreadyClaimed,

    #[msg("Signer is not the creator of this launch")]
    NotCreator,

    #[msg("Creator reward vault has no tokens to claim")]
    NoRewardToClaim,
}
