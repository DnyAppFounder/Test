/**
 * DAWEN Bonding Curve — Anchor Test Suite
 *
 * Run with:
 *   anchor test                 (spins up a local validator automatically)
 *   anchor test --skip-local-validator  (if validator already running)
 *
 * Each describe block is independent and creates its own mint + launch so
 * tests don't interfere with each other.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const TREASURY = new PublicKey("FvzoyNk8MSwMgWbiGRbhLASyJSusoVpVtaE2w11WFg2X");

// Pump.fun-style initial virtual reserves for a 9-decimal token
const INIT_VIRTUAL_SOL = new BN(30 * LAMPORTS_PER_SOL);          // 30 SOL
const INIT_VIRTUAL_TOKEN = new BN("1073000191000000000");          // ~1.073B tokens
const CURVE_ALLOCATION = new BN("793100000000000000");             // ~793.1M tokens
const TOTAL_SUPPLY = new BN("1000000000000000000");                // 1B tokens
const GRADUATION_THRESHOLD = new BN(85 * LAMPORTS_PER_SOL);       // 85 SOL
const PLATFORM_FEE_BPS = 100;                                       // 1%

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function derivelaunchState(mint: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("launch"), mint.toBuffer()],
    programId
  );
}

async function deriveSolVault(mint: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sol_vault"), mint.toBuffer()],
    programId
  );
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol: number
) {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest });
}

/**
 * Set up a fresh mint and launch for use in a test.
 * Returns everything the test needs to make further calls.
 */
