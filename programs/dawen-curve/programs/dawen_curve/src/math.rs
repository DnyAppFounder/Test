/// DAWEN Bonding Curve Math
///
/// Implements a constant-product AMM with virtual reserves, identical in
/// principle to pump.fun's bonding curve mechanism.
///
/// Invariant: virtual_sol_reserve * virtual_token_reserve = k
///
/// Both virtual reserves are updated on every trade so the invariant holds.
/// Real SOL is collected in a vault; real tokens are held in a vault.
/// Virtual reserves exist only on-chain in LaunchState — no real liquidity
/// needs to be pre-deposited.
///
/// All intermediate calculations use u128 to prevent overflow.
use crate::errors::CurveError;
use anchor_lang::prelude::*;

/// Given a SOL input (after fee deduction), return how many tokens the buyer
/// receives using the current virtual reserves.
///
/// Formula:
///   k = virtual_sol * virtual_token
///   new_virtual_sol = virtual_sol + sol_in
///   new_virtual_token = k / new_virtual_sol       (rounding down)
///   tokens_out = virtual_token - new_virtual_token
pub fn get_tokens_out(
    virtual_sol: u64,
    virtual_token: u64,
    sol_in: u64,
) -> Result<u64> {
    require!(sol_in > 0, CurveError::ZeroAmount);

    let k = (virtual_sol as u128)
        .checked_mul(virtual_token as u128)
        .ok_or(CurveError::MathOverflow)?;

    let new_virtual_sol = (virtual_sol as u128)
        .checked_add(sol_in as u128)
        .ok_or(CurveError::MathOverflow)?;

    let new_virtual_token = k
        .checked_div(new_virtual_sol)
        .ok_or(CurveError::MathOverflow)?;

    let tokens_out = (virtual_token as u128)
        .checked_sub(new_virtual_token)
        .ok_or(CurveError::InsufficientTokenLiquidity)?;

    Ok(tokens_out as u64)
}

/// Given a token input, return how much SOL the seller receives (before fee
/// deduction) using the current virtual reserves.
///
/// Formula:
///   k = virtual_sol * virtual_token
///   new_virtual_token = virtual_token + tokens_in
///   new_virtual_sol = k / new_virtual_token       (rounding down)
///   sol_out = virtual_sol - new_virtual_sol
pub fn get_sol_out(
    virtual_sol: u64,
    virtual_token: u64,
    tokens_in: u64,
) -> Result<u64> {
    require!(tokens_in > 0, CurveError::ZeroAmount);

    let k = (virtual_sol as u128)
        .checked_mul(virtual_token as u128)
        .ok_or(CurveError::MathOverflow)?;

    let new_virtual_token = (virtual_token as u128)
        .checked_add(tokens_in as u128)
        .ok_or(CurveError::MathOverflow)?;

    let new_virtual_sol = k
        .checked_div(new_virtual_token)
        .ok_or(CurveError::MathOverflow)?;

    let sol_out = (virtual_sol as u128)
        .checked_sub(new_virtual_sol)
        .ok_or(CurveError::InsufficientSolLiquidity)?;

    Ok(sol_out as u64)
}

/// Calculate the platform fee amount from a gross SOL value.
///
/// fee = gross_sol * fee_bps / 10_000   (integer, rounds down)
pub fn calc_fee(gross_sol: u64, fee_bps: u16) -> Result<u64> {
    let fee = (gross_sol as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(CurveError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(CurveError::MathOverflow)?;
    Ok(fee as u64)
}

/// Current token price in lamports per smallest token unit.
///
/// price = virtual_sol_reserve / virtual_token_reserve
///
/// Returns 0 if virtual_token_reserve is 0 (should never happen post-init).
pub fn current_price_lamports(virtual_sol: u64, virtual_token: u64) -> u64 {
    if virtual_token == 0 {
        return 0;
    }
    // Multiply by 1e9 to preserve precision (result is in nano-lamports per
    // smallest unit, caller divides by 1e9 to get lamports per token)
    ((virtual_sol as u128)
        .saturating_mul(1_000_000_000u128)
        .saturating_div(virtual_token as u128)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    // Pump.fun-style initial constants (for 9-decimal tokens)
    const INIT_VIRT_SOL: u64 = 30_000_000_000;            // 30 SOL in lamports
    const INIT_VIRT_TOKEN: u64 = 1_073_000_191_000_000_000; // ~1.073B tokens

    #[test]
    fn buy_increases_price() {
        let sol_in = 1_000_000_000u64; // 1 SOL
        let tokens_out = get_tokens_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, sol_in).unwrap();
        assert!(tokens_out > 0, "must receive tokens");

        let new_virt_sol = INIT_VIRT_SOL + sol_in;
        let new_virt_token = INIT_VIRT_TOKEN - tokens_out;
        let old_price = current_price_lamports(INIT_VIRT_SOL, INIT_VIRT_TOKEN);
        let new_price = current_price_lamports(new_virt_sol, new_virt_token);
        assert!(new_price > old_price, "price must rise after buy");
    }

    #[test]
    fn sell_decreases_price() {
        let tokens_in = 10_000_000_000_000u64; // 10,000 tokens
        let sol_out = get_sol_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, tokens_in).unwrap();
        assert!(sol_out > 0, "must receive SOL");

        let new_virt_token = INIT_VIRT_TOKEN + tokens_in;
        let new_virt_sol = INIT_VIRT_SOL - sol_out;
        let old_price = current_price_lamports(INIT_VIRT_SOL, INIT_VIRT_TOKEN);
        let new_price = current_price_lamports(new_virt_sol, new_virt_token);
        assert!(new_price < old_price, "price must fall after sell");
    }

    #[test]
    fn fee_calculation() {
        let gross = 1_000_000_000u64; // 1 SOL
        let fee = calc_fee(gross, 100).unwrap(); // 1%
        assert_eq!(fee, 10_000_000); // 0.01 SOL
    }

    #[test]
    fn zero_sol_in_fails() {
        let result = get_tokens_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, 0);
        assert!(result.is_err());
    }

    #[test]
    fn zero_tokens_in_fails() {
        let result = get_sol_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, 0);
        assert!(result.is_err());
    }
}
