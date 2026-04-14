# Wallet Derivation Test Guide

## How to Verify Phantom Compatibility

### Test 1: Use Standard Test Vector

The BIP39 specification includes standard test vectors. Here's one that you can verify:

**Test Mnemonic (12 words):**
```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

**Expected Results:**
- **BIP39 Seed (hex):** Should start with `5eb00bbddc...` (64 bytes / 128 hex chars)
- **Solana Address (m/44'/501'/0'/0'):** Should be a valid base58 Solana address

### Test 2: Import Your Phantom Wallet

1. **Get Your Phantom Seed Phrase:**
   - Open Phantom extension
   - Go to Settings → Security & Privacy
   - Tap "Show Recovery Phrase"
   - Copy your 12 or 24 words

2. **Note Your Phantom Address:**
   - Go to your main Phantom account
   - Copy your Solana address (starts with capital letters/numbers)
   - Example: `7x6Q2K...` (full 44 characters)

3. **Import in App:**
   - Open the app
   - Choose "Import Wallet"
   - Paste your recovery phrase
   - The generated address should **EXACTLY match** your Phantom address

4. **Verify Balance:**
   - Check your balance in the app
   - It should match your Phantom wallet balance
   - This confirms you're accessing the same on-chain account

### Test 3: Multi-Account Verification

If you have multiple accounts in Phantom:

1. **In Phantom:**
   - Note Address for Account 1 (default)
   - Note Address for Account 2
   - Note Address for Account 3 (if exists)

2. **In App:**
   - Import wallet with same seed phrase
   - Default account should match Phantom Account 1
   - Add Account 2 → should match Phantom Account 2
   - Add Account 3 → should match Phantom Account 3

All addresses must match exactly.

---

## Common Test Cases

### Case 1: Fresh Wallet Creation

**Steps:**
1. Create new wallet in app
2. Save the 12-word recovery phrase
3. Note the generated Solana address
4. Open Phantom
5. Import the same 12-word phrase
6. Compare addresses

**Expected:** ✅ Addresses match exactly

---

### Case 2: Transaction Signing

**Steps:**
1. Import wallet with small amount (0.01 SOL)
2. Try to swap 0.005 SOL for a token
3. Sign the transaction
4. Check transaction on Solscan

**Expected:**
- ✅ Transaction is accepted by network
- ✅ Signature is valid
- ✅ Transaction shows correct sender address
- ✅ Can view on https://solscan.io

---

### Case 3: Multiple Wallets

**Scenario:** You have 2 different Phantom wallets (different seed phrases)

**Steps:**
1. Import Wallet A seed phrase → note address
2. Import Wallet B seed phrase → note address
3. Compare with Phantom

**Expected:**
- ✅ Wallet A address matches Phantom Wallet A
- ✅ Wallet B address matches Phantom Wallet B
- ✅ No address collision or confusion

---

## Debugging Failed Imports

If addresses don't match:

### Check 1: Word Count
```
✅ Valid: 12 words
✅ Valid: 24 words
❌ Invalid: Any other count
```

### Check 2: Word Spelling
```
❌ "abondon" → Wrong spelling
✅ "abandon" → Correct
```

Each word must be from the BIP39 English wordlist.

### Check 3: Word Order
```
❌ Wrong order = Different wallet
✅ Exact order matters
```

### Check 4: Extra Spaces
```
❌ "word1  word2" (double space)
✅ "word1 word2" (single space)
```

The app trims and normalizes spaces automatically.

### Check 5: Case Sensitivity
```
✅ "Abandon Abandon..." works
✅ "abandon abandon..." works
✅ "ABANDON ABANDON..." works
```

BIP39 is case-insensitive.

---

## Network Verification

After importing, verify on Solana blockchain:

### Check Balance
```bash
# Using Solana CLI (if installed)
solana balance YOUR_ADDRESS

# Or check on:
https://solscan.io/account/YOUR_ADDRESS
```

### Check Transaction History
```
1. Go to https://solscan.io
2. Enter your address
3. Verify transaction history matches Phantom
```

### Execute Test Transaction
```
1. Send 0.001 SOL to yourself
2. Check transaction appears in:
   - App transaction history
   - Phantom transaction history
   - Solscan explorer