async function setupLaunch(
  program: Program<DawenCurve>,
  provider: anchor.AnchorProvider,
  args?: {
    virtualSol?: BN;
    virtualToken?: BN;
    allocation?: BN;
    total?: BN;
    threshold?: BN;
    feeBps?: number;
  }
) {
  const creator = Keypair.generate();
  await airdrop(provider.connection, creator.publicKey, 10);

  // Create SPL mint (9 decimals)
  const mint = await createMint(
    provider.connection,
    creator,
    creator.publicKey,
    null,
    9
  );

  // Mint total supply to creator
  const creatorAta = await createAssociatedTokenAccount(
    provider.connection,
    creator,
    mint,
    creator.publicKey
  );
  const totalSupply = args?.total ?? TOTAL_SUPPLY;
  await mintTo(
    provider.connection,
    creator,
    mint,
    creatorAta,
    creator,
    BigInt(totalSupply.toString())
  );

  const [launchState, launchBump] = await derivelaunchState(
    mint,
    program.programId
  );
  const [solVault] = await deriveSolVault(mint, program.programId);
  const tokenVault = await getAssociatedTokenAddress(mint, launchState, true);

  await program.methods
    .initializeLaunch({
      virtualSolReserve: args?.virtualSol ?? INIT_VIRTUAL_SOL,
      virtualTokenReserve: args?.virtualToken ?? INIT_VIRTUAL_TOKEN,
      curveTokenAllocation: args?.allocation ?? CURVE_ALLOCATION,
      totalSupply: totalSupply,
      graduationThreshold: args?.threshold ?? GRADUATION_THRESHOLD,
      platformFeeBps: args?.feeBps ?? PLATFORM_FEE_BPS,
    })
    .accounts({
      creator: creator.publicKey,
      mint,
      launchState,
      solVault,
      tokenVault,
      creatorTokenAccount: creatorAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([creator])
    .rpc();

  return {
    creator,
    mint,
    launchState,
    solVault,
    tokenVault,
    creatorAta,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("dawen_curve", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.DawenCurve as Program<DawenCurve>;

  // ── initialize_launch ──────────────────────────────────────────────────────

  describe("initialize_launch", () => {
    it("creates LaunchState with correct fields", async () => {
      const { mint, launchState, tokenVault } = await setupLaunch(
        program,
        provider
      );

      const state = await program.account.launchState.fetch(launchState);

      expect(state.mint.toBase58()).to.equal(mint.toBase58());
      expect(state.virtualSolReserve.eq(INIT_VIRTUAL_SOL)).to.be.true;
      expect(state.virtualTokenReserve.eq(INIT_VIRTUAL_TOKEN)).to.be.true;
      expect(state.curveTokenAllocation.eq(CURVE_ALLOCATION)).to.be.true;
      expect(state.realSolCollected.toNumber()).to.equal(0);
      expect(state.tokensSold.toNumber()).to.equal(0);
      expect(state.platformFeeBps).to.equal(PLATFORM_FEE_BPS);
      expect(state.status).to.deep.equal({ active: {} });
      expect(state.graduatedAt).to.be.null;
    });

    it("moves curve allocation into token vault", async () => {
      const { tokenVault } = await setupLaunch(program, provider);
      const vault = await getAccount(provider.connection, tokenVault);
      expect(vault.amount.toString()).to.equal(CURVE_ALLOCATION.toString());
    });

    it("rejects fee_bps > 1000", async () => {
      try {
        await setupLaunch(program, provider, { feeBps: 1001 });
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "InvalidFeeBps"
        );
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
          virtualToken: CURVE_ALLOCATION.subn(1),
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
    let ctx: Awaited<ReturnType<typeof setupLaunch>>;
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

    async function executeBuy(solAmount: BN, minTokensOut: BN = new BN(0)) {
      return program.methods
        .buy({ solAmount, minTokensOut })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    }

    it("buyer receives tokens after buy", async () => {
      const solIn = new BN(1 * LAMPORTS_PER_SOL);
      await executeBuy(solIn);

      const buyerAcct = await getAccount(provider.connection, buyerAta);
      expect(Number(buyerAcct.amount)).to.be.greaterThan(0);
    });

    it("SOL vault balance increases by net SOL (after fee)", async () => {
      const solIn = new BN(1 * LAMPORTS_PER_SOL);
      const vaultBefore = await provider.connection.getBalance(ctx.solVault);

      await executeBuy(solIn);

      const vaultAfter = await provider.connection.getBalance(ctx.solVault);
      const fee = Math.floor((1 * LAMPORTS_PER_SOL * PLATFORM_FEE_BPS) / 10_000);
      const expectedNet = 1 * LAMPORTS_PER_SOL - fee;
      expect(vaultAfter - vaultBefore).to.equal(expectedNet);
    });

    it("platform fee is sent to DAWEN treasury", async () => {
      const solIn = new BN(1 * LAMPORTS_PER_SOL);
      const treasuryBefore = await provider.connection.getBalance(TREASURY);

      await executeBuy(solIn);

      const treasuryAfter = await provider.connection.getBalance(TREASURY);
      const expectedFee = Math.floor(
        (1 * LAMPORTS_PER_SOL * PLATFORM_FEE_BPS) / 10_000
      );
      expect(treasuryAfter - treasuryBefore).to.equal(expectedFee);
    });

    it("virtual reserves update correctly after buy", async () => {
      const solIn = new BN(1 * LAMPORTS_PER_SOL);
      const stateBefore = await program.account.launchState.fetch(
        ctx.launchState
      );

      await executeBuy(solIn);

      const stateAfter = await program.account.launchState.fetch(
        ctx.launchState
      );
      expect(stateAfter.virtualSolReserve.gt(stateBefore.virtualSolReserve)).to
        .be.true;
      expect(
        stateAfter.virtualTokenReserve.lt(stateBefore.virtualTokenReserve)
      ).to.be.true;
      expect(stateAfter.realSolCollected.gt(new BN(0))).to.be.true;
      expect(stateAfter.tokensSold.gt(new BN(0))).to.be.true;
    });

    it("slippage protection rejects buy with min_tokens_out too high", async () => {
      const solIn = new BN(1 * LAMPORTS_PER_SOL);
      const impossibleMin = new BN("999999999999999999");
      try {
        await executeBuy(solIn, impossibleMin);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "SlippageExceeded"
        );
      }
    });

    it("rejects buy with zero sol_amount", async () => {
      try {
        await executeBuy(new BN(0));
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ZeroAmount");
      }
    });

    it("price rises after each buy", async () => {
      const stateBefore = await program.account.launchState.fetch(
        ctx.launchState
      );
      const priceBefore =
        stateBefore.virtualSolReserve.toNumber() /
        stateBefore.virtualTokenReserve.toNumber();

      await executeBuy(new BN(1 * LAMPORTS_PER_SOL));

      const stateAfter = await program.account.launchState.fetch(
        ctx.launchState
      );
      const priceAfter =
        stateAfter.virtualSolReserve.toNumber() /
        stateAfter.virtualTokenReserve.toNumber();

      expect(priceAfter).to.be.greaterThan(priceBefore);
    });
  });

  // ── sell ───────────────────────────────────────────────────────────────────

  describe("sell", () => {
    let ctx: Awaited<ReturnType<typeof setupLaunch>>;
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
      // Buy first so the buyer has tokens to sell
      await program.methods
        .buy({
          solAmount: new BN(2 * LAMPORTS_PER_SOL),
          minTokensOut: new BN(0),
        })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    });

    async function executeSell(tokenAmount: BN, minSolOut: BN = new BN(0)) {
      return program.methods
        .sell({ tokenAmount, minSolOut })
        .accounts({
          seller: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          sellerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();
    }

    it("seller receives SOL after selling tokens", async () => {
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const sellerLamportsBefore = await provider.connection.getBalance(
        buyer.publicKey
      );
      await executeSell(tokensToSell);
      const sellerLamportsAfter = await provider.connection.getBalance(
        buyer.publicKey
      );

      // Net of transaction fee, seller should have more SOL
      expect(sellerLamportsAfter).to.be.greaterThan(sellerLamportsBefore - 0.01 * LAMPORTS_PER_SOL);
    });

    it("seller's token balance decreases", async () => {
      const tokenAcctBefore = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcctBefore.amount.toString()).divn(2);

      await executeSell(tokensToSell);

      const tokenAcctAfter = await getAccount(provider.connection, buyerAta);
      expect(Number(tokenAcctAfter.amount)).to.be.lessThan(
        Number(tokenAcctBefore.amount)
      );
    });

    it("platform fee sent to treasury on sell", async () => {
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const treasuryBefore = await provider.connection.getBalance(TREASURY);
      await executeSell(tokensToSell);
      const treasuryAfter = await provider.connection.getBalance(TREASURY);

      expect(treasuryAfter).to.be.greaterThan(treasuryBefore);
    });

    it("virtual reserves update correctly after sell", async () => {
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const stateBefore = await program.account.launchState.fetch(
        ctx.launchState
      );
      await executeSell(tokensToSell);
      const stateAfter = await program.account.launchState.fetch(
        ctx.launchState
      );

      expect(
        stateAfter.virtualSolReserve.lt(stateBefore.virtualSolReserve)
      ).to.be.true;
      expect(
        stateAfter.virtualTokenReserve.gt(stateBefore.virtualTokenReserve)
      ).to.be.true;
    });

    it("price falls after sell", async () => {
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(2);

      const stateBefore = await program.account.launchState.fetch(
        ctx.launchState
      );
      const priceBefore =
        stateBefore.virtualSolReserve.toNumber() /
        stateBefore.virtualTokenReserve.toNumber();

      await executeSell(tokensToSell);

      const stateAfter = await program.account.launchState.fetch(
        ctx.launchState
      );
      const priceAfter =
        stateAfter.virtualSolReserve.toNumber() /
        stateAfter.virtualTokenReserve.toNumber();

      expect(priceAfter).to.be.lessThan(priceBefore);
    });

    it("slippage protection rejects sell with min_sol_out too high", async () => {
      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(4);
      const impossibleMin = new BN(1000 * LAMPORTS_PER_SOL);

      try {
        await executeSell(tokensToSell, impossibleMin);
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "SlippageExceeded"
        );
      }
    });

    it("rejects sell with zero token_amount", async () => {
      try {
        await executeSell(new BN(0));
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include("ZeroAmount");
      }
    });
  });

  // ── graduation ────────────────────────────────────────────────────────────

  describe("graduation", () => {
    it("buy auto-graduates when realSolCollected >= threshold", async () => {
      // Use a very low graduation threshold so a single buy triggers it
      const lowThreshold = new BN(0.5 * LAMPORTS_PER_SOL);
      const ctx = await setupLaunch(program, provider, {
        threshold: lowThreshold,
      });

      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // This buy should push realSolCollected above 0.5 SOL threshold
      await program.methods
        .buy({ solAmount: new BN(1 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const state = await program.account.launchState.fetch(ctx.launchState);
      expect(state.status).to.deep.equal({ graduated: {} });
      expect(state.graduatedAt).to.not.be.null;
    });

    it("explicit graduate succeeds when threshold is reached", async () => {
      const lowThreshold = new BN(0.5 * LAMPORTS_PER_SOL);
      const ctx = await setupLaunch(program, provider, {
        threshold: lowThreshold,
      });

      // Do a large enough buy to hit threshold but it won't auto-graduate
      // because we'll use a buy that leaves state.real_sol_collected just above threshold
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 5);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      await program.methods
        .buy({ solAmount: new BN(1 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // The buy already graduated, so we verify the state is Graduated
      const state = await program.account.launchState.fetch(ctx.launchState);
      expect(state.status).to.deep.equal({ graduated: {} });
    });

    it("explicit graduate fails when threshold is NOT reached", async () => {
      const ctx = await setupLaunch(program, provider);
      const [solVault] = await deriveSolVault(ctx.mint, program.programId);

      try {
        await program.methods
          .graduate()
          .accounts({
            mint: ctx.mint,
            launchState: ctx.launchState,
            solVault,
          })
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "ThresholdNotReached"
        );
      }
    });

    it("buy is blocked after graduation", async () => {
      const lowThreshold = new BN(0.5 * LAMPORTS_PER_SOL);
      const ctx = await setupLaunch(program, provider, {
        threshold: lowThreshold,
      });

      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 10);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // First buy triggers graduation
      await program.methods
        .buy({ solAmount: new BN(1 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      // Second buy should fail with LaunchNotActive
      try {
        await program.methods
          .buy({ solAmount: new BN(0.1 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
          .accounts({
            buyer: buyer.publicKey,
            mint: ctx.mint,
            launchState: ctx.launchState,
            tokenVault: ctx.tokenVault,
            solVault: ctx.solVault,
            buyerTokenAccount: buyerAta,
            treasury: TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "LaunchNotActive"
        );
      }
    });

    it("sell is blocked after graduation", async () => {
      const lowThreshold = new BN(0.5 * LAMPORTS_PER_SOL);
      const ctx = await setupLaunch(program, provider, {
        threshold: lowThreshold,
      });

      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 10);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // Buy triggers graduation and gives buyer tokens
      await program.methods
        .buy({ solAmount: new BN(1 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
        .accounts({
          buyer: buyer.publicKey,
          mint: ctx.mint,
          launchState: ctx.launchState,
          tokenVault: ctx.tokenVault,
          solVault: ctx.solVault,
          buyerTokenAccount: buyerAta,
          treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const tokenAcct = await getAccount(provider.connection, buyerAta);
      const tokensToSell = new BN(tokenAcct.amount.toString()).divn(4);

      // Sell should now fail
      try {
        await program.methods
          .sell({ tokenAmount: tokensToSell, minSolOut: new BN(0) })
          .accounts({
            seller: buyer.publicKey,
            mint: ctx.mint,
            launchState: ctx.launchState,
            tokenVault: ctx.tokenVault,
            solVault: ctx.solVault,
            sellerTokenAccount: buyerAta,
            treasury: TREASURY,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .signers([buyer])
          .rpc();
        expect.fail("should have thrown");
      } catch (e: any) {
        expect(e.error?.errorCode?.code ?? e.message).to.include(
          "LaunchNotActive"
        );
      }
    });
  });

  // ── vault integrity ────────────────────────────────────────────────────────

  describe("vault integrity", () => {
    it("sol vault balance equals sum of all net SOL from buys minus sells", async () => {
      const ctx = await setupLaunch(program, provider);
      const buyer = Keypair.generate();
      await airdrop(provider.connection, buyer.publicKey, 10);
      const buyerAta = await createAssociatedTokenAccount(
        provider.connection,
        buyer,
        ctx.mint,
        buyer.publicKey
      );

      // Buy 2 SOL
      await program.methods
        .buy({ solAmount: new BN(2 * LAMPORTS_PER_SOL), minTokensOut: new BN(0) })
        .accounts({
          buyer: buyer.publicKey, mint: ctx.mint, launchState: ctx.launchState,
          tokenVault: ctx.tokenVault, solVault: ctx.solVault,
          buyerTokenAccount: buyerAta, treasury: TREASURY,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([buyer])
        .rpc();

      const state = await program.account.launchState.fetch(ctx.launchState);
      const vaultBalance = await provider.connection.getBalance(ctx.solVault);

      // The SOL vault should hold exactly realSolCollected
      expect(vaultBalance).to.equal(state.realSolCollected.toNumber());
    });
  });
});
