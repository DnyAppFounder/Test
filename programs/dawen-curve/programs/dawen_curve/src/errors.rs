use anchor_lang::prelude::*;

#[error_code]
pub enum CurveError {
    #[msg("Launch is not active — trading has ended or launch was never started")]
    LaunchNotActive,

    #[msg("Launch has already graduated — use Raydium/Meteora for further trading")]
    AlreadyGraduated,

    #[msg("Arithmetic overflow or underflow in bonding curve calculation")]
    MathOverflow,

    #[msg("Insufficient token liquidity in the curve vault")]
    InsufficientTokenLiquidity,

    #[msg("Insufficient SOL liquidity in the SOL vault")]
    InsufficientSolLiquidity,

    #[msg("Slippage tolerance exceeded — output amount is below minimum")]
    SlippageExceeded,

    #[msg("Trade amount must be greater than zero")]
    ZeroAmount,

    #[msg("Platform fee basis points must be between 0 and 1000 (max 10%)")]
    InvalidFeeBps,

    #[msg("Graduation threshold must be greater than zero")]
    InvalidGraduationThreshold,

    #[msg("Virtual reserves must be greater than zero")]
    InvalidVirtualReserves,

    #[msg("Curve token allocation must be greater than zero and <= total supply")]
    InvalidCurveAllocation,

    #[msg("Treasury account does not match the DAWEN treasury address")]
    InvalidTreasury,

    #[msg("Token vault does not match the expected PDA-owned ATA")]
    InvalidTokenVault,

    #[msg("SOL vault does not match the expected PDA")]
    InvalidSolVault,

    #[msg("Virtual token reserve must be >= curve token allocation")]
    ReserveBelowAllocation,

    #[msg("Graduation threshold has not been reached yet")]
    ThresholdNotReached,
}
