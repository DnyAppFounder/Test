import { ethers } from 'ethers';
import * as nacl from 'tweetnacl';
import { MnemonicManager } from './mnemonic';
import { HDKey } from '@scure/bip32';

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
  static deriveSolanaKeyPair(
    mnemonic: string,
    accountIndex: number = 0
  ): nacl.SignKeyPair {
    // Get the proper BIP39 seed (64 bytes)
    const seed = MnemonicManager.toSeed(mnemonic);

    // Use Phantom-compatible derivation path: m/44'/501'/X'/0'
    const path = `m/44'/501'/${accountIndex}'/0'`;

    // Use @scure/bip32 which is browser-compatible and supports Ed25519
    const hdkey = HDKey.fromMasterSeed(seed);
    const derivedKey = hdkey.derive(path);

    if (!derivedKey.privateKey) {
      throw new Error('Failed to derive private key');
    }

    // Generate keypair from the derived private key (32 bytes)
    return nacl.sign.keyPair.fromSeed(derivedKey.privateKey);
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
    const paths = {
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
