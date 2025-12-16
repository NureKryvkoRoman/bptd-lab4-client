export const deriveAesKey = async (sharedSecret: bigint): Promise<CryptoKey> => {
  const raw = new TextEncoder().encode(sharedSecret.toString(16));
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
};

export const aesEncrypt = async (
  key: CryptoKey,
  plaintext: string
): Promise<{ nonce: string; ciphertext: string }> => {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );
  return {
    nonce: btoa(String.fromCharCode(...nonce)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ct)))
  };
};

export const aesDecrypt = async (
  key: CryptoKey,
  nonceB64: string,
  ciphertextB64: string
): Promise<string> => {
  const nonce = Uint8Array.from(atob(nonceB64), (c) => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ciphertextB64), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct);
  return new TextDecoder().decode(pt);
};
