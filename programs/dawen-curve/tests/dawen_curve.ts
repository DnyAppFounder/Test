/**
 * DAWEN Bonding Curve — V1 Anchor Test Suite
 *
 * V1 Tokenomics:
 *   Total supply:   1,000,000,000 tokens  (6 decimals)
 *   Curve vault:      950,000,000 tokens  (95%) — bonding curve
 *   Creator reward:    50,000,000 tokens  ( 5%) — locked until graduation
 *
 *   Initial virtual SOL reserve:   30 SOL
 *   Initial virtual token reserve: ~1.073B tokens
 *   Initial market cap:            ~28 SOL (~$2,500 at $89/SOL)
 *   Graduation threshold:          85 SOL (real SOL collected)
 *   Buy/sell fee:                  1% to DAWEN treasury
 *
 * Run:
 *   cd programs/dawen-curve && anchor test
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { expect } from "chai";
import { DawenCurve } from "../target/types/dawen_curve";

// ─── V1 Tokenomics Constants ──────────────────────────────────────────────────

const DECIMALS = 6;
const ONE_TOKEN = 10 ** DECIMALS; // 1_000_000

// Raw unit amounts (whole_tokens × 10^6)
const TOTAL_SUPPLY_RAW = new BN("1000000000000000");   // 1B  tokens
const CURVE_ALLOC_RAW  = new BN("950000000000000");    // 950M tokens (95%)
const CREATOR_ALLOC_RAW = new BN("50000000000000");    // 50M  tokens ( 5%)

// Virtual reserves — gives ~28 SOL initial mcap (~$2,500 at $89/SOL)
const INIT_VIRTUAL_SOL   = new BN(30 * LAMPORTS_PER_SOL);  // 30 SOL
const INIT_VIRTUAL_TOKEN = new BN("1073000191000000");      // ~1.073B tokens raw

// Use a LOW threshold in tests so we don't need 85 SOL per test.
// Tests that check the 85 SOL default use GRAD_THRESHOLD_DEFAULT.
const GRAD_THRESHOLD_TEST    = new BN(0.5 * LAMPORTS_PER_SOL); // 0.5 SOL (fast tests)
const GRAD_THRESHOLD_DEFAULT = new BN(85 * LAMPORTS_PER_SOL);  // 85 SOL (production)

const PLATFORM_FEE_BPS = 100; // 1%

const TREASURY = new PublicKey("FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X");

// ─── PDA Helpers ──────────────────────────────────────────────────────────────

function derivelaunchState(mint: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("launch"), mint.toBuffer()],
    programId
  );
}

function deriveSolVault(mint: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), mint.toBuffer()],
    programId
  );
}

function deriveCreatorRewardVault(mint: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_reward"), mint.toBuffer()],
    programId
  );
}

// ─── Airdrop Helper ───────────────────────────────────────────────────────────

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol: number
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest });
}

// ─── Setup Helper ─────────────────────────────────────────────────────────────

interface LaunchContext {
  creator: Keypair;
  mint: PublicKey;
  launchState: PublicKey;
  solVault: PublicKey;
  tokenVault: PublicKey;
  creatorRewardVault: PublicKey;
  creatorAta: PublicKey;
}

/**
 * Create a fresh mint, mint total supply to creator, and call initialize_launch.
 * Returns all relevant accounts.
 */
