import { SIGN_IN_ERRORS } from '@ideamap/contracts';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SignIn } from './SignIn';

describe('SignIn (F5-U1, F5-U2)', () => {
  const providers = [
    { id: 'google', label: 'Google' },
    { id: 'classlink', label: 'ClassLink' },
  ];

  it('shows one button per provider and no password field', () => {
    const html = renderToStaticMarkup(<SignIn providers={providers} error={null} returnTo="/" />);
    expect(html).toContain('Sign in with Google');
    expect(html).toContain('Sign in with ClassLink');
    expect(html).not.toMatch(/<input|password/i);
  });

  it('tells a student with no class what to do', () => {
    const html = renderToStaticMarkup(
      <SignIn providers={providers} error="not_linked" returnTo="/" />,
    );
    expect(html).toContain(SIGN_IN_ERRORS.not_linked.replace("'", '&#x27;'));
  });
});
