import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/',
      '**/coverage/',
      'project/',
      'chats/',
      'fixtures/',
      // plan.mjs predates the lint setup and is checked by CI's plan job.
      'scripts/',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['apps/teacher/**/*.{ts,tsx}', 'apps/student/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    ...reactHooks.configs.flat.recommended,
  },
  {
    // The tracker must be deterministic: no clock, no randomness, no network
    // (ARCHITECTURE.md §8). Time comes from the events themselves.
    files: ['packages/tracker/src/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Date',
          property: 'now',
          message: 'Tracker rules are deterministic; take time from the event.',
        },
        {
          object: 'Math',
          property: 'random',
          message: 'Tracker rules are deterministic; no randomness.',
        },
        { object: 'globalThis', property: 'fetch', message: 'Tracker rules do no I/O.' },
        { object: 'window', property: 'fetch', message: 'Tracker rules do no I/O.' },
      ],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Tracker rules do no I/O.' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Tracker rules are deterministic; take time from the event.',
        },
      ],
    },
  },
  prettier,
);
