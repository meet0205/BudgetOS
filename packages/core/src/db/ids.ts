/**
 * ID generation. Prefers the platform's crypto.randomUUID (browser and modern
 * Node) and falls back to an RFC-4122 v4 generator so the core stays runnable
 * on older runtimes and in tests.
 */
export type UUID = string;

function fallbackV4(): UUID {
  // Not cryptographically strong, but fine for local row ids where the real
  // uniqueness guarantee is the store. Real crypto is used whenever available.
  const bytes = new Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0'));
  return (
    hex.slice(0, 4).join('') +
    '-' +
    hex.slice(4, 6).join('') +
    '-' +
    hex.slice(6, 8).join('') +
    '-' +
    hex.slice(8, 10).join('') +
    '-' +
    hex.slice(10, 16).join('')
  );
}

export function newId(): UUID {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return fallbackV4();
}
