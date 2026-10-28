import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config.js';

const base = {
  IDEAMAP_APP_ORIGINS: 'https://teacher.ideamap.test, https://student.ideamap.test',
  IDEAMAP_SESSION_SECRET: 'x'.repeat(32),
};

describe('loadConfig', () => {
  it('reads origins and the default limits (F5-F7)', () => {
    const config = loadConfig(base);
    expect(config.appOrigins).toEqual([
      'https://teacher.ideamap.test',
      'https://student.ideamap.test',
    ]);
    expect(config.idleMinutes).toEqual({ admin: 480, author: 480, teacher: 480, student: 120 });
    expect(config.maxSessionHours).toBe(12);
    expect(config.providers).toEqual([]);
  });

  it('needs a long session secret, and has no default for it (F5-S8)', () => {
    expect(() => loadConfig({ ...base, IDEAMAP_SESSION_SECRET: undefined })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, IDEAMAP_SESSION_SECRET: 'short' })).toThrow(/32 bytes/);
  });

  it('configures the §10 providers from presets plus client credentials (F5-F2)', () => {
    const config = loadConfig({
      ...base,
      IDEAMAP_SSO_PROVIDERS: 'google,clever,classlink',
      IDEAMAP_SSO_GOOGLE_CLIENT_ID: 'g-id',
      IDEAMAP_SSO_GOOGLE_CLIENT_SECRET: 'g-secret',
      IDEAMAP_SSO_CLEVER_CLIENT_ID: 'c-id',
      IDEAMAP_SSO_CLEVER_CLIENT_SECRET: 'c-secret',
      IDEAMAP_SSO_CLASSLINK_CLIENT_ID: 'l-id',
      IDEAMAP_SSO_CLASSLINK_CLIENT_SECRET: 'l-secret',
    });
    expect(config.providers.map((p) => [p.id, p.label, p.issuer, p.tenantClaim])).toEqual([
      ['google', 'Google', 'https://accounts.google.com', 'hd'],
      ['clever', 'Clever', 'https://clever.com', 'district'],
      ['classlink', 'ClassLink', 'https://launchpad.classlink.com', 'tenant_id'],
    ]);
  });

  it('adds a new provider by configuration alone', () => {
    const config = loadConfig({
      ...base,
      IDEAMAP_SSO_PROVIDERS: 'state-idp',
      IDEAMAP_SSO_STATE_IDP_ISSUER: 'https://idp.state.example',
      IDEAMAP_SSO_STATE_IDP_LABEL: 'State ID',
      IDEAMAP_SSO_STATE_IDP_TENANT_CLAIM: 'school',
      IDEAMAP_SSO_STATE_IDP_CLIENT_ID: 'id',
      IDEAMAP_SSO_STATE_IDP_CLIENT_SECRET: 'secret',
    });
    expect(config.providers[0]).toMatchObject({
      id: 'state-idp',
      label: 'State ID',
      tenantClaim: 'school',
    });
  });

  it('refuses a provider without a client secret, or over http', () => {
    const google = { ...base, IDEAMAP_SSO_PROVIDERS: 'google', IDEAMAP_SSO_GOOGLE_CLIENT_ID: 'id' };
    expect(() => loadConfig(google)).toThrow(/CLIENT_SECRET/);
    const http = {
      ...google,
      IDEAMAP_SSO_GOOGLE_CLIENT_SECRET: 's',
      IDEAMAP_SSO_GOOGLE_ISSUER: 'http://localhost:4010/google',
    };
    expect(() => loadConfig(http)).toThrow(/https/);
    expect(loadConfig({ ...http, IDEAMAP_SSO_ALLOW_HTTP: '1' }).allowHttpProviders).toBe(true);
    expect(() =>
      loadConfig({ ...http, IDEAMAP_SSO_ALLOW_HTTP: '1', NODE_ENV: 'production' }),
    ).toThrow(/not production/);
  });

  it('lists every variable it reads in .env.example, with no values (F5-S8)', () => {
    const example = readFileSync(new URL('../../../.env.example', import.meta.url), 'utf8');
    // The server settings, and the AI gateway's (A1).
    const source = ['./config.ts', './ai/config.ts']
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    const read = new Set(source.match(/IDEAMAP_[A-Z_]+(?=['`])/g));
    for (const name of read) {
      if (name.endsWith('_')) continue; // the per-provider prefix
      expect(example, name).toMatch(new RegExp(`^${name}=$`, 'm'));
    }
    for (const line of example.split('\n')) {
      if (line && !line.startsWith('#'))
        expect(line, 'no values in .env.example').toMatch(/^[A-Z_]+=$/);
    }
  });
});
