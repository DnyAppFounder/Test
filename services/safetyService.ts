import { supabase } from '@/lib/supabase';
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { SolanaConnectionService } from './solana/connectionService';

export interface SafetyScore {
  id: string;
  token_mint: string;
  risk_score: number;
  mint_authority_revoked: boolean;
  freeze_authority_revoked: boolean;
  lp_locked: boolean;
  lp_lock_pct: number;
  honeypot_detected: boolean;
  tax_buy_pct: number;
  tax_sell_pct: number;
  top10_holders_pct: number;
  scam_signals: string[];
  last_checked_at: string;
  created_at: string;
}

export interface SafetyCheckResult {
  score: SafetyScore;
  label: 'SAFU' | 'CAUTION' | 'DANGER';
  color: string;
  summary: string[];
}

const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

// Mint account layout offsets (SPL Token)
const MINT_MINT_AUTHORITY_OPTION = 0;    // 4 bytes (COption: 0=None, 1=Some)
const MINT_MINT_AUTHORITY = 4;           // 32 bytes
const MINT_SUPPLY = 36;                  // 8 bytes u64
const MINT_DECIMALS = 44;                // 1 byte
const MINT_INITIALIZED = 45;            // 1 byte
const MINT_FREEZE_AUTHORITY_OPTION = 46; // 4 bytes
const MINT_FREEZE_AUTHORITY = 50;        // 32 bytes

class SafetyService {
  private connection: Connection;
  private cache = new Map<string, { data: SafetyScore; ts: number }>();
  private CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.connection = SolanaConnectionService.getInstance().getConnection();
  }

  async getScore(mintAddress: string): Promise<SafetyScore | null> {
    // Check memory cache first
    const cached = this.cache.get(mintAddress);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) return cached.data;

    try {
      const { data } = await supabase
        .from('safety_scores')
        .select('*')
        .eq('token_mint', mintAddress)
        .maybeSingle();

      if (data) {
        const score = data as SafetyScore;
        // Recheck if data is older than 10 minutes
        const stale = Date.now() - new Date(score.last_checked_at).getTime() > 10 * 60 * 1000;
        if (!stale) {
          this.cache.set(mintAddress, { data: score, ts: Date.now() });
          return score;
        }
      }

      return await this.analyzeToken(mintAddress);
    } catch {
      return null;
    }
  }

  async analyzeToken(mintAddress: string): Promise<SafetyScore | null> {
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const accountInfo = await this.connection.getAccountInfo(mintPubkey);
      if (!accountInfo) return null;

      const signals: string[] = [];
      let riskScore = 0; // start at 0 (safe), add for risks

      // --- Check mint authority ---
      let mintAuthorityRevoked = false;
      if (accountInfo.data.length >= 50) {
        const mintAuthOption = accountInfo.data.readUInt32LE(MINT_MINT_AUTHORITY_OPTION);
        mintAuthorityRevoked = mintAuthOption === 0;
      }
      if (!mintAuthorityRevoked) {
        riskScore += 30;
        signals.push('Mint authority not revoked — tokens can be minted infinitely');
      }

      // --- Check freeze authority ---
      let freezeAuthorityRevoked = false;
      if (accountInfo.data.length >= 82) {
        const freezeAuthOption = accountInfo.data.readUInt32LE(MINT_FREEZE_AUTHORITY_OPTION);
        freezeAuthorityRevoked = freezeAuthOption === 0;
      }
      if (!freezeAuthorityRevoked) {
        riskScore += 20;
        signals.push('Freeze authority active — accounts can be frozen');
      }

      // --- Holder concentration (estimate from largest accounts) ---
      let top10HoldersPct = 0;
      try {
        const largestAccounts = await this.connection.getTokenLargestAccounts(mintPubkey);
        if (largestAccounts.value.length > 0) {
          const supplyInfo = await this.connection.getTokenSupply(mintPubkey);
          const totalSupply = Number(supplyInfo.value.amount);
          if (totalSupply > 0) {
            const top10 = largestAccounts.value.slice(0, 10);
            const top10Amount = top10.reduce((sum, a) => sum + Number(a.amount), 0);
            top10HoldersPct = (top10Amount / totalSupply) * 100;
            if (top10HoldersPct > 80) {
              riskScore += 25;
              signals.push(`Top 10 holders own ${top10HoldersPct.toFixed(1)}% of supply`);
            } else if (top10HoldersPct > 60) {
              riskScore += 10;
              signals.push(`Top 10 holders own ${top10HoldersPct.toFixed(1)}% of supply`);
            }
          }
        }
      } catch {
        // RPC call failed — skip holder check
      }

      // Cap risk score at 100
      riskScore = Math.min(riskScore, 100);

      const scoreData = {
        token_mint: mintAddress,
        risk_score: riskScore,
        mint_authority_revoked: mintAuthorityRevoked,
        freeze_authority_revoked: freezeAuthorityRevoked,
        lp_locked: false,
        lp_lock_pct: 0,
        honeypot_detected: false,
        tax_buy_pct: 0,
        tax_sell_pct: 0,
        top10_holders_pct: Math.round(top10HoldersPct * 10) / 10,
        scam_signals: signals,
        last_checked_at: new Date().toISOString(),
      };

      // Upsert to DB
      const { data: upserted } = await supabase
        .from('safety_scores')
        .upsert(scoreData, { onConflict: 'token_mint' })
        .select()
        .maybeSingle();

      const result = (upserted ?? { ...scoreData, id: '', created_at: new Date().toISOString() }) as SafetyScore;
      this.cache.set(mintAddress, { data: result, ts: Date.now() });
      return result;
    } catch (e) {
      console.error('[SafetyService] analyzeToken error:', e);
      return null;
    }
  }

  classify(score: SafetyScore): SafetyCheckResult {
    let label: 'SAFU' | 'CAUTION' | 'DANGER';
    let color: string;

    if (score.risk_score <= 25) {
      label = 'SAFU';
      color = '#10B981';
    } else if (score.risk_score <= 60) {
      label = 'CAUTION';
      color = '#F59E0B';
    } else {
      label = 'DANGER';
      color = '#EF4444';
    }

    const summary: string[] = [];
    if (score.mint_authority_revoked) summary.push('Mint authority revoked');
    else summary.push('Mint authority active');
    if (score.freeze_authority_revoked) summary.push('Freeze authority revoked');
    else summary.push('Freeze authority active');
    if (score.lp_locked) summary.push(`LP locked ${score.lp_lock_pct.toFixed(0)}%`);
    if (score.honeypot_detected) summary.push('Honeypot detected!');

    return { score, label, color, summary };
  }

  getRiskColor(riskScore: number): string {
    if (riskScore <= 25) return '#10B981';
    if (riskScore <= 60) return '#F59E0B';
    return '#EF4444';
  }

  getRiskLabel(riskScore: number): string {
    if (riskScore <= 25) return 'SAFU';
    if (riskScore <= 60) return 'CAUTION';
    return 'DANGER';
  }
}

export const safetyService = new SafetyService();