3. All should show same transaction
```

---

## Example Test Addresses

**⚠️ WARNING: These are PUBLIC test mnemonics. NEVER use for real funds!**

### Test Vector 1 (Derivation Index 0)
```
Mnemonic: abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
Path: m/44'/501'/0'/0'
Expected Address: (depends on library - verify with Phantom)
```

### Test Vector 2 (Custom)
```
You can create your own test:
1. Generate new wallet in Phantom
2. Note the seed phrase
3. Note the address
4. Use as test case
5. ⚠️ Only use with small amounts!
```

---

## Integration Test Script

Here's a conceptual test you could implement:

```typescript
// Conceptual test - not actual code in project
import { KeyDerivationManager } from '@/lib/crypto/keyDerivation';
import { PublicKey } from '@solana/web3.js';

describe('Phantom Compatibility', () => {
  it('should derive same address as Phantom', () => {
    // Use your own test mnemonic
    const testMnemonic = 'YOUR TEST MNEMONIC HERE';

    // Expected address from Phantom
    const phantomAddress = 'YOUR_PHANTOM_ADDRESS';

    // Derive in app
    const keypair = KeyDerivationManager.deriveSolanaKeyPair(testMnemonic, 0);
    const appAddress = new PublicKey(keypair.publicKey).toBase58();

    // Must match exactly
    expect(appAddress).toBe(phantomAddress);
  });

  it('should derive multiple accounts correctly', () => {
    const testMnemonic = 'YOUR TEST MNEMONIC HERE';

    // Account 1
    const kp0 = KeyDerivationManager.deriveSolanaKeyPair(testMnemonic, 0);
    const addr0 = new PublicKey(kp0.publicKey).toBase58();

    // Account 2
    const kp1 = KeyDerivationManager.deriveSolanaKeyPair(testMnemonic, 1);
    const addr1 = new PublicKey(kp1.publicKey).toBase58();

    // Should be different
    expect(addr0).not.toBe(addr1);

    // Should match Phantom Account 1 and 2
    expect(addr0).toBe('PHANTOM_ACCOUNT_1_ADDRESS');
    expect(addr1).toBe('PHANTOM_ACCOUNT_2_ADDRESS');
  });
});
```

---

## Success Criteria

✅ **Wallet Import Working** when:

1. ✅ Imported address matches Phantom exactly
2. ✅ Balance matches blockchain reality
3. ✅ Can sign transactions successfully
4. ✅ Transactions appear on Solscan
5. ✅ Multi-account derivation works
6. ✅ All accounts match Phantom accounts

---

## Real-World Test

**The Ultimate Test:**

1. Create wallet in Phantom
2. Send 0.01 SOL to it from another wallet
3. Import in app using seed phrase
4. Verify balance shows 0.01 SOL
5. Send 0.005 SOL back
6. Check both Phantom and app show 0.005 SOL

**If this works:** ✅ Import system is 100% correct!

---

## Troubleshooting

### "Invalid mnemonic phrase"
- Check word count (12 or 24)
- Check spelling of each word
- Verify words are from BIP39 wordlist

### "Address doesn't match"
- Verify you're comparing the same account index
- Phantom's first account = Account Index 0
- Check no extra passphrase in Phantom (advanced feature)

### "Transaction signing fails"
- Verify wallet is unlocked
- Check network connection
- Ensure sufficient SOL for fees
- Verify RPC endpoint is responding

### "Balance shows 0"
- Wait for blockchain sync
- Check address on Solscan
- Verify correct network (mainnet vs devnet)
- Refresh wallet manually

---

## Developer Notes

### Derivation Path Reference

```
Phantom's paths:
- Account 1: m/44'/501'/0'/0'
- Account 2: m/44'/501'/1'/0'
- Account 3: m/44'/501'/2'/0'
- Account N: m/44'/501'/(N-1)'/0'

Note: Account index is 0-based (first account = index 0)
```

### Libraries Must Match

For 100% compatibility:
- ✅ Use `@scure/bip39` for mnemonic → seed
- ✅ Use `ed25519-hd-key` for HD derivation
- ✅ Use `tweetnacl` for keypair generation
- ✅ Use `@solana/web3.js` for address encoding

These are the same libraries (or equivalents) used by Phantom.

---

## Final Verification Checklist

Before considering import system complete:

- [ ] Test mnemonic validation (accept 12/24 words)
- [ ] Import Phantom wallet, address matches
- [ ] Import Phantom wallet, balance matches
- [ ] Create wallet in app, import in Phantom, matches
- [ ] Sign test transaction successfully
- [ ] View transaction on blockchain explorer
- [ ] Test multi-account derivation
- [ ] All accounts match Phantom
- [ ] Test with 12-word mnemonic
- [ ] Test with 24-word mnemonic
- [ ] Build completes without errors
- [ ] TypeScript passes without errors

**When all boxes checked:** ✅ Wallet import is production ready!
