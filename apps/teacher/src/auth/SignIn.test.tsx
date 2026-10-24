import { SIGN_IN_ERRORS } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignIn } from './SignIn';

const providers = [
  { id: 'google', label: 'Google' },
  { id: 'clever', label: 'Clever' },
  { id: 'classlink', label: 'ClassLink' },
];

describe('SignIn (F5-U1, F5-U2)', () => {
  it('shows one button per enabled provider, by name, and no password field', () => {
    const html = renderToStaticMarkup(
      <SignIn app="the teacher console" providers={providers} error={null} returnTo="/settings" />,
    );
    for (const p of providers) {
      expect(html).toContain(`Sign in with ${p.label}`);
      expect(html).toContain(`href="/auth/${p.id}/start?returnTo=%2Fsettings"`);
    }
    expect(html.match(/<a /g)).toHaveLength(3);
    expect(html).not.toMatch(/<input|password/i);
  });

  it('shows the plain message for a user with no class', () => {
    const html = renderToStaticMarkup(
      <SignIn app="the teacher console" providers={providers} error="not_linked" returnTo="/" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain(SIGN_IN_ERRORS.not_linked.replace("'", '&#x27;'));
  });

  it('never shows a raw error code, and never links off-site', () => {
    const html = renderToStaticMarkup(
      <SignIn
        app="the teacher console"
        providers={providers}
        error="<script>boom"
        returnTo="https://evil.example"
      />,
    );
    expect(html).not.toContain('boom');
    expect(html).toContain('Sign-in didn&#x27;t work');
    expect(html).toContain('returnTo=%2F"');
  });

  it('fits a 400 px screen: one narrow column', () => {
    const html = renderToStaticMarkup(
      <SignIn app="the teacher console" providers={providers} error={null} returnTo="/" />,
    );
    expect(html).toContain('max-width:420px');
    expect(html).toContain('box-sizing:border-box');
    expect(html).toContain('btn-block');
  });
});
