import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
const N = 2 ** 17;
const r = 8;
const p = 1;
const keyLength = 64;
const maxmem = 256 * 1024 * 1024;

const derive = (password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt, { N, r, p, maxmem });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, cost, blockSize, parallelism, saltValue, hashValue] = encoded.split('$');
  if (algorithm !== 'scrypt' || !cost || !blockSize || !parallelism || !saltValue || !hashValue)
    return false;
  const expected = Buffer.from(hashValue, 'base64');
  if (expected.length !== keyLength) return false;
  try {
    const actual = await derive(password, Buffer.from(saltValue, 'base64'), {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
      maxmem,
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
