import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Tracker determinism lint (ARCHITECTURE.md §8).
const TIMERS = [
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'clearImmediate',
  'queueMicrotask',
  'requestAnimationFrame',
];
const IO_MODULES = [
  'crypto',
  'http',
  'https',
  'http2',
  'net',
  'tls',
  'dgram',
  'dns',
  'fs',
  'timers',
  'child_process',
  'worker_threads',
  'cluster',
  'perf_hooks',
  'process',
  'os',
  'module',
  'vm',
];
const banned = (what, source) =>
  `${what} is banned in tracker code, which must be deterministic. ` +
  `Take ${source} from event data instead (event time, ids and seeds carried in events). ` +
  'See ARCHITECTURE.md §8.';

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
    // The tracker must be deterministic: no clock, no randomness, no I/O
    // (ARCHITECTURE.md §8). Covers every source file in the package. Test files
    // are exempt so they can stub globals; their names (*.test.*) say so.
    files: ['packages/tracker/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['packages/tracker/**/*.test.*'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: banned('Date.now()', 'time') },
        { object: 'Math', property: 'random', message: banned('Math.random()', 'random values') },
      ],
      'no-restricted-globals': [
        'error',
        ...['globalThis', 'global', 'window', 'self'].map((name) => ({
          name,
          message: banned(`${name} (it reaches the clock, randomness and I/O)`, 'values'),
        })),
        ...['performance', 'process'].map((name) => ({
          name,
          message: banned(`${name} (a clock)`, 'time'),
        })),
        { name: 'crypto', message: banned('crypto (randomness)', 'ids and seeds') },
        ...['fetch', 'XMLHttpRequest', 'WebSocket', 'require'].map((name) => ({
          name,
          message: banned(`${name} (I/O)`, 'inputs'),
        })),
        ...TIMERS.map((name) => ({ name, message: banned(`${name} (a timer)`, 'time') })),
        // These run code the other rules can't see.
        ...['eval', 'Function'].map((name) => ({
          name,
          message: banned(`${name} (it runs code lint can't check)`, 'values'),
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: `^(node:)?(${IO_MODULES.join('|')})(/.*)?$`,
              message: banned(
                "Importing Node's crypto, timer and I/O modules",
                'inputs, ids and time',
              ),
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: banned('new Date() with no argument (the current time)', 'time'),
        },
        {
          // Date and Math may only be used directly, as Date.parse(...) or
          // new Date(eventTime), so an alias can't hide Date.now or Math.random.
          selector: `Identifier[name=/^(Date|Math)$/]${[
            ':not(NewExpression > Identifier.callee)',
            ':not(MemberExpression > Identifier.object)',
            ':not(MemberExpression[computed=false] > Identifier.property)',
            ':not(Property[computed=false] > Identifier.key)',
            ':not(BinaryExpression[operator="instanceof"] > Identifier.right)',
            ':not(TSTypeReference > Identifier.typeName)',
          ].join('')}`,
          message: banned('Aliasing Date or Math', 'time and random values'),
        },
        {
          selector: 'ImportExpression',
          message: banned('Dynamic import() (I/O)', 'inputs'),
        },
      ],
    },
  },
  {
    // Domain logic is pure: no network, file or database access (ARCHITECTURE.md §7).
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['packages/domain/src/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^(node:)?(fs|fs/promises|net|http|https|http2|dgram|child_process)$',
              message: 'Domain logic does no I/O.',
            },
            { regex: '^@ideamap/(db|ai|connectors)$', message: 'Domain logic does no I/O.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Domain logic does no I/O.' }],
    },
  },
  prettier,
);
