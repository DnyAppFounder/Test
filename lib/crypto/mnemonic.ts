import { ethers } from 'ethers';
import * as bip39 from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export class MnemonicManager {

  static generate(strength: 128 | 256 = 128): string {
    const entropy = ethers.randomBytes(strength / 8);
    const mnemonic = ethers.Mnemonic.fromEntropy(entropy);
    return mnemonic.phrase;
  }

  static validate(mnemonic: string): boolean {
    try {
      const words = mnemonic.trim().split(/\s+/);
      if (words.length !== 12 && words.length !== 24) {
        return false;
      }
      return bip39.validateMnemonic(mnemonic, wordlist);
    } catch {
      return false;
    }
  }

  static toSeed(mnemonic: string, passphrase: string = ''): Uint8Array {
    if (!this.validate(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }
    // Use proper BIP39 mnemonic to seed conversion
    // This produces a 64-byte seed, which is what Phantom uses
    return bip39.mnemonicToSeedSync(mnemonic, passphrase);
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
