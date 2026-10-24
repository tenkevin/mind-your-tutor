import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// Cookie values and the keys behind them. One configured secret is split by HKDF into
// an encryption key for the sign-in cookie and an HMAC key for CSRF tokens.

export interface Keys {
  login: Buffer;
  csrf: Buffer;
}

export function deriveKeys(secret: string): Keys {
  const derive = (info: string) =>
    Buffer.from(hkdfSync('sha256', secret, 'ideamap-auth', info, 32));
  return { login: derive('login-cookie'), csrf: derive('csrf') };
}

const b64 = (bytes: Buffer) => bytes.toString('base64url');

export function randomToken(bytes = 32): string {
  return b64(randomBytes(bytes));
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The session cookie: `<org id>.<token>`. The org id lets lookup run under RLS. */
export function sessionCookieValue(orgId: string, token: string): string {
  return `${orgId}.${token}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseSessionCookie(
  value: string | undefined,
): { orgId: string; token: string } | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  const orgId = value.slice(0, dot);
  const token = value.slice(dot + 1);
  if (dot < 0 || !UUID.test(orgId) || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return { orgId, token };
}

/** A session's CSRF token: an HMAC of its own token, so nothing extra is stored. */
export function csrfToken(keys: Keys, sessionToken: string): string {
  return b64(createHmac('sha256', keys.csrf).update(sessionToken).digest());
}

/** AES-256-GCM, so the sign-in cookie can be neither read nor altered by the browser. */
export function seal(key: Buffer, data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return b64(Buffer.concat([iv, cipher.getAuthTag(), body]));
}

export function unseal(key: Buffer, value: string | undefined): unknown {
  if (!value || value.length > 4096) return null;
  try {
    const raw = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const body = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
    return JSON.parse(body.toString('utf8')) as unknown;
  } catch {
    return null;
  }
}
