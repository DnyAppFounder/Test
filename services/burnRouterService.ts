import { supabase } from '@/lib/supabase';
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';

export type BurnType = 'trade' | 'swap' | 'launch' | 'manual' | 'presale';

export interface BurnEvent {
  id: string;
  token_mint: string;
  burn_amount: number;
  burn_type: BurnType;
  trigger_tx: string | null;
  burner_wallet: string;
  created_at: string;
}

export interface BurnStats {
  totalBurned: number;
  last24h: number;
  last7d: number;
  burnCount: number;
}

// SPL Token Program
const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
// Associated Token Program
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bJo');

class BurnRouterService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  /** Build a burnChecked instruction (instruction index 25) */
  buildBurnInstruction(
    mint: PublicKey,
    tokenAccount: PublicKey,
    authority: PublicKey,
    amount: bigint,
    decimals: number
  ): TransactionInstruction {
    // BurnChecked layout: [u8 = 25] [u64 amount LE] [u8 decimals]
    const data = Buffer.alloc(10);
    data.writeUInt8(25, 0);
    data.writeBigUInt64LE(amount, 1);
    data.writeUInt8(decimals, 9);

    return new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: tokenAccount, isSigner: false, isWritable: true },
        { pubkey: mint, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  /** Derive ATA address */
  async deriveAta(owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    const [ata] = await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    return ata;
  }

  /**
   * Build a burn transaction. The caller signs + sends it.
   * Returns { tx, estimatedBurnAmount } or null if ATA doesn't exist.
   */
  async buildBurnTx(params: {
    burnerWallet: string;
    mintAddress: string;
    decimals: number;
    burnPct: number;  // e.g. 1 = burn 1% of the trade amount
    tradeAmountTokens: number;
  }): Promise<{ tx: Transaction; burnAmount: number } | null> {
    try {
      const burnerPubkey = new PublicKey(params.burnerWallet);
      const mintPubkey = new PublicKey(params.mintAddress);

      const ata = await this.deriveAta(burnerPubkey, mintPubkey);
      const ataInfo = await this.connection.getAccountInfo(ata);
      if (!ataInfo) return null;

      const burnAmount = Math.floor(params.tradeAmountTokens * (params.burnPct / 100));
      if (burnAmount <= 0) return null;

      const rawAmount = BigInt(Math.floor(burnAmount * Math.pow(10, params.decimals)));

      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: burnerPubkey });
      tx.add(this.buildBurnInstruction(mintPubkey, ata, burnerPubkey, rawAmount, params.decimals));

      return { tx, burnAmount };
    } catch {
      return null;
    }
  }

  async recordBurn(params: {
    tokenMint: string;
    burnAmount: number;
    burnType: BurnType;
    triggerTx?: string;
    burnerWallet: string;
  }): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('burn_events')
        .insert({
          token_mint: params.tokenMint,
          burn_amount: params.burnAmount,
          burn_type: params.burnType,
          trigger_tx: params.triggerTx ?? null,
          burner_wallet: params.burnerWallet,
        });
      return !error;
    } catch {
      return false;
    }
  }

  async getBurnStats(mintAddress: string): Promise<BurnStats> {
    try {
      const { data } = await supabase
        .from('burn_events')
        .select('burn_amount, created_at')
        .eq('token_mint', mintAddress);

      if (!data) return { totalBurned: 0, last24h: 0, last7d: 0, burnCount: 0 };

      const now = Date.now();
      const day = 86_400_000;
      let total = 0, last24h = 0, last7d = 0;

      for (const row of data) {
        total += row.burn_amount;
        const ts = new Date(row.created_at).getTime();
        if (now - ts < day) last24h += row.burn_amount;
        if (now - ts < 7 * day) last7d += row.burn_amount;
      }

      return { totalBurned: total, last24h, last7d, burnCount: data.length };
    } catch {
      return { totalBurned: 0, last24h: 0, last7d: 0, burnCount: 0 };
    }
  }

  async getRecentBurns(mintAddress: string, limit = 10): Promise<BurnEvent[]> {
    try {
      const { data } = await supabase
        .from('burn_events')
        .select('*')
        .eq('token_mint', mintAddress)
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data as BurnEvent[]) ?? [];
    } catch {
      return [];
    }
  }

  formatBurnAmount(amount: number): string {
    if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)}B`;
    if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
    if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
    return amount.toFixed(0);
  }
}

export const burnRouterService = new BurnRouterService();
