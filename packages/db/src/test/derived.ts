import type { VersionDerived } from '@ideamap/contracts';

// The single positive `VersionDerived` fixture for the DB tests: complete and valid
// against VersionDerivedSchema, so a change to the contract fails typecheck here and
// derived.test.ts fails at runtime, in one place. Use it wherever a test stores a
// derived body that the application must accept.
//
// It is written by hand because packages/db does not depend on packages/domain, so
// `derive()` is out of reach. It describes three ideas and two links from
// fixtures/water-cycle (sun → evaporation → water vapour) rather than the full pack;
// the DB tests only need a body the contract accepts.
//
// Deliberately invalid bodies (for example the raw `derived = '{}'` that
// integrity.test.ts uses to check that published versions are frozen) stay out of
// this module and must never be named as valid.

/** A fresh copy of the valid derived body, so tests can't change each other's data. */
export function validDerived(): VersionDerived {
  return {
    ranked_links: {
      max_links: 3,
      kept: [
        {
          from_id: 'sun',
          to_id: 'evap',
          relation: 'powers',
          importance: 5,
          media_url: 'how-the-sun-powers-evaporation.mp4',
          row: 0,
        },
        {
          from_id: 'evap',
          to_id: 'vap',
          relation: 'creates',
          importance: 5,
          media_url: 'from-puddle-to-vapour.mp4',
          row: 1,
        },
      ],
      hidden: [
        {
          from_id: 'sun',
          to_id: 'evap',
          relation: 'heats',
          importance: 3,
          media_url: null,
          row: 2,
          reason: 'duplicate',
        },
      ],
    },
    layout: {
      centre: 'evap',
      rank: ['evap', 'sun', 'vap'],
      positions: [
        { idea_id: 'evap', ring: 0, angle: null, x: 0, y: 0 },
        { idea_id: 'sun', ring: 1, angle: Math.PI, x: -1, y: 0 },
        { idea_id: 'vap', ring: 1, angle: 0, x: 1, y: 0 },
      ],
    },
    quizzes: {
      seed: 1,
      quiz_length: 1,
      banks: [
        {
          idea_id: 'sun',
          questions: [
            {
              id: 'sun:complete_link:sun>evap',
              kind: 'complete_link',
              prompt: 'Complete the link.',
              text: 'The Sun ___ evaporation.',
              options: ['powers', 'creates', 'forms'],
              answer: 'powers',
              explanation: 'The Sun powers evaporation.',
              link: { from_id: 'sun', to_id: 'evap' },
            },
          ],
          short: false,
        },
        {
          idea_id: 'evap',
          questions: [
            {
              id: 'evap:true_false:evap>vap',
              kind: 'true_false',
              prompt: 'True or false?',
              text: 'Evaporation creates water vapour.',
              options: ['True', 'False'],
              answer: 'True',
              explanation: 'Evaporation creates water vapour.',
              link: { from_id: 'evap', to_id: 'vap' },
            },
          ],
          short: false,
        },
        { idea_id: 'vap', questions: [], short: true },
      ],
    },
  };
}
