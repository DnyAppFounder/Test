import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';

const PIN_SALT = 'dawen-pin-v1:';

export function hashPin(pin: string): string {
  const input = new TextEncoder().encode(PIN_SALT + pin);
  return bytesToHex(sha256(input));
}

export function verifyPin(pin: string, storedHash: string): boolean {
  return hashPin(pin) === storedHash;
}
