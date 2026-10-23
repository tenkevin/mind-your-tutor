import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from 'jose';

// A local OpenID Connect provider for development and CI (F5: the real providers need
// real school accounts, open question 3). One server plays every configured provider,
// each under its own issuer path (`/google`, `/clever`, `/classlink`), with the
// authorization code flow and PKCE only, like the real ones. Not for production: the
// sign-in page lists its users and signs in whoever is clicked.

export interface MockUser {
  /** Short handle for the chooser and for `login_hint` in tests. */
  key: string;
  sub: string;
  tenant: string;
  name: string;
  email?: string;
  emailVerified?: boolean;
  /** Extra claims the provider sends anyway (photo, birthday, …); the API must drop them. */
  extra?: Record<string, unknown>;
}

export interface MockProvider {
  tenantClaim: string;
  users: MockUser[];
}

/** Ways the next ID token is made wrong, to test that the API refuses it (F5-S1). */
export interface Tamper {
  aud?: string;
  expired?: boolean;
  unknownKey?: boolean;
  nonce?: string;
  issuer?: string;
}

export interface MockIdp {
  url: string;
  issuer(provider: string): string;
  tamperNext(tamper: Tamper): void;
  close(): Promise<void>;
}

interface PendingCode {
  provider: string;
  user: MockUser;
  redirectUri: string;
  challenge: string;
  nonce: string | undefined;
  expires: number;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function startMockIdp(options: {
  providers: Record<string, MockProvider>;
  clientId: string;
  clientSecret: string;
  port?: number;
  host?: string;
}): Promise<MockIdp> {
  const kid = 'mock-1';
  const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
  const stranger = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid, alg: 'RS256', use: 'sig' };
  const codes = new Map<string, PendingCode>();
  let tamper: Tamper = {};
  let base = '';

  const send = (res: ServerResponse, status: number, type: string, body: string) => {
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  const json = (res: ServerResponse, status: number, body: unknown) =>
    send(res, status, 'application/json', JSON.stringify(body));

  async function idToken(code: PendingCode): Promise<string> {
    const t = tamper;
    tamper = {};
    const config = options.providers[code.provider]!;
    const now = Math.floor(Date.now() / 1000);
    const { user } = code;
    const claims: Record<string, unknown> = {
      ...user.extra,
      name: user.name,
      [config.tenantClaim]: user.tenant,
      ...(user.email ? { email: user.email, email_verified: user.emailVerified ?? true } : {}),
      nonce: t.nonce ?? code.nonce,
    };
    const key: CryptoKey = t.unknownKey ? stranger.privateKey : privateKey;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(t.issuer ?? `${base}/${code.provider}`)
      .setSubject(user.sub)
      .setAudience(t.aud ?? options.clientId)
      .setIssuedAt(t.expired ? now - 3600 : now)
      .setExpirationTime(t.expired ? now - 1800 : now + 300)
      .sign(key);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', base);
    const [, provider, ...rest] = url.pathname.split('/');
    const config = provider ? options.providers[provider] : undefined;
    if (!provider || !config) return json(res, 404, { error: 'not_found' });
    const path = rest.join('/');
    const issuer = `${base}/${provider}`;

    if (req.method === 'GET' && path === '.well-known/openid-configuration') {
      return json(res, 200, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        scopes_supported: ['openid', 'email', 'profile'],
      });
    }
    if (req.method === 'GET' && path === 'jwks') return json(res, 200, { keys: [jwk] });

    if (req.method === 'GET' && path === 'authorize') {
      const q = url.searchParams;
      const redirectUri = q.get('redirect_uri') ?? '';
      if (q.get('client_id') !== options.clientId)
        return json(res, 400, { error: 'invalid_client' });
      if (q.get('response_type') !== 'code') {
        return json(res, 400, { error: 'unsupported_response_type' });
      }
      if (q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
        return json(res, 400, {
          error: 'invalid_request',
          error_description: 'PKCE S256 required',
        });
      }
      if (!/^https?:\/\//.test(redirectUri)) return json(res, 400, { error: 'invalid_request' });
      const hint = q.get('login_hint');
      if (!hint) {
        const links = config.users
          .map((u) => {
            const next = new URL(url);
            next.searchParams.set('login_hint', u.key);
            return `<li><a href="${escape(next.pathname + next.search)}">${escape(u.name)}</a> <small>${escape(u.key)} · ${escape(u.tenant)}</small></li>`;
          })
          .join('');
        return send(
          res,
          200,
          'text/html; charset=utf-8',
          `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
            `<title>Mock ${escape(provider)} sign-in</title><h1>Mock ${escape(provider)}</h1>` +
            `<p>Local development only. Pick a user:</p><ul>${links}</ul>`,
        );
      }
      const user = config.users.find((u) => u.key === hint);
      if (!user) return json(res, 400, { error: 'unknown_user' });
      const code = randomBytes(24).toString('base64url');
      codes.set(code, {
        provider,
        user,
        redirectUri,
        challenge: q.get('code_challenge')!,
        nonce: q.get('nonce') ?? undefined,
        expires: Date.now() + 60_000,
      });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      const state = q.get('state');
      if (state !== null) back.searchParams.set('state', state);
      back.searchParams.set('iss', issuer);
      res.writeHead(302, { location: back.href });
      return void res.end();
    }

    if (req.method === 'POST' && path === 'token') {
      const form = new URLSearchParams(await readBody(req));
      let clientId = form.get('client_id');
      let secret = form.get('client_secret');
      const basic = req.headers.authorization?.match(/^Basic (.+)$/);
      if (basic) {
        const [id, pass] = Buffer.from(basic[1]!, 'base64').toString().split(':');
        clientId = decodeURIComponent(id ?? '');
        secret = decodeURIComponent(pass ?? '');
      }
      if (clientId !== options.clientId || !secret || !sameSecret(secret, options.clientSecret)) {
        return json(res, 401, { error: 'invalid_client' });
      }
      const code = form.get('code') ?? '';
      const pending = codes.get(code);
      codes.delete(code); // single use
      if (
        form.get('grant_type') !== 'authorization_code' ||
        !pending ||
        pending.provider !== provider ||
        pending.expires < Date.now() ||
        pending.redirectUri !== form.get('redirect_uri')
      ) {
        return json(res, 400, { error: 'invalid_grant' });
      }
      const verifier = form.get('code_verifier') ?? '';
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      if (!sameSecret(challenge, pending.challenge)) {
        return json(res, 400, { error: 'invalid_grant', error_description: 'PKCE mismatch' });
      }
      return json(res, 200, {
        access_token: randomBytes(24).toString('base64url'),
        token_type: 'Bearer',
        expires_in: 300,
        id_token: await idToken(pending),
      });
    }
    return json(res, 404, { error: 'not_found' });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => json(res, 500, { error: 'server_error' }));
  });
  await new Promise<void>((resolve) =>
    server.listen(options.port ?? 0, options.host ?? '127.0.0.1', resolve),
  );
  const { port } = server.address() as AddressInfo;
  base = `http://${options.host ?? '127.0.0.1'}:${port}`;
  return {
    url: base,
    issuer: (provider) => `${base}/${provider}`,
    tamperNext: (t) => {
      tamper = t;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
