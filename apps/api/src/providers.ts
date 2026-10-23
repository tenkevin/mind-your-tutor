import * as oidc from 'openid-client';
import type { ProviderConfig } from './config.js';

// One adapter interface for every SSO provider (§10 "Sign-in"; F5-F2). Google
// Workspace for Education, Clever and ClassLink all speak OpenID Connect, so one OIDC
// adapter serves them, configured per provider. A SAML adapter for ClassLink would
// implement the same interface.

/**
 * What sign-in keeps from an identity token. Only these claims are read; photos,
 * birthdays, phone numbers and addresses are never taken from the token (F5-S5).
 */
export interface Identity {
  subject: string;
  /** The school or district (Google `hd`, Clever `district`, …). */
  tenant: string;
  name: string | null;
  /** Lower-case, and only when the provider says it's verified. */
  email: string | null;
}

export interface AuthorizationRequest {
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}

export interface CallbackChecks {
  redirectUri: string;
  state: string;
  nonce: string;
  codeVerifier: string;
}

export interface IdentityProvider {
  readonly id: string;
  readonly label: string;
  /** Where to send the browser: the authorization code flow with PKCE (S256). */
  authorizationUrl(request: AuthorizationRequest): Promise<URL>;
  /** Exchange the callback's code, verify the ID token and read the identity. */
  identify(callbackUrl: URL, checks: CallbackChecks): Promise<Identity>;
}

export class SignInRefused extends Error {}

const text = (value: unknown, max: number): string | null =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : null;

/** Read the allowed claims, and nothing else, from verified ID-token claims. */
export function identityFromClaims(claims: Record<string, unknown>, tenantClaim: string): Identity {
  const subject = text(claims.sub, 255);
  const tenant = text(claims[tenantClaim], 255);
  if (!subject) throw new SignInRefused('The ID token has no subject.');
  if (!tenant) throw new SignInRefused(`The ID token has no ${tenantClaim} claim.`);
  const given = text(claims.given_name, 100);
  const family = text(claims.family_name, 100);
  const name =
    text(claims.name, 200) ?? ([given, family].filter(Boolean).join(' ').slice(0, 200) || null);
  const email = text(claims.email, 320)?.toLowerCase() ?? null;
  return {
    subject,
    tenant,
    name,
    email:
      email && claims.email_verified === true && /^[^\s@]+@[^\s@]+$/.test(email) ? email : null,
  };
}

export class OidcProvider implements IdentityProvider {
  readonly id: string;
  readonly label: string;
  #config: ProviderConfig;
  #allowHttp: boolean;
  #discovered: Promise<oidc.Configuration> | undefined;

  constructor(config: ProviderConfig, options: { allowHttp: boolean }) {
    this.id = config.id;
    this.label = config.label;
    this.#config = config;
    this.#allowHttp = options.allowHttp;
  }

  /** Discovery runs once, on first use; a failure is retried on the next sign-in. */
  #client(): Promise<oidc.Configuration> {
    this.#discovered ??= (async () => {
      const execute = this.#allowHttp ? [oidc.allowInsecureRequests] : [];
      const client = await oidc.discovery(
        new URL(this.#config.issuer),
        this.#config.clientId,
        undefined,
        oidc.ClientSecretPost(this.#config.clientSecret),
        { execute, timeout: 10 },
      );
      // Verify the ID token's signature against the provider's keys too, not only
      // trust the TLS channel it came over (F5-S1: an unknown key is refused).
      oidc.enableNonRepudiationChecks(client);
      return client;
    })().catch((error: unknown) => {
      this.#discovered = undefined;
      throw error;
    });
    return this.#discovered;
  }

  async authorizationUrl(request: AuthorizationRequest): Promise<URL> {
    return oidc.buildAuthorizationUrl(await this.#client(), {
      response_type: 'code',
      redirect_uri: request.redirectUri,
      scope: this.#config.scopes,
      state: request.state,
      nonce: request.nonce,
      code_challenge: request.codeChallenge,
      code_challenge_method: 'S256',
    });
  }

  async identify(callbackUrl: URL, checks: CallbackChecks): Promise<Identity> {
    const client = await this.#client();
    // Checks state, PKCE, and the ID token's issuer, audience, expiry, nonce and
    // signature; any failure throws.
    const tokens = await oidc.authorizationCodeGrant(
      client,
      callbackUrl,
      {
        expectedState: checks.state,
        expectedNonce: checks.nonce,
        pkceCodeVerifier: checks.codeVerifier,
        idTokenExpected: true,
      },
      { redirect_uri: checks.redirectUri },
    );
    const claims = tokens.claims();
    if (!claims) throw new SignInRefused('No ID token.');
    return identityFromClaims(claims, this.#config.tenantClaim);
  }
}

export function createProviders(
  configs: readonly ProviderConfig[],
  options: { allowHttp: boolean },
): Map<string, IdentityProvider> {
  return new Map(configs.map((c) => [c.id, new OidcProvider(c, options)]));
}
