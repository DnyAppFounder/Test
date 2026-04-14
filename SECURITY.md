# CryptoWallet X - Security Documentation

## Overview
This document outlines the security architecture, implementation details, and audit requirements for CryptoWallet X, a production-ready multi-chain cryptocurrency wallet.

## Security Architecture

### 1. Key Management

#### Mnemonic Generation
- Uses `@scure/bip39` library for BIP39-compliant mnemonic generation
- Cryptographically secure random generation via `crypto.getRandomValues()`
- Supports 12-word (128-bit) and 24-word (256-bit) mnemonics
- Validates mnemonics using BIP39 wordlist checksums

#### Key Derivation
- **Solana**: BIP44 path `m/44'/501'/x'/0'` using Ed25519 curve
- **EVM chains**: BIP44 path `m/44'/60'/0'/0/x` using secp256k1 curve
- Derivation library: `ed25519-hd-key` for Solana, `@scure/bip32` for EVM
- Each account uses deterministic derivation from the master seed

#### Encryption at Rest
- Mnemonic encrypted using AES-256-GCM
- Password-based key derivation: PBKDF2 with 100,000 iterations
- Random salt generation (16 bytes) for each encryption
- Encrypted data stored in Expo SecureStore (iOS Keychain / Android Keystore)

### 2. Storage Security

#### Expo SecureStore Limitations
⚠️ **CRITICAL**: Expo SecureStore is NOT sufficient for production wallets managing real funds.

**Current Implementation**:
- Uses Expo SecureStore for encrypted mnemonic storage
- Backed by iOS Keychain (with kSecAttrAccessibleWhenUnlockedThisDeviceOnly)
- Backed by Android EncryptedSharedPreferences

**Production Requirements**:
- Migrate to hardware-backed keystores:
  - iOS: Use Secure Enclave via `kSecAttrTokenIDSecureEnclave`
  - Android: Use StrongBox/TEE via `setUserAuthenticationRequired(true)`
- Implement `react-native-keychain` with biometric requirement
- Add tamper detection (jailbreak/root detection)

#### Data Classification
1. **Critical (Encrypted in SecureStore)**:
   - Mnemonic phrase
   - Encryption salt

2. **Sensitive (AsyncStorage)**:
   - Account configuration
   - Derived public addresses
   - Account names

3. **Public (In-memory only)**:
   - Decrypted mnemonic (session-based)
   - Derived private keys (never persisted)

### 3. Blockchain Security

#### Solana Integration
- RPC endpoint: `https://api.mainnet-beta.solana.com`
- Transaction signing: Ed25519 using `tweetnacl`
- Balance fetching: `getBalance()` with confirmed commitment
- Transaction confirmation: Wait for confirmed status before UI update
- Fee estimation: Dynamic via `getFeeForMessage()`

**Security Measures**:
- Address validation before transactions
- Balance verification before signing
- Slippage protection on swaps
- Transaction simulation (recommended for production)

#### EVM Integration
- Supported chains: Ethereum, Polygon, Base
- RPC providers: Public endpoints (should migrate to Alchemy/Infura for production)
- Transaction signing: ethers.js Wallet
- Gas estimation: `estimateGas()` with 20% buffer

**Security Measures**:
- EIP-55 checksum address validation
- Nonce management for transaction ordering
- Gas price limits to prevent overpayment
- Transaction status polling until confirmation

### 4. Transaction Security

#### Pre-Transaction Validations
1. Wallet unlock status check
2. Recipient address format validation
3. Sufficient balance verification (including fees)
4. Amount sanity checks (> 0, not NaN)
5. Network connectivity verification

#### Signing Process
1. Derive private key from encrypted mnemonic (in-memory only)
2. Construct transaction with all parameters
3. Sign transaction with derived private key
4. Immediately zero-out private key from memory
5. Broadcast signed transaction
6. Monitor confirmation status

#### Post-Transaction
- Store transaction hash (not signed transaction)
- Poll for confirmation status
- Update balance cache after confirmation
- Log to transaction history

### 5. Authentication & Access Control

#### Wallet Locking
- Wallet locks automatically when:
  - App enters background (iOS/Android lifecycle)
  - Manual lock by user
  - Timeout period expires (configurable)
- Locked wallet requires password re-entry
- Mnemonic purged from memory on lock

#### Biometric Authentication
- Supported: Face ID, Touch ID, Fingerprint
- Implementation: `expo-local-authentication`
- Hardware-backed biometric verification
- Fallback to password if biometric fails

**Production Enhancements Needed**:
- Implement hardware-backed key attestation
- Add anti-phishing visual verification
- Implement multi-factor authentication option

### 6. Network Security

#### RPC Connections
- All connections over HTTPS/TLS
- Certificate pinning (recommended for production)
- Request timeout limits (60s max)
- Retry logic with exponential backoff

#### API Security
- CoinGecko API for price data (public, rate-limited)
- Supabase connection with RLS policies
- No API keys stored in client code
- Environment variable isolation

### 7. Attack Mitigation

#### Clipboard Attacks
- Clipboard cleared after 30 seconds when copying addresses
- Sensitive data never auto-copied
- Visual confirmation before pasting addresses

