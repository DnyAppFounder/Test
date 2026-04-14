import { ethers } from 'ethers';

function uint8ToHex(bytes: Uint8Array): string {
  return ethers.hexlify(bytes).slice(2);
}

function hexToUint8(hex: string): Uint8Array {
  return ethers.getBytes('0x' + hex);
}

export class EncryptionManager {
  private static readonly ITERATIONS = 100000;
  private static readonly SALT_SIZE = 16;

  static async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new Uint8Array(salt),
        iterations: this.ITERATIONS,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }

  static generateSalt(): Uint8Array {
    const salt = new Uint8Array(this.SALT_SIZE);
    crypto.getRandomValues(salt);
    return salt;
  }

  static async encrypt(
    data: string,
    password: string
  ): Promise<{ encrypted: string; salt: string }> {
    const salt = this.generateSalt();
    const key = await this.deriveKey(password, salt);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const iv = new Uint8Array(12);
    crypto.getRandomValues(iv);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv,
      },
      key,
      dataBuffer
    );

    const encryptedArray = new Uint8Array(encryptedBuffer);
    const combined = new Uint8Array(iv.length + encryptedArray.length);
    combined.set(iv);
    combined.set(encryptedArray, iv.length);

    return {
      encrypted: uint8ToHex(combined),
      salt: uint8ToHex(salt),
    };
  }

  static async decrypt(
    encryptedHex: string,
    password: string,
    saltHex: string
  ): Promise<string> {
    const salt = hexToUint8(saltHex);
    const key = await this.deriveKey(password, salt);
    const combined = hexToUint8(encryptedHex);

    const iv = combined.slice(0, 12);
    const encryptedData = combined.slice(12);

    try {
      const decryptedBuffer = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      throw new Error('Decryption failed - invalid password or corrupted data');
    }
  }

  static async hash(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return uint8ToHex(new Uint8Array(hashBuffer));
  }

  static generateRandomBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
  }
}
