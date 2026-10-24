import { useState } from 'react';
import {
  DisplaySettings,
  Feedback,
  IdeaText,
  MissionPicker,
  ReadAloud,
  SpeakOrType,
  StepFlow,
  type Mission,
} from './udl';

// Every S5 component on one page, for QA and visual checks (udl-reference.html).
// The content is from fixtures/water-cycle. Nothing on this page calls the API.

const missions: Mission[] = [
  {
    id: 'teach-1',
    title: 'Teach Milo: Unit 1',
    detail: 'Due Friday · ready now',
    state: 'ready',
  },
  {
    id: 'quiz-cond',
    title: 'Pass the Condensation quiz',
    detail: 'Score 3 of 4 to unlock the next ideas',
    state: 'todo',
  },
  {
    id: 'teach-2',
    title: 'Teach Milo: Unit 2',
    detail: 'Master 2 more ideas first',
    state: 'locked',
  },
  { id: 'streak', title: 'Keep your streak', detail: '3-day streak', state: 'done' },
];

export function UdlReference() {
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [...l, line]);

  return (
    <main className="udl-ref">
      <h1>Student UDL components</h1>
      <DisplaySettings />

      <h2>Representation: text, read-aloud, pictures</h2>
      <IdeaText
        title="Evaporation"
        text="When the Sun warms water in oceans, lakes and puddles, some of it turns into an invisible gas and rises into the air."
        media={{
          src: '/udl-sample-evaporation.svg',
          alt: 'The Sun shines on a lake, and wavy lines of water vapour rise from the water.',
          caption: 'The Sun heats the lake, and water rises as vapour.',
        }}
      />
      <IdeaText
        title="Condensation"
        text="As water vapour rises it cools down and turns back into tiny drops of liquid water."
      />
      <article className="udl-card">
        <p className="udl-hint">Quiz · Question 1 of 4</p>
        <ReadAloud
          as="div"
          text="What makes water vapour turn back into drops of liquid water?"
          label="Read the question"
        />
      </article>

      <h2>Action and expression: type or talk</h2>
      <article className="udl-card">
        <SpeakOrType
          label="In your own words, what is evaporation?"
          placeholder="Type here, or press Talk"
          onSend={(t) => note(`Answer: ${t}`)}
        />
      </article>
      <Feedback
        from="Ms. Ivy"
        message="Nearly! Evaporation needs heat, so it happens faster on a sunny day."
        reason="Key point: the Sun's heat turns liquid water into vapour."
        onChallenge={(t) => note(`Challenge: ${t}`)}
      />

      <h2>Engagement: choice and pacing</h2>
      <MissionPicker missions={missions} onChoose={(id) => note(`Mission chosen: ${id}`)} />
      <StepFlow
        title="Review: Evaporation"
        saveKey="udl-reference"
        steps={[
          {
            title: 'Read the idea',
            body: <ReadAloud text="Heat turns liquid water into vapour." />,
          },
          {
            title: 'Find an example',
            body: <ReadAloud text="Think of a puddle on a sunny day. Where does the water go?" />,
          },
          { title: 'Say it back', body: <ReadAloud text="Explain evaporation to a friend." /> },
        ]}
        onFinish={() => note('Steps finished')}
      />

      <h2>What this page would send</h2>
      <p className="udl-hint">
        A real page sends the text. This one only lists it here. Nothing else is sent.
      </p>
      <ul aria-live="polite">
        {log.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </main>
  );
}
