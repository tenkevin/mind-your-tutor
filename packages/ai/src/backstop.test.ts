import { describe, expect, it } from 'vitest';
import { backstopText, BLURRED, totalMisses } from './backstop.js';

// D26's server backstop: roster names and contact details that reach the server are
// blurred and counted; device labels pass through untouched.

const ROSTER = ['Sam Student', 'Sky Student', 'Terry Teacher', 'Jo'];

describe('backstopText (D26)', () => {
  it('leaves text the device already labelled alone', () => {
    const text = 'Person A and I watched the rain fall in Place B. Evaporation comes first.';
    expect(backstopText(text, ROSTER)).toEqual({
      text,
      misses: { names: 0, emails: 0, phones: 0 },
    });
  });

  it('blurs a full roster name once, and given or family names on their own', () => {
    const out = backstopText('I worked with Sky Student, then sky helped sam.', ROSTER);
    expect(out.text).toBe(`I worked with ${BLURRED}, then ${BLURRED} helped ${BLURRED}.`);
    expect(out.misses.names).toBe(3);
    expect(out.text).not.toMatch(/sky|sam/i);
  });

  it('matches whole words only', () => {
    const out = backstopText('Skyline, samples and teachers are fine.', ROSTER);
    expect(out.misses.names).toBe(0);
  });

  it('skips one-letter name parts but keeps two-letter ones', () => {
    expect(backstopText('A cloud. Jo saw it.', ['A B', 'Jo']).misses.names).toBe(1);
  });

  it('blurs emails and phone numbers', () => {
    const out = backstopText('Mail sam.student@district-a.example.org or call 555-010-0199.', []);
    expect(out.text).toBe(`Mail ${BLURRED} or call ${BLURRED}.`);
    expect(out.misses).toEqual({ names: 0, emails: 1, phones: 1 });
    expect(totalMisses(out.misses)).toBe(2);
  });

  it('does not count quiz numbers or short figures as phones', () => {
    expect(backstopText('It took 45 minutes at 100 degrees in 2024.', []).misses.phones).toBe(0);
  });

  it('treats names with regex characters literally', () => {
    const out = backstopText("O'Brien (and Ana+) came; Anaaa didn't.", ["Kim O'Brien", 'Ana+']);
    expect(out.misses.names).toBe(2);
    expect(out.text).toBe(`${BLURRED} (and ${BLURRED}) came; Anaaa didn't.`);
  });
});
