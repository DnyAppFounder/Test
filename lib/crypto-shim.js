// Shim Node's crypto module to use Web Crypto API in the browser
const webCrypto = typeof globalThis !== 'undefined' && globalThis.crypto
  ? globalThis.crypto
  : (typeof window !== 'undefined' && window.crypto ? window.crypto : null);

function getRandomValues(buf) {
  if (webCrypto && webCrypto.getRandomValues) {
    webCrypto.getRandomValues(buf);
    return buf;
  }
  throw new Error('crypto.getRandomValues is not available');
}

function randomBytes(size) {
  const buf = new Uint8Array(size);
  getRandomValues(buf);
  return Buffer.from(buf);
}

module.exports = {
  getRandomValues,
  randomBytes,
  subtle: webCrypto ? webCrypto.subtle : undefined,
  webcrypto: webCrypto,
};
