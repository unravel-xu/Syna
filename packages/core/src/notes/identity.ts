// Extracted from the read-only legacy blocks/identity.ts; no App or legacy state dependency.
let lastTime = 0, random = 0n;
const mask = (1n << 74n) - 1n;
export function uuidV7(): string {
  let time = Date.now();
  if (time > lastTime) random = crypto.getRandomValues(new Uint8Array(10)).reduce((value, byte) => (value << 8n) | BigInt(byte), 0n) & mask;
  else { time = lastTime; random = (random + 1n) & mask; if (!random) time++; }
  lastTime = time;
  const hex = ((BigInt(time) << 80n) | (7n << 76n) | ((random >> 62n) << 64n) | (2n << 62n) | (random & ((1n << 62n) - 1n))).toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