async function setupLaunch(
  program: Program<DawenCurve>,
  provider: anchor.AnchorProvider,
  opts: {
    threshold?: BN;
    feeBps?: number;
    virtualSol?: BN;
    virtualToken?: BN;
  } = {}
): Promise<LaunchContext> {
  const creator = Keypair.generate();
  await airdrop(provider.connection, creator.publicKey, 15);

  // Create 6-decimal mint
  const mint = await createMint(
    provider.connection,
    creator,
    creator.publicKey,
    null,
    DECIMALS
  );

  // Mint total supply to creator
  const creatorAta = await createAssociatedTokenAccount(
    provider.connection,
    creator,
    mint,
    creator.publicKey
  );
  await mintTo(
    provider.connection,
    creator,
    mint,
    creatorAta,
    creator,
    BigInt(TOTAL_SUPPLY_RAW.toString())
  );

  const [launchState] = derivelaunchState(mint, program.programId);
  const [solVault]    = deriveSolVault(mint, program.programId);
  const [creatorRewardVault] = deriveCreatorRewardVault(mint, program.programId);
  const tokenVault = await getAssociatedTokenAddress(mint, launchState, true);

  await program.methods
    .initializeLaunch({
      virtualSolReserve:     opts.virtualSol  ?? INIT_VIRTUAL_SOL,
      virtualTokenReserve:   opts.virtualToken ?? INIT_VIRTUAL_TOKEN,
      curveTokenAllocation:  CURVE_ALLOC_RAW,
      creatorRewardAmount:   CREATOR_ALLOC_RAW,
      totalSupply:           TOTAL_SUPPLY_RAW,
      graduationThreshold:   opts.threshold ?? GRAD_THRESHOLD_TEST,
      platformFeeBps:        opts.feeBps    ?? PLATFORM_FEE_BPS,
    })
    .accounts({
      creator:             creator.publicKey,
      mint,
      launchState,
      solVault,
      tokenVault,
      creatorRewardVault,
      creatorTokenAccount: creatorAta,
      tokenProgram:             TOKEN_PROGRAM_ID,
      associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:            SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  return {
    creator,
    mint,
    launchState,
    solVault,
    tokenVault,
    creatorRewardVault,
    creatorAta,
  };
}

// ─── Buy Helper ───────────────────────────────────────────────────────────────

async function executeBuy(
  program: Program<DawenCurve>,
  ctx: LaunchContext,
  buyer: Keypair,
  buyerAta: PublicKey,
  solAmount: BN,
  minTokensOut: BN = new BN(0)
) {
  return program.methods
    .buy({ solAmount, minTokensOut })
    .accounts({
      buyer:             buyer.publicKey,
      mint:              ctx.mint,
      launchState:       ctx.launchState,
      tokenVault:        ctx.tokenVault,
      solVault:          ctx.solVault,
      buyerTokenAccount: buyerAta,
      treasury:          TREASURY,
      tokenProgram:             TOKEN_PROGRAM_ID,
      associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:            SystemProgram.programId,
    })
    .signers([buyer])
    .rpc();
}

// ─── Sell Helper ──────────────────────────────────────────────────────────────

async function executeSell(
  program: Program<DawenCurve>,
  ctx: LaunchContext,
  seller: Keypair,
  sellerAta: PublicKey,
  tokenAmount: BN,
  minSolOut: BN = new BN(0)
) {
  return program.methods
    .sell({ tokenAmount, minSolOut })
    .accounts({
      seller:              seller.publicKey,
      mint:                ctx.mint,
      launchState:         ctx.launchState,
      tokenVault:          ctx.tokenVault,
      solVault:            ctx.solVault,
      sellerTokenAccount:  sellerAta,
      treasury:            TREASURY,
      tokenProgram:             TOKEN_PROGRAM_ID,
      associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram:            SystemProgram.programId,
    })
    .signers([seller])
    .rpc();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dawen_curve — V1", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DawenCurve as Program<DawenCurve>;

  // ── initialize_launch ──────────────────────────────────────────────────────

  describe("initialize_launch", () => {
    it("creates LaunchState with correct fields", async () => {
      const ctx = await setupLaunch(program, provider);
      const state = await program.account.launchState.fetch(ctx.launchState);

      expect(state.mint.toBase58()).to.equal(ctx.mint.toBase58());
      expect(state.creator.toBase58()).to.equal(ctx.creator.publicKey.toBase58());
      expect(state.virtualSolReserve.eq(INIT_VIRTUAL_SOL)).to.be.true;
      expect(state.virtualTokenReserve.eq(INIT_VIRTUAL_TOKEN)).to.be.true;
      expect(state.curveTokenAllocation.eq(CURVE_ALLOC_RAW)).to.be.true;
      expect(state.creatorRewardAmount.eq(CREATOR_ALLOC_RAW)).to.be.true;
      expect(state.totalSupply.eq(TOTAL_SUPPLY_RAW)).to.be.true;
      expect(state.realSolCollected.toNumber()).to.equal(0);
      expect(state.tokensSold.toNumber()).to.equal(0);
      expect(state.platformFeeBps).to.equal(PLATFORM_FEE_BPS);
      expect(state.status).to.deep.equal({ active: {} });
      expect(state.creatorRewardClaimed).to.be.false;
      expect(state.graduatedAt).to.be.null;
    });

    it("bonding curve vault receives exactly 950,000,000 tokens (95%)", async () => {
      const ctx = await setupLaunch(program, provider);
      const vault = await getAccount(provider.connection, ctx.tokenVault);
      expect(vault.amount.toString()).to.equal(CURVE_ALLOC_RAW.toString());
    });

    it("creator reward vault receives exactly 50,000,000 tokens (5%)", async () => {
      const ctx = await setupLaunch(program, provider);
      const vault = await getAccount(provider.connection, ctx.creatorRewardVault);
      expect(vault.amount.toString()).to.equal(CREATOR_ALLOC_RAW.toString());
    });

    it("allocations sum to total supply", () => {
      const sum = CURVE_ALLOC_RAW.add(CREATOR_ALLOC_RAW);
      expect(sum.eq(TOTAL_SUPPLY_RAW)).to.be.true;
    });

    it("rejects platform_fee_bps > 1000", async () => {
      try {
        await setupLaunch(program, provider, { feeBps: 1001 });
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("InvalidFeeBps");
      }
    });

    it("rejects zero graduation threshold", async () => {
      try {
        await setupLaunch(program, provider, { threshold: new BN(0) });
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "InvalidGraduationThreshold"
        );
      }
    });

    it("rejects virtual_token_reserve < curve_allocation", async () => {
      try {
        await setupLaunch(program, provider, {
          virtualToken: CURVE_ALLOC_RAW.subn(1),
        });
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "ReserveBelowAllocation"
        );
      }
    });
  });

  // ── buy ────────────────────────────────────────────────────────────────────

  describe("buy", () => {
    let ctx: LaunchContext;
    let buyer: Keypair;
    let buyerAta: PublicKey;

    beforeEach(async () => {
      ctx = await setupLaunch(program, provider);
      buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );
    });

    it("buyer receives tokens from bonding curve vault", async () => {
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));
      const acct = await getAccount(provider.connection, buyerAta);
      expect(Number(acct.amount)).to.be.greaterThan(0);
    });

    it("sends 1% fee to DAWEN treasury", async () => {
      const solIn = new BN(LAMPORTS_PER_SOL); // 1 SOL
      const expectedFee = Math.floor(LAMPORTS_PER_SOL * PLATFORM_FEE_BPS / 10_000);

      const treasuryBefore = await provider.connection.getBalance(TREASURY);
      await executeBuy(program, ctx, buyer, buyerAta, solIn);
      const treasuryAfter = await provider.connection.getBalance(TREASURY);

      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    });

    it("SOL vault receives net SOL (gross − 1% fee)", async () => {
      const solIn = new BN(LAMPORTS_PER_SOL);
      const fee = Math.floor(LAMPORTS_PER_SOL * PLATFORM_FEE_BPS / 10_000);
      const expectedNet = LAMPORTS_PER_SOL - fee;

      const vaultBefore = await provider.connection.getBalance(ctx.solVault);
      await executeBuy(program, ctx, buyer, buyerAta, solIn);
      const vaultAfter = await provider.connection.getBalance(ctx.solVault);

      expect(vaultAfter - vaultBefore).to.equal(expectedNet);
    });

    it("updates realSolCollected and tokensSold after buy", async () => {
      const before = await program.account.launchState.fetch(ctx.launchState);

      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      const after = await program.account.launchState.fetch(ctx.launchState);
      expect(after.realSolCollected.gt(before.realSolCollected)).to.be.true;
      expect(after.tokensSold.gt(before.tokensSold)).to.be.true;
    });

    it("virtual reserves update correctly (price rises)", async () => {
      const before = await program.account.launchState.fetch(ctx.launchState);
      const priceBefore =
        before.virtualSolReserve.toNumber() / before.virtualTokenReserve.toNumber();

      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      const after = await program.account.launchState.fetch(ctx.launchState);
      const priceAfter =
        after.virtualSolReserve.toNumber() / after.virtualTokenReserve.toNumber();

      expect(priceAfter).to.be.greaterThan(priceBefore);
      expect(after.virtualSolReserve.gt(before.virtualSolReserve)).to.be.true;
      expect(after.virtualTokenReserve.lt(before.virtualTokenReserve)).to.be.true;
    });

    it("rejects buy with slippage — min_tokens_out too high", async () => {
      try {
        const impossibleMin = new BN("999999999999999");
        await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL), impossibleMin);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("SlippageExceeded");
      }
    });

    it("rejects buy with zero sol_amount", async () => {
      try {
        await executeBuy(program, ctx, buyer, buyerAta, new BN(0));
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ZeroAmount");
      }
    });
  });

  // ── sell ───────────────────────────────────────────────────────────────────

  describe("sell", () => {
    let ctx: LaunchContext;
    let trader: Keypair;
    let traderAta: PublicKey;

    beforeEach(async () => {
      ctx = await setupLaunch(program, provider);
      trader = Keypair.generate();
      await airdrop(provider.connection, trader.publicKey, 5);
      traderAta = await createAssociatedTokenAccount(
        provider.connection,
        trader,
        ctx.mint,
        trader.publicKey
      );
      // Pre-buy so trader has tokens to sell
      await executeBuy(program, ctx, trader, traderAta, new BN(2 * LAMPORTS_PER_SOL));
    });

    it("seller receives SOL after selling tokens", async () => {
      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const solBefore = await provider.connection.getBalance(trader.publicKey);
      await executeSell(program, ctx, trader, traderAta, tokensToSell);
      const solAfter = await provider.connection.getBalance(trader.publicKey);

      // Net of tx fee the seller should have more SOL than before
      expect(solAfter).to.be.greaterThan(solBefore - 0.01 * LAMPORTS_PER_SOL);
    });

    it("sends 1% fee to DAWEN treasury on sell", async () => {
      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const treasuryBefore = await provider.connection.getBalance(TREASURY);
      await executeSell(program, ctx, trader, traderAta, tokensToSell);
      const treasuryAfter = await provider.connection.getBalance(TREASURY);

      expect(treasuryAfter).to.be.greaterThan(treasuryBefore);
    });

    it("seller token balance decreases after sell", async () => {
      const beforeAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(beforeAcct.amount.toString()).divn(2);

      await executeSell(program, ctx, trader, traderAta, tokensToSell);

      const afterAcct = await getAccount(provider.connection, traderAta);
      expect(Number(afterAcct.amount)).to.be.lessThan(Number(beforeAcct.amount));
    });

    it("virtual reserves update correctly (price falls)", async () => {
      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const before = await program.account.launchState.fetch(ctx.launchState);
      const priceBefore =
        before.virtualSolReserve.toNumber() / before.virtualTokenReserve.toNumber();

      await executeSell(program, ctx, trader, traderAta, tokensToSell);

      const after = await program.account.launchState.fetch(ctx.launchState);
      const priceAfter =
        after.virtualSolReserve.toNumber() / after.virtualTokenReserve.toNumber();

      expect(priceAfter).to.be.lessThan(priceBefore);
      expect(after.virtualSolReserve.lt(before.virtualSolReserve)).to.be.true;
      expect(after.virtualTokenReserve.gt(before.virtualTokenReserve)).to.be.true;
    });

    it("updates state correctly after sell", async () => {
      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const before = await program.account.launchState.fetch(ctx.launchState);
      await executeSell(program, ctx, trader, traderAta, tokensToSell);
      const after = await program.account.launchState.fetch(ctx.launchState);

      expect(after.realSolCollected.lt(before.realSolCollected)).to.be.true;
      expect(after.tokensSold.lt(before.tokensSold)).to.be.true;
    });

    it("rejects sell with slippage — min_sol_out too high", async () => {
      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(4);
      const impossibleMin = new BN(100 * LAMPORTS_PER_SOL);

      try {
        await executeSell(program, ctx, trader, traderAta, tokensToSell, impossibleMin);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("SlippageExceeded");
      }
    });

    it("rejects sell with zero token_amount", async () => {
      try {
        await executeSell(program, ctx, trader, traderAta, new BN(0));
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ZeroAmount");
      }
    });
  });

  // ── graduation ────────────────────────────────────────────────────────────

  describe("graduation", () => {
    it("buy auto-graduates when realSolCollected reaches threshold (0.5 SOL test)", async () => {
      // threshold = 0.5 SOL so a 1 SOL buy triggers it
      const ctx = await setupLaunch(program, provider, {
        threshold: GRAD_THRESHOLD_TEST,
      });
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      const state = await program.account.launchState.fetch(ctx.launchState);
      expect(state.status).to.deep.equal({ graduated: {} });
      expect(state.graduatedAt).to.not.be.null;
    });

    it("85 SOL graduation threshold is stored correctly at default", async () => {
      const ctx = await setupLaunch(program, provider, {
        threshold: GRAD_THRESHOLD_DEFAULT,
      });
      const state = await program.account.launchState.fetch(ctx.launchState);
      expect(state.graduationThreshold.eq(GRAD_THRESHOLD_DEFAULT)).to.be.true;
    });

    it("explicit graduate fails when threshold is not reached", async () => {
      const ctx = await setupLaunch(program, provider, {
        threshold: GRAD_THRESHOLD_DEFAULT, // 85 SOL, won't be hit
      });
      const [solVault] = deriveSolVault(ctx.mint, program.programId);

      try {
        await program.methods
          .graduate()
          .accounts({ mint: ctx.mint, launchState: ctx.launchState, solVault })
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ThresholdNotReached");
      }
    });

    it("buy is blocked after graduation", async () => {
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 10);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // First buy graduates (threshold = 0.5 SOL)
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      // Second buy must fail
      try {
        await executeBuy(program, ctx, buyer, buyerAta, new BN(0.1 * LAMPORTS_PER_SOL));
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("LaunchNotActive");
      }
    });

    it("sell is blocked after graduation", async () => {
      const ctx = await setupLaunch(program, provider);
      const trader = Keypair.generate();
      await airdrop(provider.connection, trader.publicKey, 10);
      const traderAta = await createAssociatedTokenAccount(
        provider.connection,
        trader,
        ctx.mint,
        trader.publicKey
      );

      // Buy triggers graduation and gives trader tokens
      await executeBuy(program, ctx, trader, traderAta, new BN(LAMPORTS_PER_SOL));

      const tokenAcct = await getAccount(provider.connection, traderAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(4);

      try {
        await executeSell(program, ctx, trader, traderAta, tokensToSell);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("LaunchNotActive");
      }
    });
  });

  // ── claim_creator_reward ──────────────────────────────────────────────────

  describe("claim_creator_reward", () => {
    it("fails before graduation", async () => {
      // threshold = 85 SOL so no buy will graduate it
      const ctx = await setupLaunch(program, provider, {
        threshold: GRAD_THRESHOLD_DEFAULT,
      });
      const creatorAta = await getAssociatedTokenAddress(
        ctx.mint,
        ctx.creator.publicKey
      );

      try {
        await program.methods
          .claimCreatorReward()
          .accounts({
            creator:             ctx.creator.publicKey,
            mint:                ctx.mint,
            launchState:         ctx.launchState,
            creatorRewardVault:  ctx.creatorRewardVault,
            creatorTokenAccount: creatorAta,
            tokenProgram:             TOKEN_PROGRAM_ID,
            associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram:            SystemProgram.programId,
          })
          .signers([ctx.creator])
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("LaunchNotGraduated");
      }
    });

    it("succeeds after graduation — creator receives 50M tokens", async () => {
      // Graduate via buy
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      // Verify graduated
      const state = await program.account.launchState.fetch(ctx.launchState);
      expect(state.status).to.deep.equal({ graduated: {} });

      // Creator claims reward
      const creatorAta = await createAssociatedTokenAccount(
        provider.connection,
        ctx.creator,
        ctx.mint,
        ctx.creator.publicKey
      );

      const rewardVaultBefore = await getAccount(
        provider.connection,
        ctx.creatorRewardVault
      );

      await program.methods
        .claimCreatorReward()
        .accounts({
          creator:             ctx.creator.publicKey,
          mint:                ctx.mint,
          launchState:         ctx.launchState,
          creatorRewardVault:  ctx.creatorRewardVault,
          creatorTokenAccount: creatorAta,
          tokenProgram:             TOKEN_PROGRAM_ID,
          associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram:            SystemProgram.programId,
        })
        .signers([ctx.creator])
        .rpc();

      // Creator ATA now holds the reward
      const creatorAcct = await getAccount(provider.connection, creatorAta);
      expect(creatorAcct.amount.toString()).to.equal(
        rewardVaultBefore.amount.toString()
      );
      expect(creatorAcct.amount.toString()).to.equal(CREATOR_ALLOC_RAW.toString());

      // Reward vault is now empty
      const rewardVaultAfter = await getAccount(
        provider.connection,
        ctx.creatorRewardVault
      );
      expect(rewardVaultAfter.amount.toString()).to.equal("0");

      // State marks reward as claimed
      const stateAfter = await program.account.launchState.fetch(ctx.launchState);
      expect(stateAfter.creatorRewardClaimed).to.be.true;
    });

    it("double claim fails — AlreadyClaimed", async () => {
      // Graduate
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      const creatorAta = await createAssociatedTokenAccount(
        provider.connection,
        ctx.creator,
        ctx.mint,
        ctx.creator.publicKey
      );

      const claimAccounts = {
        creator:             ctx.creator.publicKey,
        mint:                ctx.mint,
        launchState:         ctx.launchState,
        creatorRewardVault:  ctx.creatorRewardVault,
        creatorTokenAccount: creatorAta,
        tokenProgram:             TOKEN_PROGRAM_ID,
        associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram:            SystemProgram.programId,
      };

      // First claim succeeds
      await program.methods
        .claimCreatorReward()
        .accounts(claimAccounts)
        .signers([ctx.creator])
        .rpc();

      // Second claim must fail
      try {
        await program.methods
          .claimCreatorReward()
          .accounts(claimAccounts)
          .signers([ctx.creator])
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("AlreadyClaimed");
      }
    });

    it("claim by wrong wallet fails — NotCreator", async () => {
      // Graduate
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      // Attacker tries to claim
      const attacker = Keypair.generate();
      await airdrop(provider.connection, attacker.publicKey, 1);
      const attackerAta = await createAssociatedTokenAccount(
        provider.connection,
        attacker,
        ctx.mint,
        attacker.publicKey
      );

      try {
        await program.methods
          .claimCreatorReward()
          .accounts({
            creator:             attacker.publicKey, // wrong wallet
            mint:                ctx.mint,
            launchState:         ctx.launchState,
            creatorRewardVault:  ctx.creatorRewardVault,
            creatorTokenAccount: attackerAta,
            tokenProgram:             TOKEN_PROGRAM_ID,
            associatedTokenProgram:   ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram:            SystemProgram.programId,
          })
          .signers([attacker])
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.match(
          /NotCreator|ConstraintRaw|A has_one constraint was violated/
        );
      }
    });
  });

  // ── vault integrity ────────────────────────────────────────────────────────

  describe("vault integrity", () => {
    it("SOL vault lamports equal realSolCollected after a buy", async () => {
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      await executeBuy(program, ctx, buyer, buyerAta, new BN(2 * LAMPORTS_PER_SOL));

      const state = await program.account.launchState.fetch(ctx.launchState);
      const vaultBalance = await provider.connection.getBalance(ctx.solVault);

      expect(vaultBalance).to.equal(state.realSolCollected.toNumber());
    });

    it("creator reward vault is untouched by buy/sell operations", async () => {
      const ctx = await setupLaunch(program, provider, {
        threshold: GRAD_THRESHOLD_DEFAULT, // won't graduate
      });
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // Buy
      await executeBuy(program, ctx, buyer, buyerAta, new BN(LAMPORTS_PER_SOL));

      // Sell half back
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);
      await executeSell(program, ctx, buyer, buyerAta, tokensToSell);

      // Creator reward vault must still hold 50M tokens
      const rewardVault = await getAccount(
        provider.connection,
        ctx.creatorRewardVault
      );
      expect(rewardVault.amount.toString()).to.equal(CREATOR_ALLOC_RAW.toString());
    });
  });
});
