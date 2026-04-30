import { ethers } from 'ethers';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export class MnemonicManager {

  static generate(strength: 128 | 256 = 128): string {
    const entropy = ethers.randomBytes(strength / 8);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  static normalize(mnemonic: string): string {
    // BIP39 English wordlist is all lowercase; normalize whitespace
    return mnemonic.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  static validate(mnemonic: string): boolean {
    try {
      const normalized = this.normalize(mnemonic);
      const words = normalized.split(' ');
      if (words.length !== 12 && words.length !== 24) {
        return false;
      }
      return bip39.validateMnemonic(normalized, wordlist);
    } catch {
      return false;
    }
  }

  static toSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
    const normalized = this.normalize(mnemonic);
    if (!this.validate(normalized)) {
      throw new Error('Invalid mnemonic phrase');
    }
    // 64-byte BIP39 seed — the exact same seed Phantom derives from this mnemonic
    return bip39.mnemonicToSeedSync(normalized, passphrase);
  }

  static toEntropy(mnemonic: string): Uint8Array {
    if (!this.validate(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    const m = ethers.Mnemonic.fromPhrase(mnemonic);
    return ethers.getBytes(m.entropy);
  }

  static fromEntropy(entropy: Uint8Array): string {
    const m = ethers.Mnemonic.fromEntropy(entropy);
    return m.phrase;
  }

  static getWords(mnemonic: string): string[] {
    return mnemonic.trim().split(/\s+/);
  }

  static getWordCount(mnemonic: string): number {
    return this.getWords(mnemonic).length;
  }

  static isValid12Words(mnemonic: string): boolean {
    return this.getWordCount(mnemonic) === 12 && this.validate(mnemonic);
  }

  static isValid24Words(mnemonic: string): boolean {
    return this.getWordCount(mnemonic) === 24 && this.validate(mnemonic);
  }
}
