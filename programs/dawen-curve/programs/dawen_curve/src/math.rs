/// DAWEN Bonding Curve Math — V1
///
/// Constant-product AMM with virtual reserves.
///
///   invariant: virtual_sol_reserve × virtual_token_reserve = k
///
/// V1 Tokenomics (6-decimal tokens, 1B total supply):
///
///   INIT_VIRTUAL_SOL   = 30_000_000_000       (30 SOL in lamports)
///   INIT_VIRTUAL_TOKEN = 1_073_000_191_000_000 (~1.073B tokens in raw units)
///
///   Initial price per token:
///     p = vSol / vToken × decimals_factor
///     = 30e9 / 1,073,000,191e6 × 1e6
///     ≈ 27.96 lamports/token
///
///   Initial market cap (all 1B tokens):
///     mcap = p × 1e9 tokens = 27.96 SOL
///     ≈ $2,500 at $89/SOL   (~$4,200 at $150/SOL)
///
///   Graduation: 85 SOL real SOL collected triggers status = Graduated.
///
/// All intermediate arithmetic uses u128 to prevent overflow when multiplying
/// two u64 reserve values.
use crate::errors::CurveError;
use anchor_lang::prelude::*;

/// Given net SOL input (after fee deduction), return tokens_out.
///
/// Formula (constant product):
///   k               = virtual_sol × virtual_token
///   new_virtual_sol = virtual_sol + sol_in
///   new_virtual_tok = k / new_virtual_sol      (floor division)
///   tokens_out      = virtual_token − new_virtual_tok
pub fn get_tokens_out(virtual_sol: u64, virtual_token: u64, sol_in: u64) -> Result<u64> {
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

/// Given a token input, return gross SOL output (before fee deduction).
///
/// Formula (constant product):
///   k               = virtual_sol × virtual_token
///   new_virtual_tok = virtual_token + tokens_in
///   new_virtual_sol = k / new_virtual_tok      (floor division)
///   sol_out         = virtual_sol − new_virtual_sol
pub fn get_sol_out(virtual_sol: u64, virtual_token: u64, tokens_in: u64) -> Result<u64> {
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

/// Calculate platform fee from a gross SOL amount.
///
///   fee = gross × fee_bps / 10_000   (integer, rounds down)
pub fn calc_fee(gross_sol: u64, fee_bps: u16) -> Result<u64> {
    let fee = (gross_sol as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(CurveError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(CurveError::MathOverflow)?;
    Ok(fee as u64)
}

/// Current token price in nano-lamports per raw unit (multiply by 1e-9 for lamports).
///
/// Caller should interpret: price_per_token_lamports = result × decimals_factor / 1e9
pub fn current_price_lamports(virtual_sol: u64, virtual_token: u64) -> u64 {
    if virtual_token == 0 {
        return 0;
    }
    ((virtual_sol as u128)
        .saturating_mul(1_000_000_000u128)
        .saturating_div(virtual_token as u128)) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    // V1 constants — 6-decimal token, 1B total supply
    const INIT_VIRT_SOL: u64 = 30_000_000_000; // 30 SOL
    const INIT_VIRT_TOKEN: u64 = 1_073_000_191_000_000; // ~1.073B tokens raw

    // 1B tokens × 10^6 = 1_000_000_000_000_000 raw units
    const TOTAL_SUPPLY_RAW: u64 = 1_000_000_000_000_000;
    // 950M tokens × 10^6
    const CURVE_ALLOC_RAW: u64 = 950_000_000_000_000;
    // 50M tokens × 10^6
    const CREATOR_ALLOC_RAW: u64 = 50_000_000_000_000;

    #[test]
    fn allocation_split_sums_to_total() {
        assert_eq!(CURVE_ALLOC_RAW + CREATOR_ALLOC_RAW, TOTAL_SUPPLY_RAW);
    }

    #[test]
    fn buy_price_calculation() {
        let sol_in = 1_000_000_000u64; // 1 SOL
        let tokens_out = get_tokens_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, sol_in).unwrap();
        assert!(tokens_out > 0, "must receive tokens");

        // Verify reserve invariant k' ≥ k (floor division means k' can be slightly > k)
        let k = (INIT_VIRT_SOL as u128) * (INIT_VIRT_TOKEN as u128);
        let new_sol = (INIT_VIRT_SOL + sol_in) as u128;
        let new_token = (INIT_VIRT_TOKEN - tokens_out) as u128;
        assert!(new_sol * new_token >= k, "invariant k must be maintained");
    }

    #[test]
    fn sell_price_calculation() {
        let tokens_in = 10_000_000_000_000u64; // 10M tokens raw
        let sol_out = get_sol_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, tokens_in).unwrap();
        assert!(sol_out > 0, "must receive SOL");
    }

    #[test]
    fn buy_increases_price() {
        let sol_in = 1_000_000_000u64;
        let tokens_out = get_tokens_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, sol_in).unwrap();
        let new_sol = INIT_VIRT_SOL + sol_in;
        let new_token = INIT_VIRT_TOKEN - tokens_out;

        let old_price = current_price_lamports(INIT_VIRT_SOL, INIT_VIRT_TOKEN);
        let new_price = current_price_lamports(new_sol, new_token);
        assert!(new_price > old_price, "price must rise after buy");
    }

    #[test]
    fn sell_decreases_price() {
        let tokens_in = 10_000_000_000_000u64;
        let sol_out = get_sol_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, tokens_in).unwrap();
        let new_sol = INIT_VIRT_SOL - sol_out;
        let new_token = INIT_VIRT_TOKEN + tokens_in;

        let old_price = current_price_lamports(INIT_VIRT_SOL, INIT_VIRT_TOKEN);
        let new_price = current_price_lamports(new_sol, new_token);
        assert!(new_price < old_price, "price must fall after sell");
    }

    #[test]
    fn fee_1_percent() {
        let gross = 1_000_000_000u64; // 1 SOL
        let fee = calc_fee(gross, 100).unwrap(); // 1%
        assert_eq!(fee, 10_000_000); // 0.01 SOL
    }

    #[test]
    fn zero_fee_bps() {
        let gross = 1_000_000_000u64;
        let fee = calc_fee(gross, 0).unwrap();
        assert_eq!(fee, 0);
    }

    #[test]
    fn zero_sol_in_fails() {
        assert!(get_tokens_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, 0).is_err());
    }

    #[test]
    fn zero_tokens_in_fails() {
        assert!(get_sol_out(INIT_VIRT_SOL, INIT_VIRT_TOKEN, 0).is_err());
    }

    #[test]
    fn initial_market_cap_approx() {
        // mcap_lamports = price_per_raw × total_supply_raw
        // = virtual_sol / virtual_token × total_supply_raw
        let mcap_lamports = (INIT_VIRT_SOL as u128)
            * (TOTAL_SUPPLY_RAW as u128)
            / (INIT_VIRT_TOKEN as u128);
        let mcap_sol = mcap_lamports as f64 / 1e9;
        // Should be ~27.96 SOL ≈ $2,500 at $89/SOL
        assert!(
            mcap_sol > 25.0 && mcap_sol < 35.0,
            "initial mcap should be ~28 SOL, got {}",
            mcap_sol
        );
    }
}
