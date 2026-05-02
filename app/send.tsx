import { useState, useEffect } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ChevronDown, CircleCheck as CheckCircle, CircleAlert as AlertCircle } from 'lucide-react-native';
import { useWallet } from '@/contexts/WalletContext';
import { colors, spacing, borderRadius, fontSize } from '@/constants/theme';
import {
  PublicKey,
  Keypair,
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

type SendStatus = 'idle' | 'sending' | 'success' | 'error';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export default function SendScreen() {
  const router = useRouter();
  const { tokens, selectedAccount, connectedWallet, activeAddress, refreshWallet } = useWallet();
  const [assets, setAssets] = useState<WalletAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<WalletAsset | null>(null);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  useEffect(() => {
    if (activeAddress) {
      walletAssetLoader.loadSolanaWalletAssets(activeAddress).then((res) => {
        setAssets(res.assets);
        if (res.assets.length > 0) setSelectedAsset(res.assets[0]);
      }).catch(() => {});
    }
  }, [activeAddress]);

  const isValidAddress = (addr: string): boolean => {
    try {
      new PublicKey(addr);
      return true;
    } catch {
      return false;
    }
  };

  const handleSend = async () => {
    setError(null);

    if (!activeAddress) {
      setError('No wallet connected.');
      return;
    }
    if (!selectedAsset) {
      setError('No token selected.');
      return;
    }
    if (!recipient.trim() || !isValidAddress(recipient.trim())) {
      setError('Invalid recipient address.');
      return;
    }
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Invalid amount.');
      return;
    }
    if (amountNum > selectedAsset.uiBalance) {
      setError('Insufficient balance.');
      return;
    }

    setStatus('sending');
    try {
      const connection = SolanaConnectionService.getInstance().getConnection();
      const fromPubkey = new PublicKey(activeAddress);
      const toPubkey = new PublicKey(recipient.trim());

      let transaction: Transaction;

      if (selectedAsset.isNative) {
        // SOL transfer
        const lamports = Math.floor(amountNum * LAMPORTS_PER_SOL);
        transaction = new Transaction().add(
          SystemProgram.transfer({ fromPubkey, toPubkey, lamports })
        );
      } else {
        // SPL token transfer using raw instruction (no spl-token package needed)
        const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bv8');

        const mintPubkey = new PublicKey(selectedAsset.address);
        const tokenAmount = BigInt(Math.floor(amountNum * Math.pow(10, selectedAsset.decimals)));

        // Derive ATAs deterministically
        const [fromATA] = await PublicKey.findProgramAddressSync(
          [fromPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const [toATA] = await PublicKey.findProgramAddressSync(
          [toPubkey.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
          ASSOCIATED_TOKEN_PROGRAM_ID
        );

        transaction = new Transaction();

        // Create destination ATA if it doesn't exist
        const toATAInfo = await connection.getAccountInfo(toATA);
        if (!toATAInfo) {
          // createAssociatedTokenAccount instruction
          transaction.add(new TransactionInstruction({
            programId: ASSOCIATED_TOKEN_PROGRAM_ID,
            keys: [
              { pubkey: fromPubkey, isSigner: true, isWritable: true },
              { pubkey: toATA, isSigner: false, isWritable: true },
              { pubkey: toPubkey, isSigner: false, isWritable: false },
              { pubkey: mintPubkey, isSigner: false, isWritable: false },
              { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            ],
            data: Buffer.alloc(0),
          }));
        }

        // SPL Transfer instruction layout (3 = transfer, 8 bytes amount)
        const data = Buffer.alloc(9);
        data.writeUInt8(3, 0); // transfer instruction
        data.writeBigUInt64LE(tokenAmount, 1);

        transaction.add(new TransactionInstruction({
          programId: TOKEN_PROGRAM_ID,
          keys: [
            { pubkey: fromATA, isSigner: false, isWritable: true },
            { pubkey: toATA, isSigner: false, isWritable: true },
            { pubkey: fromPubkey, isSigner: true, isWritable: false },
          ],
          data,
        }));
      }

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = fromPubkey;

      let signature: string;

      if (connectedWallet) {
        // External wallet — request signature via provider
        const provider = ExternalWalletAdapter.getProvider(connectedWallet.id);
        if (!provider) throw new Error('Wallet provider not available');
        const signed = await provider.signTransaction(transaction);
        const rawTx = signed.serialize();
        signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      } else if (selectedAccount) {
        // Internal wallet — sign with derived keypair (auto-unlocks if needed)
        const walletManager = SecureWalletManager.getInstance();
        const mnemonic = await walletManager.getMnemonicUnlocked();
        const naclKeypair = KeyDerivationManager.deriveSolanaKeyPair(mnemonic, selectedAccount.accountIndex || 0);
        const keypair = Keypair.fromSecretKey(naclKeypair.secretKey);

        transaction.sign(keypair);
        const rawTx = transaction.serialize();
        signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });
        await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
      } else {
        throw new Error('No wallet available');
      }

      setTxSignature(signature);
      setStatus('success');
      if (refreshWallet) await refreshWallet();
    } catch (err: any) {
      console.error('[Send] Error:', err);
      let msg = err?.message || 'Transaction failed';
      if (msg.includes('rejected') || msg.includes('User rejected')) msg = 'Transaction rejected in wallet';
      else if (msg.includes('insufficient') || msg.includes('balance')) msg = 'Insufficient balance';
      setError(msg);
      setStatus('error');
    }
  };

  if (!activeAddress) {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centeredContent}>
          <Text style={styles.noWalletText}>Connect or import a wallet to send funds.</Text>
        </View>
      </LinearGradient>
    );
  }

  if (status === 'success') {
    return (
      <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centeredContent}>
          <CheckCircle size={64} color={colors.success} />
          <Text style={styles.successTitle}>Transaction Sent</Text>
          <Text style={styles.successSubtext}>Your transaction was confirmed on Solana.</Text>
          {txSignature && (
            <Text style={styles.sigText} numberOfLines={1} ellipsizeMode="middle">
              {txSignature}
            </Text>
          )}
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => { setStatus('idle'); setAmount(''); setRecipient(''); setTxSignature(null); }}
          >
            <Text style={styles.primaryButtonText}>Send Again</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backLinkButton} onPress={() => router.back()}>
            <Text style={styles.backLinkText}>Back</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  const currentBalance = selectedAsset?.uiBalance ?? 0;
  const estimatedFee = selectedAsset?.isNative ? 0.000025 : 0.000025;

  return (
    <LinearGradient colors={colors.gradient.primary as any} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <ArrowLeft size={24} color={colors.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Token selector */}
          <View style={styles.section}>
            <Text style={styles.label}>Token</Text>
            <TouchableOpacity style={styles.tokenSelector} onPress={() => setShowAssetPicker(true)}>
              <View style={styles.tokenIcon}>
                <Text style={styles.tokenSymbolText}>
                  {(selectedAsset?.symbol ?? 'SOL').substring(0, 2)}
                </Text>
              </View>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenName}>{selectedAsset?.symbol ?? 'SOL'}</Text>
                <Text style={styles.tokenBalance}>
                  Balance: {currentBalance.toFixed(selectedAsset?.isNative ? 6 : 4)} {selectedAsset?.symbol}
                </Text>
              </View>
              <ChevronDown size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Recipient */}
          <View style={styles.section}>
            <Text style={styles.label}>Recipient Address</Text>
            <TextInput
              style={[styles.input, recipient && !isValidAddress(recipient) && styles.inputError]}
              placeholder="Solana wallet address"
              placeholderTextColor={colors.textMuted}
              value={recipient}
              onChangeText={(t) => { setRecipient(t); setError(null); }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {recipient.length > 0 && !isValidAddress(recipient) && (
              <Text style={styles.fieldError}>Invalid Solana address</Text>
            )}
          </View>

          {/* Amount */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Amount</Text>
              <TouchableOpacity onPress={() => {
                const maxAmt = selectedAsset?.isNative
                  ? Math.max(0, currentBalance - estimatedFee)
                  : currentBalance;
                setAmount(maxAmt.toFixed(selectedAsset?.decimals ?? 6));
              }}>
                <Text style={styles.maxButton}>MAX</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.amountContainer}>
              <TextInput
                style={styles.amountInput}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                value={amount}
                onChangeText={(t) => { setAmount(t); setError(null); }}
                keyboardType="decimal-pad"
              />
              <Text style={styles.amountSymbol}>{selectedAsset?.symbol ?? 'SOL'}</Text>
            </View>
            {amount && selectedAsset?.price ? (
              <Text style={styles.amountUSD}>
                ≈ ${(parseFloat(amount) * selectedAsset.price).toFixed(2)} USD
              </Text>
            ) : null}
          </View>

          {/* Fee info */}
          <View style={styles.feeBox}>
            <View style={styles.feeRow}>
              <Text style={styles.feeLabel}>Network fee</Text>
              <Text style={styles.feeAmount}>~{estimatedFee} SOL</Text>
            </View>
            <Text style={styles.feeTime}>Confirmed in ~2-5 seconds</Text>
          </View>

          {/* Error */}
          {error && (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (status === 'sending' || !recipient || !amount || !selectedAsset) && styles.sendButtonDisabled,
            ]}
            onPress={handleSend}
            disabled={status === 'sending' || !recipient || !amount || !selectedAsset}
          >
            {status === 'sending' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Text style={styles.sendButtonText}>Send {selectedAsset?.symbol}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Asset picker modal */}
      <Modal visible={showAssetPicker} transparent animationType="slide" presentationStyle="overFullScreen">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowAssetPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <Text style={styles.modalTitle}>Select Token</Text>
              {assets.map((asset) => (
                <TouchableOpacity
                  key={asset.id}
                  style={styles.assetRow}
                  onPress={() => { setSelectedAsset(asset); setShowAssetPicker(false); setAmount(''); }}
                >
                  <View style={styles.tokenIcon}>
                    <Text style={styles.tokenSymbolText}>{(asset.symbol ?? '??').substring(0, 2)}</Text>
                  </View>
                  <View style={styles.tokenInfo}>
                    <Text style={styles.tokenName}>{asset.symbol}</Text>
                    <Text style={styles.tokenBalance}>{asset.uiBalance.toFixed(4)}</Text>
                  </View>
                  {selectedAsset?.id === asset.id && (
                    <CheckCircle size={20} color={colors.success} />
                  )}
                </TouchableOpacity>
              ))}
              {assets.length === 0 && (
                <Text style={styles.noAssetsText}>No tokens found in wallet</Text>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
    paddingTop: 60,
    paddingBottom: spacing.xl,
  },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.textPrimary },
  content: { flex: 1, paddingHorizontal: spacing.xxl },
  centeredContent: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xxl },
  noWalletText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', fontWeight: '600' },
  section: { marginBottom: spacing.xxl },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  maxButton: { fontSize: fontSize.sm, fontWeight: '700', color: colors.primary },
  tokenSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  tokenIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryMuted,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  tokenSymbolText: { fontSize: fontSize.md, fontWeight: '700', color: colors.primary },
  tokenInfo: { flex: 1 },
  tokenName: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary, marginBottom: 2 },
  tokenBalance: { fontSize: fontSize.xs, color: colors.textMuted },
  input: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  inputError: { borderColor: colors.error },
  fieldError: { fontSize: fontSize.xs, color: colors.error, marginTop: spacing.xs },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
  },
  amountInput: { flex: 1, color: colors.textPrimary, fontSize: 24, fontWeight: '700', paddingVertical: spacing.lg },
  amountSymbol: { fontSize: fontSize.lg, fontWeight: '600', color: colors.textSecondary },
  amountUSD: { fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.xs },
  feeBox: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  feeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  feeLabel: { fontSize: fontSize.sm, color: colors.textSecondary },
  feeAmount: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textPrimary },
  feeTime: { fontSize: fontSize.xs, color: colors.textMuted },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.errorMuted,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { fontSize: fontSize.sm, color: colors.error, flex: 1 },
  footer: { padding: spacing.xxl },
  sendButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  sendButtonDisabled: { backgroundColor: colors.surfaceBorder },
  sendButtonText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  successTitle: { fontSize: fontSize.xxl, fontWeight: '800', color: colors.textPrimary },
  successSubtext: { fontSize: fontSize.md, color: colors.textSecondary, textAlign: 'center' },
  sigText: { fontSize: fontSize.xs, color: colors.primary, fontFamily: 'SpaceMono-Regular', maxWidth: '100%' },
  primaryButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xxxl,
    borderRadius: borderRadius.md,
    marginTop: spacing.lg,
  },
  primaryButtonText: { fontSize: fontSize.lg, fontWeight: '700', color: colors.white },
  backLinkButton: { paddingVertical: spacing.md },
  backLinkText: { fontSize: fontSize.md, color: colors.textMuted, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.xxl,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.surfaceLight,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  modalTitle: { fontSize: fontSize.xl, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.lg },
  assetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  noAssetsText: { fontSize: fontSize.md, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xxl },
});
