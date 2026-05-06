/**
 * presaleService
 *
 * Handles all presale lifecycle: creation, buying, claiming, refunding,
 * finalizing, and real-time status management.
 *
 * All on-chain transactions require the caller to provide a signAndSend function
 * so that private keys never touch this service.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
} from '@solana/web3.js';
import { supabase } from '@/lib/supabase';
import { SolanaConnectionService } from './solana/connectionService';
import { launchpadService, LaunchpadToken } from './launchpadService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresaleStatus =
  | 'upcoming'
  | 'live'
  | 'successful'
  | 'failed'
  | 'claim_live'
  | 'finalized';

export type UnsoldBehavior = 'burn' | 'return';

export interface Presale {
  id: string;
  token_id: string;
  soft_cap: number;
  hard_cap: number;
  min_buy: number;
  max_buy: number;
  launch_price: number;
  listing_price: number;
  tokens_for_sale: number;
  liquidity_percent: number;
  unsold_behavior: UnsoldBehavior;
  status: PresaleStatus;
  start_at: string;
  end_at: string;
  amount_raised: number;
  buyer_count: number;
  finalized_at: string | null;
  finalize_tx: string | null;
  lp_address: string | null;
  created_at: string;
  updated_at: string;
}

export interface PresaleContribution {
  id: string;
  presale_id: string;
  token_id: string;
  wallet: string;
  sol_amount: number;
  token_amount: number;
  claimed: boolean;
  claim_tx: string | null;
  claimed_at: string | null;
  refunded: boolean;
  refund_tx: string | null;
  refunded_at: string | null;
  tx_signature: string | null;
  confirmed: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePresaleInput {
  tokenId: string;
  softCap: number;
  hardCap: number;
  minBuy: number;
  maxBuy: number;
  launchPrice: number;
  listingPrice: number;
  tokensForSale: number;
  liquidityPercent: number;
  unsoldBehavior: UnsoldBehavior;
  startAt: Date;
  endAt: Date;
}

export interface BuyPresaleInput {
  presaleId: string;
  tokenId: string;
  wallet: string;
  solAmount: number;
}

export interface PresaleProgress {
  raised: number;
  softCap: number;
  hardCap: number;
  softCapPercent: number;
  hardCapPercent: number;
  buyerCount: number;
  timeRemaining: number; // ms
  isLive: boolean;
  isEnded: boolean;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validatePresaleInput(input: CreatePresaleInput): string | null {
  if (input.softCap <= 0) return 'Soft cap must be greater than 0';
  if (input.hardCap <= input.softCap) return 'Hard cap must be greater than soft cap';
  if (input.minBuy <= 0) return 'Min buy must be greater than 0';
  if (input.maxBuy <= input.minBuy) return 'Max buy must be greater than min buy';
  if (input.maxBuy > input.hardCap) return 'Max buy cannot exceed hard cap';
  if (input.launchPrice <= 0) return 'Launch price must be greater than 0';
  if (input.listingPrice <= 0) return 'Listing price must be greater than 0';
  if (input.tokensForSale <= 0) return 'Tokens for sale must be greater than 0';
  if (input.liquidityPercent < 10 || input.liquidityPercent > 95) return 'Liquidity % must be 10–95';
  if (input.startAt >= input.endAt) return 'End date must be after start date';
  const minDuration = 60 * 60 * 1000; // 1 hour
  if (input.endAt.getTime() - input.startAt.getTime() < minDuration) return 'Presale must last at least 1 hour';
  return null;
}

// ─── Status Computation ───────────────────────────────────────────────────────

export function computePresaleStatus(presale: Presale): PresaleStatus {
  // If already finalized or claim_live, keep that
  if (presale.status === 'finalized' || presale.status === 'claim_live') return presale.status;

  const now = Date.now();
  const start = new Date(presale.start_at).getTime();
  const end = new Date(presale.end_at).getTime();

  if (now < start) return 'upcoming';
  if (now >= start && now < end) {
    // Check if hard cap reached
    if (presale.amount_raised >= presale.hard_cap) return 'successful';
    return 'live';
  }
  // ended
  if (presale.amount_raised >= presale.soft_cap) return 'successful';
  return 'failed';
}

export function getPresaleProgress(presale: Presale): PresaleProgress {
  const now = Date.now();
  const end = new Date(presale.end_at).getTime();
  const start = new Date(presale.start_at).getTime();
  const timeRemaining = Math.max(0, end - now);
  const isLive = now >= start && now < end && presale.amount_raised < presale.hard_cap;
  const isEnded = now >= end || presale.amount_raised >= presale.hard_cap;

  return {
    raised: presale.amount_raised,
    softCap: presale.soft_cap,
    hardCap: presale.hard_cap,
    softCapPercent: Math.min(100, (presale.amount_raised / presale.soft_cap) * 100),
    hardCapPercent: Math.min(100, (presale.amount_raised / presale.hard_cap) * 100),
    buyerCount: presale.buyer_count,
    timeRemaining,
    isLive,
    isEnded,
  };
}

export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Ended';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${sec}s`;
  return `${m}m ${sec}s`;
}

// ─── Service Class ────────────────────────────────────────────────────────────

class PresaleService {
  private connection: Connection;

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  // ── CRUD ──

  async createPresale(input: CreatePresaleInput): Promise<Presale | null> {
    try {
      const { data, error } = await supabase
        .from('launchpad_presales')
        .insert({
          token_id: input.tokenId,
          soft_cap: input.softCap,
          hard_cap: input.hardCap,
          min_buy: input.minBuy,
          max_buy: input.maxBuy,
          launch_price: input.launchPrice,
          listing_price: input.listingPrice,
          tokens_for_sale: input.tokensForSale,
          liquidity_percent: input.liquidityPercent,
          unsold_behavior: input.unsoldBehavior,
          status: new Date() < input.startAt ? 'upcoming' : 'live',
          start_at: input.startAt.toISOString(),
          end_at: input.endAt.toISOString(),
          amount_raised: 0,
          buyer_count: 0,
          updated_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      return data as Presale | null;
    } catch (e) {
      console.error('[PresaleService] createPresale error:', e);
      return null;
    }
  }

  async getPresaleByToken(tokenId: string): Promise<Presale | null> {
    try {
      const { data } = await supabase
        .from('launchpad_presales')
        .select('*')
        .eq('token_id', tokenId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as Presale | null;
    } catch {
      return null;
    }
  }

  async getPresaleById(presaleId: string): Promise<Presale | null> {
    try {
      const { data } = await supabase
        .from('launchpad_presales')
        .select('*')
        .eq('id', presaleId)
        .maybeSingle();
      return data as Presale | null;
    } catch {
      return null;
    }
  }

  async getActivePresales(limit = 20): Promise<Presale[]> {
    try {
      const { data } = await supabase
        .from('launchpad_presales')
        .select('*')
        .in('status', ['live', 'upcoming', 'successful', 'claim_live'])
        .order('created_at', { ascending: false })
        .limit(limit);
      return (data as Presale[]) ?? [];
    } catch {
      return [];
    }
  }

  async getContribution(presaleId: string, wallet: string): Promise<PresaleContribution | null> {
    try {
      const { data } = await supabase
        .from('launchpad_presale_contributions')
        .select('*')
        .eq('presale_id', presaleId)
        .eq('wallet', wallet)
        .maybeSingle();
      return data as PresaleContribution | null;
    } catch {
      return null;
    }
  }

  async getContributions(presaleId: string): Promise<PresaleContribution[]> {
    try {
      const { data } = await supabase
        .from('launchpad_presale_contributions')
        .select('*')
        .eq('presale_id', presaleId)
        .order('created_at', { ascending: false });
      return (data as PresaleContribution[]) ?? [];
    } catch {
      return [];
    }
  }

  // ── BUY ──

  /**
   * Buy into a presale.
   * signAndSend: (tx: Transaction) => Promise<string>  — called by the wallet layer
   */
  async buyPresale(
    input: BuyPresaleInput,
    signAndSend: (tx: Transaction) => Promise<string>
  ): Promise<{ success: boolean; txSignature?: string; error?: string }> {
    try {
      // 1. Fresh presale data
      const presale = await this.getPresaleById(input.presaleId);
      if (!presale) return { success: false, error: 'Presale not found' };

      const currentStatus = computePresaleStatus(presale);
      if (currentStatus !== 'live') {
        return { success: false, error: `Presale is not live (status: ${currentStatus})` };
      }

      // 2. Validate limits
      if (input.solAmount < presale.min_buy) {
        return { success: false, error: `Minimum buy is ${presale.min_buy} SOL` };
      }
      if (input.solAmount > presale.max_buy) {
        return { success: false, error: `Maximum buy is ${presale.max_buy} SOL` };
      }
      if (presale.amount_raised + input.solAmount > presale.hard_cap) {
        const remaining = presale.hard_cap - presale.amount_raised;
        return { success: false, error: `Only ${remaining.toFixed(4)} SOL remaining until hard cap` };
      }

      // 3. Check existing contribution
      const existing = await this.getContribution(input.presaleId, input.wallet);
      if (existing && existing.confirmed) {
        const newTotal = existing.sol_amount + input.solAmount;
        if (newTotal > presale.max_buy) {
          return {
            success: false,
            error: `Total contribution would exceed max buy of ${presale.max_buy} SOL`,
          };
        }
      }

      // 4. Check wallet SOL balance
      const walletPubkey = new PublicKey(input.wallet);
      const balanceLamports = await this.connection.getBalance(walletPubkey, 'confirmed');
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
      const needed = input.solAmount + 0.001; // buffer for fees
      if (balanceSol < needed) {
        return { success: false, error: `Insufficient SOL balance. Need ${needed.toFixed(4)}, have ${balanceSol.toFixed(4)}` };
      }

      // 5. Get the token's creator wallet as recipient
      const { data: tokenData } = await supabase
        .from('launchpad_tokens')
        .select('creator_wallet')
        .eq('id', presale.token_id)
        .maybeSingle();

      if (!tokenData?.creator_wallet) {
        return { success: false, error: 'Token creator wallet not found' };
      }

      // 6. Build the SOL transfer transaction
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPubkey });

      tx.add(
        SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: new PublicKey(tokenData.creator_wallet),
          lamports: Math.floor(input.solAmount * LAMPORTS_PER_SOL),
        })
      );

      // 7. Sign and send
      let txSignature: string;
      try {
        txSignature = await signAndSend(tx);
      } catch (err: any) {
        return { success: false, error: err?.message || 'Transaction rejected' };
      }

      // 8. Confirm on-chain
      try {
        await this.connection.confirmTransaction(
          { signature: txSignature, blockhash, lastValidBlockHeight },
          'confirmed'
        );
      } catch {
        return { success: false, error: 'Transaction failed to confirm' };
      }

      // 9. Calculate token allocation
      const tokenAllocation = presale.launch_price > 0
        ? input.solAmount / presale.launch_price
        : (input.solAmount / presale.hard_cap) * presale.tokens_for_sale;

      // 10. Upsert contribution
      const isNew = !existing;
      const newSolAmount = existing ? existing.sol_amount + input.solAmount : input.solAmount;
      const newTokenAmount = existing ? existing.token_amount + tokenAllocation : tokenAllocation;

      if (existing) {
        await supabase
          .from('launchpad_presale_contributions')
          .update({
            sol_amount: newSolAmount,
            token_amount: newTokenAmount,
            tx_signature: txSignature,
            confirmed: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('launchpad_presale_contributions')
          .insert({
            presale_id: input.presaleId,
            token_id: presale.token_id,
            wallet: input.wallet,
            sol_amount: input.solAmount,
            token_amount: tokenAllocation,
            tx_signature: txSignature,
            confirmed: true,
          });
      }

      // 11. Update presale raised amount & buyer count
      const newRaised = presale.amount_raised + input.solAmount;
      const newBuyerCount = isNew ? presale.buyer_count + 1 : presale.buyer_count;
      const newStatus = newRaised >= presale.hard_cap ? 'successful' : computePresaleStatus({ ...presale, amount_raised: newRaised });

      await supabase
        .from('launchpad_presales')
        .update({
          amount_raised: newRaised,
          buyer_count: newBuyerCount,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.presaleId);

      return { success: true, txSignature };
    } catch (err: any) {
      console.error('[PresaleService] buyPresale error:', err);
      return { success: false, error: err?.message || 'Unexpected error' };
    }
  }

  // ── FINALIZE ──

  async finalizePresale(
    presaleId: string,
    creatorWallet: string,
    signAndSend: (tx: Transaction) => Promise<string>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const presale = await this.getPresaleById(presaleId);
      if (!presale) return { success: false, error: 'Presale not found' };

      const status = computePresaleStatus(presale);
      if (status !== 'successful') {
        return { success: false, error: `Cannot finalize: presale status is ${status}` };
      }

      // Build a minimal finalize memo transaction (marker on-chain)
      const creatorPubkey = new PublicKey(creatorWallet);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: creatorPubkey });

      // 0-lamport self-transfer as finalize marker
      tx.add(
        SystemProgram.transfer({
          fromPubkey: creatorPubkey,
          toPubkey: creatorPubkey,
          lamports: 0,
        })
      );

      let txSig: string;
      try {
        txSig = await signAndSend(tx);
      } catch (err: any) {
        return { success: false, error: err?.message || 'Transaction rejected' };
      }

      await this.connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await supabase
        .from('launchpad_presales')
        .update({
          status: 'claim_live',
          finalized_at: new Date().toISOString(),
          finalize_tx: txSig,
          updated_at: new Date().toISOString(),
        })
        .eq('id', presaleId);

      return { success: true };
    } catch (err: any) {
      console.error('[PresaleService] finalizePresale error:', err);
      return { success: false, error: err?.message || 'Finalize failed' };
    }
  }

  // ── CLAIM ──

  async claimTokens(
    presaleId: string,
    wallet: string,
    signAndSend: (tx: Transaction) => Promise<string>
  ): Promise<{ success: boolean; tokenAmount?: number; txSignature?: string; error?: string }> {
    try {
      const presale = await this.getPresaleById(presaleId);
      if (!presale) return { success: false, error: 'Presale not found' };
      if (presale.status !== 'claim_live' && presale.status !== 'finalized') {
        return { success: false, error: 'Tokens are not yet claimable' };
      }

      const contribution = await this.getContribution(presaleId, wallet);
      if (!contribution || !contribution.confirmed) {
        return { success: false, error: 'No confirmed contribution found' };
      }
      if (contribution.claimed) {
        return { success: false, error: 'Tokens already claimed' };
      }

      // Build claim marker transaction
      const walletPubkey = new PublicKey(wallet);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPubkey });
      tx.add(
        SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: walletPubkey,
          lamports: 0,
        })
      );

      let txSig: string;
      try {
        txSig = await signAndSend(tx);
      } catch (err: any) {
        return { success: false, error: err?.message || 'Transaction rejected' };
      }

      await this.connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      // Mark claimed
      await supabase
        .from('launchpad_presale_contributions')
        .update({
          claimed: true,
          claim_tx: txSig,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contribution.id);

      return { success: true, tokenAmount: contribution.token_amount, txSignature: txSig };
    } catch (err: any) {
      console.error('[PresaleService] claimTokens error:', err);
      return { success: false, error: err?.message || 'Claim failed' };
    }
  }

  // ── REFUND ──

  async refundContribution(
    presaleId: string,
    wallet: string,
    signAndSend: (tx: Transaction) => Promise<string>
  ): Promise<{ success: boolean; solAmount?: number; txSignature?: string; error?: string }> {
    try {
      const presale = await this.getPresaleById(presaleId);
      if (!presale) return { success: false, error: 'Presale not found' };

      const status = computePresaleStatus(presale);
      if (status !== 'failed') {
        return { success: false, error: `Refund only available for failed presales (current: ${status})` };
      }

      const contribution = await this.getContribution(presaleId, wallet);
      if (!contribution || !contribution.confirmed) {
        return { success: false, error: 'No confirmed contribution found' };
      }
      if (contribution.refunded) {
        return { success: false, error: 'Already refunded' };
      }

      // Build refund marker transaction (actual SOL return is handled by creator escrow in a real impl)
      const walletPubkey = new PublicKey(wallet);
      const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ recentBlockhash: blockhash, feePayer: walletPubkey });
      tx.add(
        SystemProgram.transfer({
          fromPubkey: walletPubkey,
          toPubkey: walletPubkey,
          lamports: 0,
        })
      );

      let txSig: string;
      try {
        txSig = await signAndSend(tx);
      } catch (err: any) {
        return { success: false, error: err?.message || 'Transaction rejected' };
      }

      await this.connection.confirmTransaction(
        { signature: txSig, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      await supabase
        .from('launchpad_presale_contributions')
        .update({
          refunded: true,
          refund_tx: txSig,
          refunded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contribution.id);

      return { success: true, solAmount: contribution.sol_amount, txSignature: txSig };
    } catch (err: any) {
      console.error('[PresaleService] refundContribution error:', err);
      return { success: false, error: err?.message || 'Refund failed' };
    }
  }

  // ── REALTIME ──

  subscribeToPresale(
    presaleId: string,
    onUpdate: (presale: Presale) => void
  ): () => void {
    const channel = supabase
      .channel(`presale:${presaleId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'launchpad_presales', filter: `id=eq.${presaleId}` },
        (payload) => { if (payload.new) onUpdate(payload.new as Presale); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  subscribeToContributions(
    presaleId: string,
    onInsert: (contribution: PresaleContribution) => void
  ): () => void {
    const channel = supabase
      .channel(`contributions:${presaleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'launchpad_presale_contributions', filter: `presale_id=eq.${presaleId}` },
        (payload) => { if (payload.new) onInsert(payload.new as PresaleContribution); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }

  // ── STATUS sync (call periodically) ──

  async syncPresaleStatuses(): Promise<void> {
    try {
      const { data } = await supabase
        .from('launchpad_presales')
        .select('*')
        .in('status', ['upcoming', 'live'])
        .limit(50);

      if (!data) return;

      for (const p of data as Presale[]) {
        const computed = computePresaleStatus(p);
        if (computed !== p.status) {
          await supabase
            .from('launchpad_presales')
            .update({ status: computed, updated_at: new Date().toISOString() })
            .eq('id', p.id);
        }
      }
    } catch {}
  }
}

export const presaleService = new PresaleService();
