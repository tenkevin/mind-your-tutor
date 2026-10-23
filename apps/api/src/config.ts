import type { Role } from '@ideamap/contracts';

// Server configuration, read from environment variables only (F5-S8). `.env.example`
// at the repo root lists every name. Secrets (the session secret, each provider's
// client secret) are never defaulted.

export interface ProviderConfig {
  /** Slug stored on users and sessions: `google`, `clever`, `classlink`, … */
  id: string;
  /** Button text on the sign-in page. */
  label: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  /** The ID-token claim naming the school or district, mapped to an org by sso_tenant. */
  tenantClaim: string;
}

export interface AuthConfig {
  /** Origins the web apps are served from; sign-in callbacks and CSRF checks use these. */
  appOrigins: string[];
  /** At least 32 bytes. Encrypts the sign-in cookie and derives CSRF tokens. */
  sessionSecret: string;
  /** Idle limit per role, in minutes (F5-F7: teachers 8 hours, students 2 hours). */
  idleMinutes: Record<Role, number>;
  /** A session ends this long after sign-in, however active. */
  maxSessionHours: number;
  providers: ProviderConfig[];
  /** Allow http:// identity providers (the local mock). Never in production. */
  allowHttpProviders: boolean;
  /** Failed sign-in callbacks one IP may make per minute before it's refused (F5-S7). */
  signInFailuresPerMinute: number;
  /** Trust X-Forwarded-* from a reverse proxy. */
  trustProxy: boolean;
}

/**
 * Built-in provider settings (§10). Adding a provider is configuration: list its id
 * in IDEAMAP_SSO_PROVIDERS and set IDEAMAP_SSO_<ID>_* (open question 3 decides which
 * ones are used; these presets are unverified against real school accounts).
 */
export const PROVIDER_PRESETS: Record<string, Partial<ProviderConfig>> = {
  google: {
    label: 'Google',
    issuer: 'https://accounts.google.com',
    tenantClaim: 'hd',
  },
  clever: {
    label: 'Clever',
    issuer: 'https://clever.com',
    tenantClaim: 'district',
  },
  classlink: {
    label: 'ClassLink',
    issuer: 'https://launchpad.classlink.com',
    tenantClaim: 'tenant_id',
  },
};

export class ConfigError extends Error {}

type Env = Record<string, string | undefined>;

function positive(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new ConfigError(`${name} must be a positive number.`);
  return n;
}

function origin(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigError(`${name}: "${value}" is not a URL.`);
  }
  if (url.origin !== value.replace(/\/$/, '')) {
    throw new ConfigError(`${name}: "${value}" must be an origin, with no path.`);
  }
  return url.origin;
}

export function loadConfig(env: Env = process.env): AuthConfig {
  const appOrigins = (env.IDEAMAP_APP_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((o) => origin(o, 'IDEAMAP_APP_ORIGINS'));
  if (appOrigins.length === 0) throw new ConfigError('IDEAMAP_APP_ORIGINS must list an origin.');

  const sessionSecret = env.IDEAMAP_SESSION_SECRET ?? '';
  if (Buffer.byteLength(sessionSecret) < 32) {
    throw new ConfigError('IDEAMAP_SESSION_SECRET must be at least 32 bytes.');
  }

  const production = env.NODE_ENV === 'production';
  const allowHttpProviders = env.IDEAMAP_SSO_ALLOW_HTTP === '1';
  if (allowHttpProviders && production) {
    throw new ConfigError('IDEAMAP_SSO_ALLOW_HTTP is for the local mock only, not production.');
  }

  const ids = (env.IDEAMAP_SSO_PROVIDERS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const providers = ids.map((id): ProviderConfig => {
    if (!/^[a-z][a-z0-9-]{1,31}$/.test(id)) {
      throw new ConfigError(`IDEAMAP_SSO_PROVIDERS: "${id}" is not a provider id.`);
    }
    const key = `IDEAMAP_SSO_${id.toUpperCase().replaceAll('-', '_')}_`;
    const preset = PROVIDER_PRESETS[id] ?? {};
    const pick = (name: string, fallback?: string) => {
      const value = env[key + name] || fallback;
      if (!value) throw new ConfigError(`${key}${name} must be set for provider "${id}".`);
      return value;
    };
    const issuer = pick('ISSUER', preset.issuer);
    if (!issuer.startsWith('https://') && !(allowHttpProviders && issuer.startsWith('http://'))) {
      throw new ConfigError(`${key}ISSUER must be https.`);
    }
    return {
      id,
      label: pick('LABEL', preset.label),
      issuer,
      clientId: pick('CLIENT_ID'),
      clientSecret: pick('CLIENT_SECRET'),
      scopes: pick('SCOPES', 'openid email profile'),
      tenantClaim: pick('TENANT_CLAIM', preset.tenantClaim),
    };
  });

  const staff = positive(env, 'IDEAMAP_SESSION_IDLE_MINUTES_STAFF', 8 * 60);
  return {
    appOrigins,
    sessionSecret,
    idleMinutes: {
      admin: staff,
      author: staff,
      teacher: staff,
      student: positive(env, 'IDEAMAP_SESSION_IDLE_MINUTES_STUDENT', 2 * 60),
    },
    maxSessionHours: positive(env, 'IDEAMAP_SESSION_MAX_HOURS', 12),
    providers,
    allowHttpProviders,
    signInFailuresPerMinute: positive(env, 'IDEAMAP_SIGNIN_FAILURES_PER_MINUTE', 20),
    trustProxy: env.IDEAMAP_TRUST_PROXY === '1',
  };
}
