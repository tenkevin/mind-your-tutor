import { tokens } from '@ideamap/ui';
import { readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UdlReference } from '../UdlReference';
import {
  DisplaySettings,
  Feedback,
  IdeaText,
  MissionPicker,
  ReadAloud,
  SpeakOrType,
  SpeechProvider,
  StepFlow,
} from '.';
import type { SpeechEnv } from './speech';

const withVoice: SpeechEnv = {
  synth: {
    getVoices: () => [{ lang: 'en-US', localService: true }],
    speak() {},
    pause() {},
    resume() {},
    cancel() {},
  },
  makeUtterance: () => ({
    voice: null,
    lang: '',
    rate: 1,
    onboundary: null,
    onend: null,
    onerror: null,
  }),
};

const html = (node: ReactNode, speech: SpeechEnv | null = withVoice) =>
  renderToStaticMarkup(
    <SpeechProvider value={{ speech, recognition: null }}>{node}</SpeechProvider>,
  );

describe('representation (S5-F1, S5-F2)', () => {
  it('reads an idea, a question or feedback aloud, with pace and pause controls', () => {
    const out = html(<ReadAloud text="Water rises as vapour." label="Read the question" />);
    expect(out).toContain('Water rises as vapour.');
    expect(out).toContain('Read the question');
    expect(out).toContain('Slower');
    expect(out).toContain('role="group" aria-label="Read aloud"');
  });

  it('keeps the text and hides the speaker where the device has no voice', () => {
    const out = html(<ReadAloud text="Water rises as vapour." />, null);
    expect(out).toContain('Water rises as vapour.');
    expect(out).not.toContain('<button');
  });

  it('shows a picture with alt text and a caption, beside the text, never instead', () => {
    const withMedia = html(
      <IdeaText
        title="Evaporation"
        text="Heat turns water into vapour."
        media={{ src: '/a.svg', alt: 'Vapour rising from a lake', caption: 'The Sun heats it' }}
      />,
    );
    expect(withMedia).toContain('alt="Vapour rising from a lake"');
    expect(withMedia).toContain('<figcaption>The Sun heats it</figcaption>');
    expect(withMedia).toContain('Heat turns water into vapour.');
    const without = html(<IdeaText title="Condensation" text="Vapour cools into drops." />);
    expect(without).not.toContain('<img');
    expect(without).toContain('Vapour cools into drops.');
  });

  it('gives feedback its reason, read-aloud and a Challenge this button (D15)', () => {
    const out = html(
      <Feedback from="Ms. Ivy" message="Nearly!" reason="Heat is needed." onChallenge={() => {}} />,
    );
    expect(out).toContain('Nearly!');
    expect(out).toContain('Heat is needed.');
    expect(out).toContain('Read why');
    expect(out).toContain('Challenge this');
  });
});

describe('action and expression (S5-F3)', () => {
  it('always offers a labelled text box and Send', () => {
    const out = html(<SpeakOrType label="What is evaporation?" onSend={() => {}} />);
    expect(out).toMatch(/<label class="udl-label" for="([^"]+)">What is evaporation\?<\/label>/);
    expect(out).toContain('<textarea');
    expect(out).toContain('>Send</button>');
    // The mic only appears once on-device recognition is confirmed, after mount.
    expect(out).not.toContain('Talk');
  });
});

describe('engagement (S5-F4)', () => {
  it('lets the student pick any open mission, with state in words', () => {
    const out = html(
      <MissionPicker
        onChoose={() => {}}
        missions={[
          { id: 'a', title: 'Teach Milo', detail: 'Ready now', state: 'ready' },
          { id: 'b', title: 'Pass a quiz', detail: 'Score 3 of 4', state: 'todo' },
          { id: 'c', title: 'Unit 2', detail: 'Master 2 more ideas first', state: 'locked' },
          { id: 'd', title: 'Streak', detail: '3 days', state: 'done' },
        ]}
      />,
    );
    expect(out).toContain('Pick any mission you like.');
    for (const word of ['Ready', 'To do', 'Locked', 'Done']) {
      expect(out).toContain(`<span class="udl-mission-tag">${word}</span>`);
    }
    expect(out.match(/aria-disabled="true"/g)).toHaveLength(1);
    expect(out).not.toContain(' disabled=""');
  });

  it('shows the step and lets the student take a break', () => {
    const out = html(
      <StepFlow
        title="Review"
        onFinish={() => {}}
        steps={[
          { title: 'Read', body: 'one' },
          { title: 'Try', body: 'two' },
        ]}
      />,
    );
    expect(out.replace(/<!-- -->/g, '')).toContain('Review · Step 1 of 2');
    expect(out).toContain('Take a break');
    expect(out).toContain('>Next</button>');
    expect(out).not.toContain('>Back</button>');
  });
});

describe('presentation (S5-F5, S5-U2)', () => {
  it('offers text size and a calm screen in plain words', () => {
    const out = html(<DisplaySettings />);
    for (const word of ['Normal', 'Big', 'Biggest', 'Calm screen']) expect(out).toContain(word);
  });

  const css = readFileSync(new URL('./udl.css', import.meta.url), 'utf8');

  it('sizes from rem and the student scale, and targets are at least 44px', () => {
    expect(css).toContain('--udl-target: 44px;');
    expect(css).toContain('calc(0.9375rem * var(--udl-scale))');
    expect(css).toMatch(/\.udl-btn \{[^}]*min-height: max\(var\(--udl-target\)/);
    expect(css).not.toMatch(/font-size: \d+px/);
  });

  it('turns off motion for the device setting and for Calm screen', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[^@]*animation: none !important/);
    expect(css).toMatch(/:root\[data-motion='reduce'\] \*[^}]*transition: none !important/);
  });

  it('labels every control button with text, not only an icon', () => {
    const out = html(<UdlReference />);
    const buttons = out.match(/<button[^>]*>.*?<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(5);
    for (const b of buttons) {
      expect(
        b
          .replace(/<svg.*?<\/svg>/g, '')
          .replace(/<[^>]+>/g, '')
          .trim(),
      ).not.toBe('');
    }
  });
});

// New colour pairs in udl.css must meet AA; D10's exceptions cover only Nocturne's own.
describe('contrast (S5-U1)', () => {
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
  const lum = (hex: string) => {
    const [r, g, b] = rgb(hex) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };
  const t = tokens as Record<string, string>;
  const pairs: [string, string, string, number][] = [
    ['spoken word', '--color-accent-100', '--color-accent-800', 4.5],
    ['ready mission title', '--color-text', '--color-accent-900', 4.5],
    ['ready mission tag', '--color-accent-200', '--color-accent-900', 4.5],
    ['mission detail on surface', '--color-neutral-300', '--color-surface', 4.5],
    ['hint in a note', '--color-neutral-300', '--color-bg', 4.5],
    ['mission icon', '--color-neutral-200', '--color-bg', 4.5],
    ['ready mission icon ring', '--color-accent', '--color-accent-900', 3],
    ['progress fill on track', '--color-accent', '--color-neutral-800', 3],
  ];
  it.each(pairs)('%s', (_, fg, bg, min) => {
    expect(ratio(t[fg]!, t[bg]!)).toBeGreaterThanOrEqual(min);
  });
});
