import { ethers } from 'ethers';
import * as nacl from 'tweetnacl';
import { MnemonicManager } from './mnemonic';
import { derivePath } from 'ed25519-hd-key';

export interface DerivedKey {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
  address: string;
}

export interface DerivedEVMNode {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
}

export class KeyDerivationManager {
  /**
   * Derive a Solana ed25519 keypair using SLIP-0010 / ed25519-hd-key.
   *
   * This is the exact derivation Phantom, Solflare, Backpack, and Jupiter Wallet
   * use for the path m/44'/501'/accountIndex'/0'.
   *
   * ed25519-hd-key implements RFC 8032 / SLIP-0010 which is the only correct
   * way to derive ed25519 keys from a BIP39 seed. @scure/bip32 uses secp256k1
   * and must NOT be used for Solana.
   */
  static deriveSolanaKeyPair(
    mnemonic: string,
    accountIndex: number = 0
  ): nacl.SignKeyPair {
    // 64-byte BIP39 seed from mnemonic (Phantom-compatible)
    const seed = MnemonicManager.toSeed(mnemonic);

    // Phantom-compatible derivation path (SLIP-0010 ed25519)
    const path = `m/44'/501'/${accountIndex}'/0'`;

    // ed25519-hd-key implements SLIP-0010 for ed25519 — required for Solana
    const { key: derivedKey } = derivePath(path, Buffer.from(seed).toString('hex'));

    // Generate nacl keypair from the 32-byte derived seed
    return nacl.sign.keyPair.fromSeed(derivedKey);
  }

  static deriveEthereumHDNode(
    mnemonic: string,
    accountIndex: number = 0
  ): DerivedEVMNode {
    const path = `m/44'/60'/0'/0/${accountIndex}`;
    const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, path);

    const privateKeyBytes = ethers.getBytes(hdWallet.privateKey);
    const publicKeyBytes = ethers.getBytes(hdWallet.publicKey);

    return {
      privateKey: privateKeyBytes,
      publicKey: publicKeyBytes,
    };
  }

  static derivePolygonHDNode(
    mnemonic: string,
    accountIndex: number = 0
  ): DerivedEVMNode {
    return this.deriveEthereumHDNode(mnemonic, accountIndex);
  }

  static deriveBaseHDNode(
    mnemonic: string,
    accountIndex: number = 0
  ): DerivedEVMNode {
    return this.deriveEthereumHDNode(mnemonic, accountIndex);
  }

  static getDerivationPath(
    blockchain: 'solana' | 'ethereum' | 'polygon' | 'base' | 'bitcoin',
    accountIndex: number = 0
  ): string {
    const paths: Record<string, string> = {
      solana: `m/44'/501'/${accountIndex}'/0'`,
      ethereum: `m/44'/60'/0'/0/${accountIndex}`,
      polygon: `m/44'/60'/0'/0/${accountIndex}`,
      base: `m/44'/60'/0'/0/${accountIndex}`,
      bitcoin: `m/44'/0'/0'/0/${accountIndex}`,
    };

    return paths[blockchain];
  }

  static validateDerivationPath(path: string): boolean {
    const pathRegex = /^m(\/\d+'?)+$/;
    return pathRegex.test(path);
  }
}