#### Screen Capture Prevention
- Seed phrase screens marked as secure (FLAG_SECURE on Android)
- Balance hiding feature for privacy

#### Phishing Protection
- Domain verification for dApp connections
- Transaction detail review before signing
- Clear warning for irreversible operations

#### Man-in-the-Middle
- HTTPS enforcement for all network requests
- Certificate validation
- No HTTP fallback

## Known Vulnerabilities & Limitations

### Critical
1. **Expo SecureStore**: Not hardware-backed on all devices
   - **Mitigation**: Migrate to native modules with hardware attestation
   - **Timeline**: Before production launch

2. **Private Key in Memory**: Derived keys exist in JavaScript heap
   - **Mitigation**: Minimize key lifetime, implement memory clearing
   - **Timeline**: Before production launch

3. **No Secure Element Integration**: Missing TEE/SE support
   - **Mitigation**: Implement native secure enclave integration
   - **Timeline**: Required for production

### High
1. **Public RPC Nodes**: Using free public endpoints
   - **Mitigation**: Migrate to paid providers (Alchemy, Infura, QuickNode)
   - **Timeline**: Before production launch

2. **No Transaction Simulation**: Transactions not simulated before signing
   - **Mitigation**: Implement pre-flight simulation
   - **Timeline**: Recommended before launch

3. **Price Data Dependency**: Relies on single price provider
   - **Mitigation**: Implement multiple price sources with fallback
   - **Timeline**: Before production launch

### Medium
1. **No Jailbreak/Root Detection**: App runs on compromised devices
   - **Mitigation**: Implement device integrity checks
   - **Timeline**: Recommended

2. **Limited Error Recovery**: Some edge cases not handled
   - **Mitigation**: Comprehensive error handling and user guidance
   - **Timeline**: Ongoing

## Audit Requirements

### Pre-Production Audit Checklist

#### Code Audit
- [ ] Third-party dependency security audit
- [ ] Static code analysis (SonarQube, Semgrep)
- [ ] Dynamic analysis and penetration testing
- [ ] Cryptographic implementation review
- [ ] Key management audit
- [ ] Transaction signing flow audit

#### Smart Contract Audit (if applicable)
- [ ] Solidity contract review
- [ ] Reentrancy attack prevention
- [ ] Access control verification
- [ ] Upgrade mechanism security

#### Infrastructure Audit
- [ ] Supabase RLS policy review
- [ ] API security review
- [ ] Network architecture review
- [ ] DDoS mitigation strategy

#### Compliance
- [ ] GDPR compliance (if EU users)
- [ ] KYC/AML integration (if fiat on-ramp)
- [ ] Terms of service legal review
- [ ] Privacy policy review

### Recommended Auditors
- Trail of Bits
- Kudelski Security
- NCC Group
- Halborn
- CertiK

## Incident Response Plan

### Severity Levels
1. **Critical**: Funds at risk, private keys exposed
2. **High**: Transaction failures, balance inaccuracies
3. **Medium**: UI bugs, minor feature issues
4. **Low**: Visual glitches, performance issues

### Response Procedures
1. Immediate investigation and root cause analysis
2. User notification (if funds affected)
3. Patch development and testing
4. Emergency release process
5. Post-mortem and prevention measures

## User Security Guidelines

### Setup
- Create strong password (minimum 12 characters, mixed case, numbers, symbols)
- Write seed phrase on paper (never digital)
- Store seed phrase in secure location (safe, safety deposit box)
- Never share seed phrase with anyone
- Verify seed phrase during setup

### Daily Use
- Enable biometric authentication
- Keep app updated
- Review transaction details before signing
- Verify recipient addresses carefully
- Use address book for frequent recipients
- Enable balance hiding in public

### Recovery
- Only import seed on trusted devices
- Never enter seed phrase on websites
- Use official app only
- Contact support if suspicious activity

## Development Security Practices

### Code Review
- All PRs require security-focused review
- Automated security scanning on commits
- Dependency vulnerability scanning
- No secrets in source code

### Testing
- Unit tests for all crypto functions
- Integration tests for transaction flows
- End-to-end tests on testnets
- Security regression tests

### Release Process
- Code freeze 1 week before release
- Security audit of changes
- Testnet deployment and verification
- Staged rollout (10%, 50%, 100%)
- Rollback plan ready

## Future Enhancements

### Short Term (1-3 months)
- [ ] Hardware wallet integration (Ledger, Trezor)
- [ ] Multi-signature support
- [ ] Transaction batching
- [ ] Advanced fee customization

### Medium Term (3-6 months)
- [ ] WalletConnect v2 integration
- [ ] ENS/SNS domain resolution
- [ ] NFT transfer support
- [ ] Token swap aggregation

### Long Term (6-12 months)
- [ ] Social recovery mechanisms
- [ ] Account abstraction (ERC-4337)
- [ ] Cross-chain bridges
- [ ] DeFi position management

## Contact

For security concerns or vulnerability reports:
- Email: security@cryptowalletx.com
- Bug Bounty: https://bugcrowd.com/cryptowalletx
- Responsible Disclosure: 90-day disclosure timeline

---

**Last Updated**: 2026-03-23
**Version**: 1.0.0
**Author**: CryptoWallet X Security Team
