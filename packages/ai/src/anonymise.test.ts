import { describe, expect, it } from 'vitest';
import { Anonymiser, ruleRecognizer } from './index.js';

// A7-F1 to F4, A7-P1 (rules only: there is no model to download), A7-S1 on the device.
// Every name, place, address, email and number below is made up.

/** [sentence, identifiers that must not survive]. */
const SENTENCES: [string, string[]][] = [
  ['My friend Maya sits next to me in science.', ['Maya']],
  ['maya and i did the quiz together', ['maya']],
  ['Me and Mia and Priya made a model volcano.', ['Priya']],
  ['Mr. Okafor said the water cycle test is on Friday.', ['Okafor']],
  ['Ms. Delgado let us finish early.', ['Delgado']],
  ['my teacher Mrs Tanaka gave us extra homework', ['Tanaka']],
  ['Sofiya told me it was easy.', ['Sofiya']],
  ['Jonathon wants to be partners.', ['Jonathon']],
  ['sam said hi to me at lunch', ['sam']],
  ['I sat with Liam Carter at lunch.', ['Liam Carter']],
  ['My brother Diego helped me study.', ['Diego']],
  ['my name is dylan and i like frogs', ['dylan']],
  ["I'm Hannah and I'm in sixth grade.", ['Hannah']],
  ['Call me Maddie.', ['Maddie']],
  ['Ask Zoe and Omar about it.', ['Zoe', 'Omar']],
  ['Coach Rivera runs our team.', ['Rivera']],
  ['I live in Springfield near the river.', ['Springfield']],
  ['We moved to Oakdale last year.', ['Oakdale']],
  ['I was born in Leeds.', ['Leeds']],
  ['My grandma lives in Lisbon.', ['Lisbon']],
  ['last summer we went to new york', ['new york']],
  ['i am from toronto', ['toronto']],
  ['We visited Mexico City in July.', ['Mexico City']],
  ['I go to Lincoln Elementary School.', ['Lincoln Elementary School']],
  ['I go to Maple Grove Middle School every day.', ['Maple Grove Middle School']],
  ['i go to riverside high school', ['riverside high school']],
  ['Our class is at Westbrook Academy.', ['Westbrook Academy']],
  ['I live at 42 Birch Street.', ['42 Birch Street']],
  ['My address is 7 Pine Road, Apt 3.', ['7 Pine Road']],
  ['we meet at 120 oak avenue after school', ['120 oak avenue']],
  ['Email me at kid.writer@example.org please.', ['kid.writer@example.org']],
  ['my mum is mum.smith@mail.example.com', ['mum.smith@mail.example.com']],
  ['Call me on 555-123-4567.', ['555-123-4567']],
  ['my number is (555) 987 6543', ['987 6543']],
  ['Text 07700 900123 if you need me.', ['07700 900123']],
  ['We play at Central Park on weekends.', ['Central Park']],
  ['My dad works at Mercy Hospital.', ['Mercy Hospital']],
  ['Ethan and Olivia are in my group.', ['Ethan', 'Olivia']],
  ['Is it true that Noah said clouds are made of smoke?', ['Noah']],
  ["Luis's dog ate his worksheet.", ['Luis']],
  ['my classmate Aaliyah explained evaporation', ['Aaliyah']],
  ['My cousin Tyler lives in Chicago.', ['Tyler', 'Chicago']],
  ['I talked to Dr. Nguyen about it.', ['Nguyen']],
  ['Priya Shah and Ben Walker were absent.', ['Priya Shah', 'Ben Walker']],
  ['My best friend Layla and I go to Hillcrest Primary.', ['Layla', 'Hillcrest Primary']],
  ['Daniel from Madrid is my pen pal.', ['Daniel', 'Madrid']],
  ['Hey Ms. Ivy, my buddy Jake says clouds are heavy.', ['Jake']],
  ['I stay at my aunt Carmen’s house in San Diego.', ['Carmen', 'San Diego']],
  ['nadia lives in cairo and speaks arabic', ['nadia', 'cairo']],
  ['Is Victoria in the other class?', ['Victoria']],
];

const NEUTRAL = ['Person A', 'Place A', 'School A', 'Address A', 'Email A', 'Phone A'];

describe('on-device blur (A7-F1)', () => {
  it('blurs at least 95% of 50 synthetic sentences, and lists the misses', async () => {
    expect(SENTENCES).toHaveLength(50);
    const misses: string[] = [];
    let total = 0;
    for (const [sentence, identifiers] of SENTENCES) {
      const blurred = await new Anonymiser().blur(sentence);
      for (const id of identifiers) {
        total++;
        if (blurred.toLocaleLowerCase().includes(id.toLocaleLowerCase())) {
          misses.push(`${id} in "${sentence}" -> "${blurred}"`);
        }
      }
    }
    const recall = 1 - misses.length / total;
    // The misses go in the failure message, so a regression names its sentences.
    expect(recall, misses.join('\n')).toBeGreaterThanOrEqual(0.95);
  });

  it('replaces them with neutral labels, not blanks or brackets', async () => {
    const a = new Anonymiser();
    const out = await a.blur(
      'I live at 42 Birch Street and my friend Maya goes to Lincoln Elementary School.',
    );
    expect(out).toBe('I live at Address A and my friend Person A goes to School A.');
    expect(NEUTRAL.some((l) => out.includes(l))).toBe(true);
  });
});

