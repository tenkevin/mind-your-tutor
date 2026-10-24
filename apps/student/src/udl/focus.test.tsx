// @vitest-environment jsdom
import userEvent from '@testing-library/user-event';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { Feedback, ReadAloud, SpeakOrType, SpeechProvider, StepFlow } from '.';
import type { RecognitionCtor, RecognitionLike, SpeechEnv } from './speech';

// S5-U1 (WCAG 2.4.3): every control that appears, disappears or changes leaves
// keyboard focus somewhere sensible, never on <body>. Each test drives one
// transition from QA's report with the keyboard and checks document.activeElement.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const speech: SpeechEnv = {
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

class Rec implements RecognitionLike {
  lang = '';
  interimResults = false;
  continuous = false;
  processLocally?: boolean;
  onresult: RecognitionLike['onresult'] = null;
  onerror: RecognitionLike['onerror'] = null;
  onend: RecognitionLike['onend'] = null;
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {}
}
const recognition = Rec as unknown as RecognitionCtor;
recognition.available = async () => 'available';

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

async function mount(node: ReactNode) {
  host = document.body.appendChild(document.createElement('div'));
  root = createRoot(host);
  await act(async () => {
    root!.render(<SpeechProvider value={{ speech, recognition }}>{node}</SpeechProvider>);
  });
  // Let the on-device check resolve so Talk appears.
  await act(async () => {});
  return userEvent.setup({ document });
}

const button = (name: string) => {
  const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === name);
  if (!b) throw new Error(`no button "${name}"`);
  return b;
};
const focused = () => document.activeElement;
const label = () => focused()?.textContent?.trim();

async function press(user: ReturnType<typeof userEvent.setup>, name: string) {
  button(name).focus();
  await act(async () => {
    await user.keyboard('{Enter}');
  });
}

describe('keyboard focus across UDL transitions (S5-U1)', () => {
  it('Read to me → Pause → Keep going stay on one button, and Stop returns to it', async () => {
    const user = await mount(<ReadAloud text="Water rises as vapour." />);
    await press(user, 'Read to me');
    expect(label()).toBe('Pause');
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(label()).toBe('Keep going');
    await press(user, 'Stop');
    expect(focused()).not.toBe(document.body);
    expect(label()).toBe('Read to me');
  });

  it('Talk opens the explanation with focus on Start talking, which it describes', async () => {
    const user = await mount(<SpeakOrType label="What is evaporation?" onSend={() => {}} />);
    await press(user, 'Talk');
    expect(label()).toBe('Start talking');
    const described = document.getElementById(focused()!.getAttribute('aria-describedby')!);
    expect(described?.textContent).toContain('Your voice stays on this device');
    await act(async () => {
      await user.tab();
    });
    expect(label()).toBe('Not now');
  });

  it('Not now closes the explanation and returns focus to Talk', async () => {
    const user = await mount(<SpeakOrType label="What is evaporation?" onSend={() => {}} />);
    await press(user, 'Talk');
    await press(user, 'Not now');
    expect(label()).toBe('Talk');
  });

  it('Start talking returns focus to the Talk button, now Stop talking', async () => {
    const user = await mount(<SpeakOrType label="What is evaporation?" onSend={() => {}} />);
    await press(user, 'Talk');
    await press(user, 'Start talking');
    await act(async () => {});
    expect(label()).toBe('Stop talking');
    expect(document.querySelector('[role="status"]')?.textContent).toContain("I'm listening");
    await act(async () => {
      await user.keyboard('{Enter}');
    });
    expect(label()).toBe('Talk');
  });

  it('Send keeps focus in the text box', async () => {
    const sent: string[] = [];
    const user = await mount(
      <SpeakOrType label="What is evaporation?" onSend={(t) => sent.push(t)} />,
    );
    const box = document.querySelector('textarea')!;
    box.focus();
    await act(async () => {
      await user.keyboard('Heat makes vapour');
    });
    await press(user, 'Send');
    expect(sent).toEqual(['Heat makes vapour']);
    expect(focused()).toBe(box);
  });

  it('Challenge this focuses the new text box, and Send to my teacher focuses the result', async () => {
    const challenges: string[] = [];
    const user = await mount(
      <Feedback
        from="Ms. Ivy"
        message="Nearly!"
        reason="Heat is needed."
        onChallenge={(t) => challenges.push(t)}
      />,
    );
    await press(user, 'Challenge this');
    expect(focused()?.tagName).toBe('TEXTAREA');
    await act(async () => {
      await user.keyboard('I said heat');
    });
    await press(user, 'Send to my teacher');
    expect(challenges).toEqual(['I said heat']);
    expect(focused()?.getAttribute('role')).toBe('status');
    expect(focused()?.textContent).toContain('Sent to your teacher');
  });

  it('keeps live regions in the page while they are empty', async () => {
    await mount(
      <>
        <SpeakOrType label="Answer" onSend={() => {}} />
        <Feedback from="Ms. Ivy" message="Nearly!" reason="Why." onChallenge={() => {}} />
      </>,
    );
    const statuses = document.querySelectorAll('[role="status"]');
    expect(statuses).toHaveLength(2);
    for (const s of statuses) expect(s.textContent).toBe('');
  });
});

describe('StepFlow keeps a break across a reload (S5-F4)', () => {
  it('comes back on a break, even on the first step', async () => {
    localStorage.setItem('ideamap.steps.t', '0p');
    const user = await mount(
      <StepFlow
        title="Review"
        saveKey="t"
        onFinish={() => {}}
        steps={[
          { title: 'Read', body: 'one' },
          { title: 'Try', body: 'two' },
        ]}
      />,
    );
    expect(document.querySelector('h2')?.textContent).toBe('Taking a break');
    await press(user, 'Keep going');
    expect(focused()?.textContent).toBe('Read');
    expect(localStorage.getItem('ideamap.steps.t')).toBe('0');
    localStorage.clear();
  });
});
