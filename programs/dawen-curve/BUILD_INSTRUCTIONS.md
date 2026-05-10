# DAWEN Bonding Curve — Build & Deploy Instructions

A pump.fun-style virtual-reserve bonding curve for DAWEN token launches on Solana.

---

## Prerequisites

Install the following tools before building:

```bash
# 1. Rust (stable)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update stable

# 2. Solana CLI (1.18+)
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
solana --version

# 3. Anchor CLI (0.29.0)
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.29.0
avm use 0.29.0
anchor --version

# 4. Node.js dependencies (for tests)
cd programs/dawen-curve
yarn install    # or: npm install
```

---

## Directory Structure

```
programs/dawen-curve/
├── Anchor.toml                          workspace config + program IDs
├── Cargo.toml                           Rust workspace
├── package.json                         Node deps for tests
├── tsconfig.json
├── BUILD_INSTRUCTIONS.md                this file
├── programs/
│   └── dawen_curve/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs                   program entry + instruction routing
│           ├── state.rs                 LaunchState account definition
│           ├── errors.rs                custom error codes
│           ├── math.rs                  constant-product curve math
│           └── instructions/
│               ├── mod.rs
│               ├── initialize_launch.rs
│               ├── buy.rs
│               ├── sell.rs
│               └── graduate.rs
└── tests/
    └── dawen_curve.ts                   full Anchor test suite
```

---

## Build

```bash
cd programs/dawen-curve
anchor build
```

The compiled `.so` binary is written to `target/deploy/dawen_curve.so`.
The IDL is written to `target/idl/dawen_curve.json`.
TypeScript types are at `target/types/dawen_curve.ts`.

---

## Program ID

The `declare_id!` placeholder in `src/lib.rs` and `Anchor.toml` is:

```
DCurve1vZEq4cPjhfRDsGBrXJGBnwuQ8LqFp5gNmpBJv
```

**Before deploying**, generate the real program keypair:

```bash
# Generate keypair
solana-keygen new -o target/deploy/dawen_curve-keypair.json

# Get the address
anchor keys list

# Paste the address into:
#   programs/dawen_curve/src/lib.rs → declare_id!("...")
#   Anchor.toml → [programs.mainnet] dawen_curve = "..."

# Rebuild
anchor build
```

---

## Tests (local validator)

```bash
cd programs/dawen-curve
anchor test
```

This automatically:
1. Starts a local Solana test validator
2. Deploys the program
3. Runs all TypeScript test cases

To run against a running validator:

```bash
anchor test --skip-local-validator
```

Test cases cover:
- `initialize_launch` — state setup, token vault transfer, invalid args rejection
- `buy` — tokens received, vault balance, fee to treasury, reserve updates, slippage, price rise
- `sell` — SOL received, token balance decrease, fee to treasury, reserve updates, slippage, price fall
- `graduation` — auto-graduate on threshold, explicit graduate, buy/sell blocked post-graduation
- `vault integrity` — SOL vault matches `realSolCollected`

---

## Deploying to Mainnet

```bash
# Set keypair for fee payer
solana config set --keypair ~/.config/solana/id.json

# Set cluster to mainnet
solana config set --url mainnet-beta

# Deploy (requires SOL for rent + fees)
anchor deploy --provider.cluster mainnet
```

After successful deployment:

1. Note the program ID from `anchor keys list`
2. Update `declare_id!` in `lib.rs` and `Anchor.toml`
3. Share the IDL (`target/idl/dawen_curve.json`) with the frontend team for
   frontend integration (kept separate per spec)

---

## Program Design Notes

### Bonding Curve

Uses a constant-product invariant: `k = virtual_sol_reserve × virtual_token_reserve`

**Buy:**
```
net_sol = sol_in - platform_fee
new_vSol = virtual_sol_reserve + net_sol
tokens_out = virtual_token_reserve - (k / new_vSol)
```

**Sell:**
```
new_vToken = virtual_token_reserve + tokens_in
gross_sol = virtual_sol_reserve - (k / new_vToken)
net_sol = gross_sol - platform_fee
```

### Recommended Initial Parameters

| Parameter                | Value                         |
|--------------------------|-------------------------------|
| `virtual_sol_reserve`    | 30 SOL (30,000,000,000 lamports) |
| `virtual_token_reserve`  | 1,073,000,191 × 10^decimals   |
| `curve_token_allocation` | 793,100,000 × 10^decimals     |
| `graduation_threshold`   | 85 SOL (85,000,000,000 lamports) |
| `platform_fee_bps`       | 100 (1%)                      |

### Treasury

Platform fees go atomically to:
```
FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X
```

### Security

- All overflows use checked arithmetic with `CurveError::MathOverflow`
- Virtual reserves validated at init (> 0, allocation ≤ reserve)
- Platform fee capped at 10% (`fee_bps ≤ 1000`)
- Slippage enforced on every buy/sell
- SOL vault and token vault are program-owned PDAs — no user or creator can withdraw
- Treasury address is hardcoded as a `const Pubkey`, verified on-chain in every buy/sell
- Buy and sell permanently blocked after graduation

---

## Next Steps (NOT in scope for this PR)

- `migrate_to_raydium` / `migrate_to_meteora` instruction — moves graduated SOL + tokens to a DEX pool
- Frontend integration (kept separate per spec)
- Upgrade authority management
- Admin pause/resume instruction