describe('interests stay specific (A7-F2, D27)', () => {
  it('keeps teams, pets, topics and ordinary words', async () => {
    const a = new Anonymiser();
    expect(await a.blur('I love Real Madrid and my cat Luna')).toBe(
      'I love Real Madrid and my cat Luna',
    );
    for (const text of [
      'I support Manchester United and play Minecraft.',
      'My dog Max loves the water cycle, and I like dinosaurs and Pokemon.',
      'We learned that rain falls in 3 steps in 2026, at 100 degrees.',
      'a young student asked about evaporation',
      'Our School Day starts at nine. The High tide is at ten.',
    ]) {
      expect(await new Anonymiser().blur(text), text).toBe(text);
    }
    expect(await a.blur('My cat Luna and my friend Maya watched Real Madrid')).toBe(
      'My cat Luna and my friend Person A watched Real Madrid',
    );
  });
});

describe('consistent labels (A7-F3)', () => {
  it('gives one entity one label and two entities two', async () => {
    const a = new Anonymiser();
    expect(await a.blur('Maya told Omar that maya was late.')).toBe(
      'Person A told Person B that Person A was late.',
    );
    // Across turns of the same conversation, too.
    expect(await a.blur('Did Omar answer Maya?')).toBe('Did Person B answer Person A?');
  });

  it('treats a first name and the full name as one person, but not two people sharing a first name', async () => {
    const a = new Anonymiser();
    expect(await a.blur('Liam Carter and Liam')).toBe('Person A and Person A');
    expect(await new Anonymiser().blur('Liam Carter and Liam Ng')).toBe('Person A and Person B');
  });

  it('numbers places, schools and people separately', async () => {
    expect(await new Anonymiser().blur('Maya in Leeds and Omar in Lisbon')).toBe(
      'Person A in Place A and Person B in Place B',
    );
  });
});

describe('re-fill (A7-F4)', () => {
  it('puts the real words back for the student', async () => {
    const a = new Anonymiser();
    const sent = await a.blur('Maya lives in Leeds and her email is maya.k@example.org');
    expect(sent).toBe('Person A lives in Place A and her email is Email A');
    expect(a.refill("Person A's idea is great, and Place A is lovely. Email A.")).toBe(
      "Maya's idea is great, and Leeds is lovely. maya.k@example.org.",
    );
  });

  it('leaves a label this device never made, and ordinary words, alone', () => {
    const a = new Anonymiser();
    expect(a.refill('Person Z asked a Person question about a place')).toBe(
      'Person Z asked a Person question about a place',
    );
  });
});

describe('the mapping stays on the device (A7-S1)', () => {
  it('forgets everything on clear, and writes nothing to storage', async () => {
    const stored: string[] = [];
    const storage = {
      setItem: (k: string, v: string) => stored.push(k + v),
      getItem: () => null,
    };
    Object.assign(globalThis, { localStorage: storage, sessionStorage: storage });
    const a = new Anonymiser();
    await a.blur('Maya and Omar');
    a.clear();
    expect(a.refill('Person A and Person B')).toBe('Person A and Person B');
    expect(await a.blur('Omar')).toBe('Person A');
    expect(stored).toEqual([]);
    Object.assign(globalThis, { localStorage: undefined, sessionStorage: undefined });
  });
});

describe('recognizer seam', () => {
  it('uses a plugged-in recognizer (an on-device model) instead of the rules', async () => {
    const a = new Anonymiser({
      recognizer: {
        recognize: async (text) => {
          const at = text.indexOf('Zork');
          return at < 0 ? [] : [{ start: at, end: at + 4, kind: 'person' }];
        },
      },
    });
    expect(await a.blur('Zork met Maya')).toBe('Person A met Maya');
    expect(a.refill('hi Person A')).toBe('hi Zork');
  });

  it('never re-blurs a label', () => {
    expect(ruleRecognizer.recognize('Person A met Place B at School C')).toEqual([]);
  });
});

describe('low-end devices (A7-P1, rules only)', () => {
  it('blurs a 500-character message well inside 150 ms, with no model to download', async () => {
    const text = (
      'Yesterday my friend Maya and I walked to Lincoln Elementary School on Birch Street ' +
      'and talked about how rain forms, how Real Madrid won, and the water cycle. '
    )
      .repeat(4)
      .slice(0, 500);
    expect(text).toHaveLength(500);
    const a = new Anonymiser();
    await a.blur(text); // warm up
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await new Anonymiser().blur(text);
    // Average of 20 runs, with a 4x allowance for a throttled school Chromebook.
    expect(((performance.now() - t0) / 20) * 4).toBeLessThan(150);
  });
});
