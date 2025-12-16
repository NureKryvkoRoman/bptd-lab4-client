export const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
};

export const randomBigInt = (bits: number): bigint => {
  const bytes = Math.ceil(bits / 8);
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return BigInt('0x' + [...buf].map((b) => b.toString(16).padStart(2, '0')).join(''));
};

export const bigIntToBase64 = (bi: bigint): string => {
  return btoa(bi.toString(16));
};

export const base64ToBigInt = (b64: string): bigint => {
  return BigInt('0x' + atob(b64));
};
