import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Clipboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  ChevronDown,
  CircleCheck as CheckCircle,
  CircleAlert as AlertCircle,
  Copy,
  Clock,
  Zap,
  Send as SendIcon,
  User,
  Scan,
  ChevronRight,
  X,
} from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { spacing, borderRadius, fontSize } from '@/constants/theme';
import { burnSplToken, PayStatus as BurnStatus } from '@/services/treasuryService';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  TransactionInstruction,
} from '@solana/web3.js';
import { SecureWalletManager } from '@/lib/wallet/SecureWalletManager';
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { SolanaConnectionService } from '@/services/solana/connectionService';
import { ExternalWalletAdapter } from '@/lib/wallet/ExternalWalletAdapter';
import { walletAssetLoader, WalletAsset } from '@/services/walletAssetLoader';
import AsyncStorage from '@react-native-async-storage/async-storage';

type SendStep = 'idle' | 'preparing' | 'signing' | 'sending' | 'success' | 'error';

const RECENT_KEY = 'send_recent_recipients';
const MAX_RECENT = 10;

async function loadRecentRecipients(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

async function saveRecipient(addr: string) {
  try {
    const list = await loadRecentRecipients();
    const next = [addr, ...list.filter(a => a !== addr)].slice(0, MAX_RECENT);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}

function shortenAddr(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

// ─── RPC helpers ─────────────────────────────────────────────────────────────

// Fetches the latest blockhash via Connection, then retries once via direct
// rpcCall if the first attempt fails (works around custom-fetch issues in
// @solana/web3.js on React Native / Expo web).
async function getLatestBlockhashWithRetry(
  service: SolanaConnectionService
): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  const connection = service.getConnection();

  // Attempt 1 — via Connection object
  try {
    return await connection.getLatestBlockhash('confirmed');
  } catch {
    // fall through to retry
  }

  // Attempt 2 — direct JSON-RPC call (always sends proper auth headers)
  try {
    const result = await service.rpcCall('getLatestBlockhash', [{ commitment: 'confirmed' }]);
    if (result?.value?.blockhash) {
      return {
        blockhash:            result.value.blockhash,
        lastValidBlockHeight: result.value.lastValidBlockHeight ?? 0,
      };
    }
  } catch {
    // fall through to error
  }

  throw new Error('RPC connection failed. Please retry.');
}

// Polls for transaction confirmation — avoids WebSocket dependency.
async function pollConfirmation(
  service: SolanaConnectionService,
  signature: string,
  timeoutMs = 60000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const result = await service.rpcCall('getSignatureStatuses', [
        [signature],
        { searchTransactionHistory: true },
      ]);
      const status = result?.value?.[0];
      if (status) {
        if (status.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
        if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') return;
      }
    } catch (e: any) {
      if (e.message?.includes('Transaction failed')) throw e;
    }
  }
  throw new Error('Confirmation timeout — check Solana Explorer for status.');
}

// Sends a signed transaction via Connection, retrying via direct rpcCall on failure.
async function sendRawTransactionWithRetry(
  service: SolanaConnectionService,
  rawTx: Uint8Array
): Promise<string> {
  const connection = service.getConnection();

  try {
    return await connection.sendRawTransaction(rawTx, { skipPreflight: false });
  } catch {
    // fall through to retry
  }

  // Retry via direct JSON-RPC call with base64 encoding
  const encoded = Buffer.from(rawTx).toString('base64');
  const sig = await service.rpcCall('sendTransaction', [
    encoded,
    { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed' },
  ]);
  if (typeof sig === 'string') return sig;
  throw new Error('Transaction send failed. Please retry.');
}

const PURPLE = '#8B5CF6';
const PURPLE_DIM = 'rgba(139,92,246,0.18)';
const GLASS = 'rgba(255,255,255,0.05)';
const GLASS_BORDER = 'rgba(255,255,255,0.09)';
const BG = '#0D0618';

export default function SendScreen() {
  const router = useRouter();
  const { selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();

  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [step, setStep] = useState<SendStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const [recentRecipients, setRecentRecipients] = useState<string[]>([]);
  const [showRecent, setShowRecent] = useState(false);
  const [logoErrors, setLogoErrors] = useState<Record<string, boolean>>({});

  // Burn
  const [burnAmount, setBurnAmount] = useState('');
  const [burnStatus, setBurnStatus] = useState<BurnStatus>('idle');
  const [burnError, setBurnError] = useState<string | null>(null);
  const [burnSig, setBurnSig] = useState<string | null>(null);
  const [showBurnPanel, setShowBurnPanel] = useState(false);

  useEffect(() => {
    loadRecentRecipients().then(setRecentRecipients);
  }, []);

  useEffect(() => {
    if (!activeAddress) { setAssetsLoading(false); return; }
    setAssetsLoading(true);
    walletAssetLoader.loadSolanaWalletAssets(activeAddress).then((res) => {
      setAssets(res.assets);
      if (res.assets.length > 0) setSelectedAsset(res.assets[0]);
    }).catch(() => {}).finally(() => setAssetsLoading(false));
  }, [activeAddress]);

  const isValidAddress = (addr: string): boolean => {
    try { new PublicKey(addr); return true; } catch { return false; }
  };

  const currentBalance = selectedAsset?.uiBalance ?? 0;
  const solUsdPrice = selectedAsset?.isNative && selectedAsset.uiBalance > 0
    ? (selectedAsset.value / selectedAsset.uiBalance)
    : selectedAsset?.price ?? 0;
  const amountNum = parseFloat(amount) || 0;
  const amountUsd = amountNum * solUsdPrice;
  const estimatedFee = 0.000025;
  const feeUsd = estimatedFee * (assets.find(a => a.isNative)?.price ?? solUsdPrice);

  const maxAmount = selectedAsset?.isNative
    ? Math.max(0, currentBalance - estimatedFee)
    : currentBalance;

  const setPercent = (pct: number) => {
    const val = maxAmount * pct;
    setAmount(val > 0 ? val.toFixed(selectedAsset?.isNative ? 6 : selectedAsset?.decimals ?? 6) : '0');
  };

  const handlePaste = async () => {
    try {
      const text = await Clipboard.getString();
      if (text?.trim()) { setRecipient(text.trim()); setError(null); }
    } catch {}
  };

  const handleBurn = async () => {
    setBurnError(null);
    if (!activeAddress || !selectedAsset || selectedAsset.isNative) { setBurnError('Select a SPL token to burn.'); return; }
    const burnAmt = parseFloat(burnAmount);
    if (isNaN(burnAmt) || burnAmt <= 0) { setBurnError('Enter a valid burn amount.'); return; }
    if (burnAmt > currentBalance) { setBurnError('Amount exceeds balance.'); return; }

    const result = await burnSplToken({
      fromAddress: activeAddress,
      tokenMint: selectedAsset.address,
      amount: burnAmt,
      decimals: selectedAsset.decimals,
      connectedWalletId: connectedWallet?.id ?? null,
      internalAccountIndex: selectedAccount?.accountIndex ?? 0,
      onStatus: setBurnStatus,
    });

    if (!result.success) {
      setBurnError(result.error || 'Burn failed');
      setBurnStatus('idle');
    } else {
      setBurnSig(result.signature ?? null);
      setBurnAmount('');
      if (refreshWallet) await refreshWallet();
    }
  };

  const handleSend = async () => {
    setError(null);
    if (!activeAddress) { setError('No wallet connected.'); return; }
    if (!selectedAsset) { setError('No token selected.'); return; }
    if (!recipient.trim() || !isValidAddress(recipient.trim())) { setError('Invalid recipient address.'); return; }
    if (isNaN(amountNum) || amountNum <= 0) { setError('Enter a valid amount.'); return; }
    if (amountNum > currentBalance) { setError('Insufficient balance.'); return; }

    setStep('preparing');
    try {
      const solanaService = SolanaConnectionService.getInstance();
      const connection = solanaService.getConnection();
      const fromPubkey = new PublicKey(activeAddress);
      const toPubkey = new PublicKey(recipient.trim());
      let transaction: Transaction;

      if (selectedAsset.isNative) {
        // Native SOL transfer — direct SystemProgram.transfer, never via Jupiter/swap
        const lamports = Math.floor(amountNum * LAMPORTS_PER_SOL);
        transaction = new Transaction().add(
          SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
        );
      } else {
        // ── SPL Token / Token-2022 transfer ─────────────────────────────────
        const SPL_TOKEN_PID  = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const TOKEN_2022_PID = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
        const ASSO_TOKEN_PID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8');
        const SYS_PID        = new PublicKey('11111111111111111111111111111111');

        const mintPubkey = new PublicKey(selectedAsset.address);
        const decimals   = selectedAsset.decimals;
        const rawAmount  = BigInt(Math.floor(amountNum * Math.pow(10, decimals)));

        // 1 — Detect token program (SPL Token vs Token-2022) from mint owner
        let tokenPid = SPL_TOKEN_PID;
        try {
          const mintInfo = await connection.getAccountInfo(mintPubkey);
          if (mintInfo?.owner.equals(TOKEN_2022_PID)) {
            tokenPid = TOKEN_2022_PID;
            console.log('[Send] Detected Token-2022 for mint:', selectedAsset.address);
          }
        } catch {
          console.warn('[Send] Could not detect token program; defaulting to SPL Token.');
        }
        const isToken2022 = tokenPid.equals(TOKEN_2022_PID);

        // 2 — Derive sender and recipient ATAs (seeds include token program ID)
        const [fromATA] = PublicKey.findProgramAddressSync(
          [fromPubkey.toBuffer(), tokenPid.toBuffer(), mintPubkey.toBuffer()],
          ASSO_TOKEN_PID
        );
        const [toATA] = PublicKey.findProgramAddressSync(
          [toPubkey.toBuffer(), tokenPid.toBuffer(), mintPubkey.toBuffer()],
          ASSO_TOKEN_PID
        );

        // 3 — Validate sender has a token account
        const fromATAInfo = await connection.getAccountInfo(fromATA);
        if (!fromATAInfo) {
          throw new Error('Token account not found. You do not hold this token in your wallet.');
        }

        transaction = new Transaction();

        // 4 — Create recipient ATA if it does not exist yet
        const toATAInfo = await connection.getAccountInfo(toATA);
        if (!toATAInfo) {
          transaction.add(new TransactionInstruction({
            programId: ASSO_TOKEN_PID,
            keys: [
              { pubkey: fromPubkey, isSigner: true,  isWritable: true  }, // payer
              { pubkey: toATA,      isSigner: false, isWritable: true  }, // new ATA
              { pubkey: toPubkey,   isSigner: false, isWritable: false }, // ATA owner
              { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint
              { pubkey: SYS_PID,    isSigner: false, isWritable: false }, // system program
              { pubkey: tokenPid,   isSigner: false, isWritable: false }, // token program
            ],
            data: Buffer.alloc(0), // discriminator 0 = Create
          }));
        }

        // 5 — Add transfer instruction
        if (isToken2022) {
          // Token-2022: use TransferChecked (discriminator 12) — required for extensions
          const txData = Buffer.alloc(10);
          txData.writeUInt8(12, 0);
          txData.writeBigUInt64LE(rawAmount, 1);
          txData.writeUInt8(decimals, 9);
          transaction.add(new TransactionInstruction({
            programId: tokenPid,
            keys: [
              { pubkey: fromATA,    isSigner: false, isWritable: true  }, // source
              { pubkey: mintPubkey, isSigner: false, isWritable: false }, // mint (required by TransferChecked)
              { pubkey: toATA,      isSigner: false, isWritable: true  }, // destination
              { pubkey: fromPubkey, isSigner: true,  isWritable: false }, // authority
            ],
            data: txData,
          }));
        } else {
          // SPL Token: Transfer (discriminator 3)
          const txData = Buffer.alloc(9);
          txData.writeUInt8(3, 0);
          txData.writeBigUInt64LE(rawAmount, 1);
          transaction.add(new TransactionInstruction({
            programId: tokenPid,
            keys: [
              { pubkey: fromATA,    isSigner: false, isWritable: true  }, // source
              { pubkey: toATA,      isSigner: false, isWritable: true  }, // destination
              { pubkey: fromPubkey, isSigner: true,  isWritable: false }, // authority
            ],
            data: txData,
          }));
        }
      }

      // Use retry helper — falls back to direct rpcCall if Connection fetch fails
      const { blockhash, lastValidBlockHeight } =
        await getLatestBlockhashWithRetry(solanaService);

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      let signature: string;
      setStep('signing');

      if (connectedWallet) {
        const provider = ExternalWalletAdapter.getProvider(connectedWallet.id);
        if (!provider) throw new Error('Wallet provider not available');
        const signed = await provider.signTransaction(transaction);
        setStep('sending');
        const rawTx = (signed as Transaction).serialize();
        signature = await sendRawTransactionWithRetry(solanaService, rawTx);
        await pollConfirmation(solanaService, signature);
      } else if (selectedAccount) {
        const walletManager = SecureWalletManager.getInstance();
        const mnemonic = await walletManager.getMnemonicUnlocked();
        const naclKeypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex || 0);
        // Wrap into a @solana/web3.js Keypair (secretKey = 64-byte seed+pubkey from nacl)
        const keypair = Keypair.fromSecretKey(naclKeypair.secretKey);
        transaction.sign(keypair);
        setStep('sending');
        const rawTx = transaction.serialize();
        signature = await sendRawTransactionWithRetry(solanaService, rawTx);
        await pollConfirmation(solanaService, signature);
      } else {
        throw new Error('No wallet available');
      }

      await saveRecipient(recipient.trim());
      setRecentRecipients(await loadRecentRecipients());
      setTxSignature(signature);
      setStep('success');
      if (refreshWallet) await refreshWallet();
    } catch (err: any) {
      let msg = (err?.message || 'Transaction failed').trim();
      if (msg.includes('rejected') || msg.includes('User rejected')) {
        msg = 'Transaction rejected in wallet';
      } else if (msg.includes('insufficient') || msg.includes('Insufficient')) {
        msg = 'Insufficient balance for this transaction';
      } else if (msg.includes('Token account not found') || msg.includes('do not hold')) {
        msg = err.message; // keep the specific message
      } else if (msg.includes('token account') || msg.includes('TokenAccount')) {
        msg = 'Token account missing — the recipient may not have this token';
      } else if (msg.includes('Confirmation timeout') || msg.includes('was not confirmed')) {
        msg = 'Confirmation timeout. Check Solana Explorer for the transaction status.';
      } else if (
        msg.includes('Load failed') ||
        msg.includes('Failed to fetch') ||
        msg.includes('RPC') ||
        msg.includes('connect') ||
        msg.includes('network')
      ) {
        msg = 'RPC connection failed. Please retry.';
      } else if (msg.includes('custom program error') || msg.includes('0x')) {
        msg = `Transaction failed: ${msg}`;
      }
      setError(msg);
      setStep('error');
    }
  };

  const canSend = !!recipient && isValidAddress(recipient) && amountNum > 0 && amountNum <= currentBalance && step === 'idle' || step === 'error';
  const isBusy = step === 'preparing' || step === 'signing' || step === 'sending';

  const stepLabel = step === 'preparing' ? 'Preparing transaction...'
    : step === 'signing' ? 'Confirm in wallet...'
    : step === 'sending' ? 'Sending...'
    : `Send ${selectedAsset?.symbol ?? 'SOL'}`;

  if (!activeAddress) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Send</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Connect or import a wallet to send tokens.</Text>
        </View>
      </View>
    );
  }

  if (step === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Send</Text>
          </View>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.successContainer}>
          <LinearGradient colors={['rgba(16,185,129,0.2)', 'rgba(16,185,129,0.04)']} style={styles.successIconWrap}>
            <CheckCircle size={52} color="#10b981" />
          </LinearGradient>
          <Text style={styles.successTitle}>Transaction Sent!</Text>
          <Text style={styles.successSubtext}>Your transaction was confirmed on Solana.</Text>
          {txSignature && (
            <View style={styles.sigBox}>
              <Text style={styles.sigText} numberOfLines={1} ellipsizeMode="middle">{txSignature}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.primaryBtn} onPress={() => { setStep('idle'); setAmount(''); setRecipient(''); setTxSignature(null); setError(null); }}>
            <SendIcon size={16} color="#fff" />
            <Text style={styles.primaryBtnText}>Send Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.ghostBtn} onPress={() => router.back()}>
            <Text style={styles.ghostBtnText}>Back to Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
            <ArrowLeft size={20} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Send</Text>
            <Text style={styles.headerSub}>Transfer tokens securely</Text>
          </View>
          <TouchableOpacity style={styles.headerBtn}>
            <Scan size={20} color="rgba(255,255,255,0.5)" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* Token Selector */}
          <TouchableOpacity style={styles.card} onPress={() => setShowAssetPicker(true)} activeOpacity={0.8}>
            {assetsLoading ? (
              <ActivityIndicator color={PURPLE} />
            ) : selectedAsset ? (
              <View style={styles.tokenRow}>
                <View style={styles.tokenLogoWrap}>
                  {selectedAsset.logoUrl && !logoErrors[selectedAsset.id] ? (
                    <Image
                      source={{ uri: selectedAsset.logoUrl }}
                      style={styles.tokenLogo}
                      onError={() => setLogoErrors(p => ({ ...p, [selectedAsset.id]: true }))}
                    />
                  ) : (
                    <View style={styles.tokenLogoFallback}>
                      <Text style={styles.tokenLogoFallbackText}>{selectedAsset.symbol.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.tokenInfo}>
                  <View style={styles.tokenNameRow}>
                    <Text style={styles.tokenName}>{selectedAsset.name}</Text>
                    <View style={styles.tokenTickerBadge}>
                      <Text style={styles.tokenTicker}>{selectedAsset.symbol}</Text>
                    </View>
                  </View>
                  <Text style={styles.tokenBalance}>
                    Balance: {currentBalance.toLocaleString(undefined, { maximumFractionDigits: selectedAsset.isNative ? 6 : 4 })} {selectedAsset.symbol}
                  </Text>
                  {selectedAsset.value > 0 && (
                    <Text style={styles.tokenUsd}>≈ ${selectedAsset.value.toFixed(2)}</Text>
                  )}
                </View>
                <ChevronDown size={18} color={PURPLE} />
              </View>
            ) : (
              <Text style={styles.placeholderText}>Select token</Text>
            )}
          </TouchableOpacity>

          {/* Recipient Address */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Recipient Address</Text>
              <TouchableOpacity style={styles.recentBtn} onPress={() => setShowRecent(p => !p)} activeOpacity={0.7}>
                <Clock size={12} color={PURPLE} />
                <Text style={styles.recentBtnText}>Recent</Text>
                <ChevronRight size={12} color={PURPLE} />
              </TouchableOpacity>
            </View>

            <View style={[styles.inputCard, recipient.length > 0 && !isValidAddress(recipient) && styles.inputCardError, recipient.length > 0 && isValidAddress(recipient) && styles.inputCardValid]}>
              <User size={16} color="rgba(255,255,255,0.3)" style={{ marginRight: 10 }} />
              <TextInput
                style={styles.addrInput}
                placeholder="Solana wallet address"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={recipient}
                onChangeText={(t) => { setRecipient(t); setError(null); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={handlePaste} activeOpacity={0.7} style={styles.pasteBtn}>
                <Copy size={16} color={PURPLE} />
              </TouchableOpacity>
            </View>

            {recipient.length > 0 && !isValidAddress(recipient) && (
              <Text style={styles.fieldError}>Enter a valid Solana address</Text>
            )}

            {/* Recent recipient chips */}
            {showRecent && recentRecipients.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentChipsScroll} contentContainerStyle={styles.recentChipsContent}>
                {recentRecipients.slice(0, 5).map(addr => (
                  <TouchableOpacity
                    key={addr}
                    style={styles.recentChip}
                    onPress={() => { setRecipient(addr); setShowRecent(false); setError(null); }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.recentChipAvatar}>
                      <User size={12} color={PURPLE} />
                    </View>
                    <Text style={styles.recentChipText}>{shortenAddr(addr)}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {showRecent && recentRecipients.length === 0 && (
              <Text style={styles.noRecentText}>No recent recipients yet</Text>
            )}
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>Amount</Text>
              <Text style={styles.balanceHint}>Balance: {currentBalance.toLocaleString(undefined, { maximumFractionDigits: selectedAsset?.isNative ? 6 : 4 })} {selectedAsset?.symbol}</Text>
            </View>

            <View style={styles.amountCard}>
              <View style={styles.amountRow}>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="rgba(255,255,255,0.2)"
                  value={amount}
                  onChangeText={(t) => { setAmount(t); setError(null); }}
                  keyboardType="decimal-pad"
                />
                <View style={styles.amountRight}>
                  <Text style={styles.amountSymbol}>{selectedAsset?.symbol ?? 'SOL'}</Text>
                  <TouchableOpacity style={styles.maxBtn} onPress={() => setPercent(1)} activeOpacity={0.8}>
                    <Text style={styles.maxBtnText}>MAX</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {amountNum > 0 && (
                <Text style={styles.amountUsd}>≈ ${amountUsd.toFixed(2)}</Text>
              )}
            </View>

            {/* Percent buttons */}
            <View style={styles.percentRow}>
              {[0.25, 0.5, 0.75, 1].map(pct => (
                <TouchableOpacity key={pct} style={styles.percentBtn} onPress={() => setPercent(pct)} activeOpacity={0.75}>
                  <Text style={styles.percentBtnText}>{pct * 100}%</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Network fee + summary */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryFeeRow}>
              <View style={styles.summaryFeeLeft}>
                <View style={styles.feeIconWrap}>
                  <Zap size={14} color={PURPLE} />
                </View>
                <View>
                  <Text style={styles.feeTitle}>Network Fee</Text>
                  <Text style={styles.feeTime}>Estimated time: <Text style={{ color: '#10b981' }}>~2–5 seconds</Text></Text>
                </View>
              </View>
              <View style={styles.summaryFeeRight}>
                <Text style={styles.feeAmount}>~{estimatedFee} SOL</Text>
                <Text style={styles.feeUsd}>≈ ${feeUsd.toFixed(4)}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>You will send</Text>
              <View style={styles.summaryValueCol}>
                <Text style={styles.summaryValue}>{amountNum > 0 ? amountNum.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '0.00'} {selectedAsset?.symbol ?? 'SOL'}</Text>
                {amountNum > 0 && <Text style={styles.summaryUsd}>≈ ${amountUsd.toFixed(2)}</Text>}
              </View>
            </View>
          </View>

          {/* Error */}
          {(error || (amountNum > currentBalance && amountNum > 0)) && (
            <View style={styles.errorBox}>
              <AlertCircle size={15} color="#ef4444" />
              <Text style={styles.errorText}>{error || 'Amount exceeds balance'}</Text>
            </View>
          )}

          {/* Burn Panel */}
          {selectedAsset && !selectedAsset.isNative && (
            <View style={styles.burnPanel}>
              <TouchableOpacity style={styles.burnHeader} onPress={() => setShowBurnPanel(p => !p)} activeOpacity={0.8}>
                <View style={styles.burnHeaderLeft}>
                  <View style={styles.burnIconWrap}>
                    <Text style={{ fontSize: 16 }}>🔥</Text>
                  </View>
                  <View>
                    <Text style={styles.burnTitle}>Burn Tokens</Text>
                    <Text style={styles.burnSub}>Permanently destroy {selectedAsset.symbol}</Text>
                  </View>
                </View>
                {showBurnPanel ? <ChevronDown size={16} color={PURPLE} /> : <X size={16} color="rgba(255,255,255,0.3)" />}
              </TouchableOpacity>

              {showBurnPanel && (
                <View style={styles.burnBody}>
                  <View style={styles.burnWarning}>
                    <AlertCircle size={14} color="#f59e0b" />
                    <Text style={styles.burnWarningText}>This action is permanent and cannot be undone.</Text>
                  </View>
                  <View style={styles.burnInputRow}>
                    <TextInput
                      style={styles.burnInput}
                      placeholder="Amount to burn"
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={burnAmount}
                      onChangeText={t => { setBurnAmount(t); setBurnError(null); setBurnSig(null); }}
                      keyboardType="decimal-pad"
                    />
                    <TouchableOpacity style={styles.burnMaxBtn} onPress={() => setBurnAmount(currentBalance.toFixed(4))} activeOpacity={0.8}>
                      <Text style={styles.burnMaxText}>MAX</Text>
                    </TouchableOpacity>
                  </View>
                  {burnError && (
                    <View style={styles.errorBox}>
                      <AlertCircle size={14} color="#ef4444" />
                      <Text style={styles.errorText}>{burnError}</Text>
                    </View>
                  )}
                  {burnSig && (
                    <Text style={{ fontSize: 11, color: '#10b981', fontWeight: '600', marginBottom: 8 }} numberOfLines={1} ellipsizeMode="middle">
                      Burned! {burnSig}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={[styles.burnBtn, (burnStatus === 'preparing' || burnStatus === 'signing' || burnStatus === 'sending') && styles.sendBtnDisabled]}
                    onPress={handleBurn}
                    disabled={burnStatus === 'preparing' || burnStatus === 'signing' || burnStatus === 'sending'}
                    activeOpacity={0.85}
                  >
                    {(burnStatus === 'preparing' || burnStatus === 'signing' || burnStatus === 'sending') ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>
                        {burnStatus === 'idle' || burnStatus === 'failed' || burnStatus === 'confirmed' ? `BURN ${selectedAsset.symbol}` : 'Processing...'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Send button */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.sendBtn, (!canSend || isBusy) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!canSend || isBusy}
            activeOpacity={0.85}
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <SendIcon size={16} color="#fff" />
            )}
            <Text style={styles.sendBtnText}>{stepLabel}</Text>
          </TouchableOpacity>
          <Text style={styles.footerNote}>Non-custodial · We never access your private keys</Text>
        </View>
      </KeyboardAvoidingView>

      {/* Asset picker modal */}
      <Modal visible={showAssetPicker} transparent animationType="slide" presentationStyle="overFullScreen">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAssetPicker(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Select Token</Text>
              <TouchableOpacity onPress={() => setShowAssetPicker(false)}>
                <X size={20} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {assets.length === 0 ? (
                <Text style={styles.noAssetsText}>No tokens found in wallet</Text>
              ) : assets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={[styles.assetRow, selectedAsset?.id === asset.id && styles.assetRowActive]}
                  onPress={() => { setSelectedAsset(asset); setShowAssetPicker(false); setAmount(''); }}
                  activeOpacity={0.8}
                >
                  <View style={styles.assetLogoWrap}>
                    {asset.logoUrl && !logoErrors[asset.id] ? (
                      <Image
                        source={{ uri: asset.logoUrl }}
                        style={styles.assetLogo}
                        onError={() => setLogoErrors(p => ({ ...p, [asset.id]: true }))}
                      />
                    ) : (
                      <View style={styles.assetLogoFallback}>
                        <Text style={styles.assetLogoFallbackText}>{asset.symbol.slice(0, 2).toUpperCase()}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetName}>{asset.symbol}</Text>
                    <Text style={styles.assetBalance}>{asset.uiBalance.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.symbol}</Text>
                  </View>
                  <View style={styles.assetValueCol}>
                    {asset.value > 0 && <Text style={styles.assetValue}>${asset.value.toFixed(2)}</Text>}
                    {selectedAsset?.id === asset.id && <CheckCircle size={18} color="#10b981" />}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : 44,
    paddingBottom: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  // Token selector card
  card: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  tokenRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tokenLogoWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    marginRight: 14,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.25)',
  },
  tokenLogo: { width: 48, height: 48, borderRadius: 24 },
  tokenLogoFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: PURPLE_DIM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tokenLogoFallbackText: { fontSize: 16, fontWeight: '800', color: PURPLE },
  tokenInfo: { flex: 1 },
  tokenNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 3 },
  tokenName: { fontSize: fontSize.md, fontWeight: '700', color: '#fff' },
  tokenTickerBadge: {
    backgroundColor: PURPLE_DIM,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
  },
  tokenTicker: { fontSize: 11, fontWeight: '700', color: PURPLE },
  tokenBalance: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 1 },
  tokenUsd: { fontSize: 12, color: PURPLE, fontWeight: '600' },
  placeholderText: { color: 'rgba(255,255,255,0.3)', fontSize: fontSize.md },
  // Section
  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: '#fff' },
  balanceHint: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  recentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recentBtnText: { fontSize: 13, fontWeight: '600', color: PURPLE },
  // Input card
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  inputCardError: { borderColor: 'rgba(239,68,68,0.5)' },
  inputCardValid: { borderColor: 'rgba(16,185,129,0.4)' },
  addrInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 14,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  pasteBtn: {
    padding: 8,
  },
  fieldError: { fontSize: 12, color: '#ef4444', marginTop: 6 },
  // Recent chips
  recentChipsScroll: { marginTop: 10 },
  recentChipsContent: { gap: 8, paddingVertical: 2 },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PURPLE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  recentChipAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(139,92,246,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recentChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  noRecentText: { fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 8, textAlign: 'center' },
  // Amount
  amountCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center' },
  amountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  amountRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  amountSymbol: { fontSize: 16, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  maxBtn: {
    backgroundColor: PURPLE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.4)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  maxBtnText: { fontSize: 13, fontWeight: '800', color: PURPLE },
  amountUsd: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  // Percent row
  percentRow: { flexDirection: 'row', gap: 8 },
  percentBtn: {
    flex: 1,
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  percentBtnText: { fontSize: 13, fontWeight: '700', color: PURPLE },
  // Summary card
  summaryCard: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 16,
    padding: 16,
    marginBottom: spacing.lg,
  },
  summaryFeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryFeeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  feeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PURPLE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  feeTitle: { fontSize: 14, fontWeight: '600', color: '#fff' },
  feeTime: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  summaryFeeRight: { alignItems: 'flex-end' },
  feeAmount: { fontSize: 14, fontWeight: '700', color: '#fff' },
  feeUsd: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    marginVertical: 14,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  summaryLabel: { fontSize: 14, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  summaryValueCol: { alignItems: 'flex-end' },
  summaryValue: { fontSize: 20, fontWeight: '800', color: '#fff' },
  summaryUsd: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  // Error
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: spacing.lg,
  },
  errorText: { fontSize: 13, color: '#ef4444', flex: 1 },
  // Footer
  footer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 32 : 20,
    paddingTop: 10,
    backgroundColor: BG,
    borderTopWidth: 1,
    borderTopColor: GLASS_BORDER,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PURPLE,
    paddingVertical: 16,
    borderRadius: 50,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(139,92,246,0.3)',
    shadowOpacity: 0,
  },
  sendBtnText: { fontSize: 17, fontWeight: '800', color: '#fff' },
  footerNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    textAlign: 'center',
    marginTop: 10,
  },
  // Success
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: spacing.xxl,
  },
  successIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  successTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  successSubtext: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
  sigBox: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: GLASS_BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    width: '100%',
  },
  sigText: { fontSize: 12, color: PURPLE, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: PURPLE,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 50,
    shadowColor: PURPLE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  ghostBtn: { paddingVertical: 10 },
  ghostBtnText: { fontSize: 14, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.xxl },
  emptyText: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#110820',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: GLASS_BORDER,
    padding: 20,
    paddingBottom: 40,
    maxHeight: '80%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#fff' },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
  },
  assetRowActive: {
    backgroundColor: PURPLE_DIM,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderBottomColor: 'transparent',
  },
  assetLogoWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    marginRight: 12,
    backgroundColor: PURPLE_DIM,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  assetLogo: { width: 42, height: 42, borderRadius: 21 },
  assetLogoFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: PURPLE_DIM,
    justifyContent: 'center',
    alignItems: 'center',
  },
  assetLogoFallbackText: { fontSize: 13, fontWeight: '800', color: PURPLE },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 15, fontWeight: '700', color: '#fff' },
  assetBalance: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  assetValueCol: { alignItems: 'flex-end', gap: 4 },
  assetValue: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  noAssetsText: { fontSize: 14, color: 'rgba(255,255,255,0.35)', textAlign: 'center', paddingVertical: 32 },
  // Burn
  burnPanel: {
    backgroundColor: GLASS,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
  },
  burnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  burnHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  burnIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(239,68,68,0.1)',
    justifyContent: 'center', alignItems: 'center',
  },
  burnTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  burnSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  burnBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  burnWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.3)',
  },
  burnWarningText: { fontSize: 12, color: '#f59e0b', flex: 1 },
  burnInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  burnInput: {
    flex: 1, backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BORDER,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: '#fff', fontSize: 16, fontWeight: '600',
  },
  burnMaxBtn: {
    backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  burnMaxText: { fontSize: 13, fontWeight: '800', color: '#ef4444' },
  burnBtn: {
    backgroundColor: '#ef4444', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
});
