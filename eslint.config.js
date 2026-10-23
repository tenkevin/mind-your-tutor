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
// Tracker code may import only these (plus relative paths). Everything else,
// Node built-ins and third-party packages alike, can reach a clock, randomness
// or I/O.
const ALLOWED_IMPORTS = ['@ideamap/contracts', '@ideamap/domain'];
// Globals that read a clock, randomness, the host or the garbage collector.
const HOST_GLOBALS = [
  ['Intl', 'it reads the locale, time zone and clock'],
  ['Temporal', 'Temporal.Now reads the clock'],
  ['AbortSignal', 'AbortSignal.timeout is a timer'],
  ['MessageChannel', 'message delivery is scheduled like a timer'],
  ['MessagePort', 'message delivery is scheduled like a timer'],
  ['BroadcastChannel', 'it is I/O between threads'],
  ['Atomics', 'Atomics.wait and waitAsync are timers'],
  ['SharedArrayBuffer', 'other threads can change it'],
  ['WeakRef', 'its result depends on garbage collection'],
  ['FinalizationRegistry', 'its result depends on garbage collection'],
  ['navigator', 'it reads the host machine'],
  ['Reflect', 'Reflect.construct(Date, []) and Reflect.apply can reach the clock'],
];
const BANNED_GLOBAL_NAMES = [
  'Date',
  'Math',
  'globalThis',
  'global',
  'window',
  'self',
  'performance',
  'process',
  'crypto',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'require',
  ...TIMERS,
  ...HOST_GLOBALS.map(([name]) => name),
  'eval',
  'Function',
];
// Methods whose result depends on the machine's locale or time zone.
const LOCAL_TIME_METHODS = [
  'localeCompare',
  'toLocaleString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'toLocaleUpperCase',
  'toLocaleLowerCase',
  'getTimezoneOffset',
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'toDateString',
  'toTimeString',
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
    // are exempt so they can stub globals; their names (*.test.*) say so, and
    // non-test code may not import them. src/runtime-guard.test.ts backs these
    // rules up at runtime, for whatever lint can't see.
    files: ['packages/tracker/**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}'],
    ignores: ['packages/tracker/**/*.test.*'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: banned('Date.now()', 'time') },
        { object: 'Math', property: 'random', message: banned('Math.random()', 'random values') },
        {
          // new Date(0).constructor.now() and (() => {}).constructor('...') reach
          // Date and Function without naming them.
          property: 'constructor',
          message: banned('.constructor (it reaches Date and Function)', 'values'),
        },
        ...LOCAL_TIME_METHODS.map((property) => ({
          property,
          message: banned(
            `.${property}() (it depends on the machine's locale or time zone; use the UTC methods)`,
            'time',
          ),
        })),
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
        ...HOST_GLOBALS.map(([name, why]) => ({
          name,
          message: banned(`${name} (${why})`, 'time'),
        })),
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
              // A test file is exempt from these rules, so it can't be used as
              // production code.
              regex: '\\.test(\\.|$)',
              message: banned('Importing a *.test.* file from non-test code', 'inputs'),
            },
            {
              // An allow list: relative paths and the listed packages only.
              regex: `^(?!\\.\\.?(/|$)|(${ALLOWED_IMPORTS.join('|')})$)`,
              message: banned(
                `Importing anything other than a relative path, ${ALLOWED_IMPORTS.join(' or ')}`,
                'inputs, ids and time',
              ),
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `VariableDeclaration[declare=true] > VariableDeclarator[id.name=/^(${BANNED_GLOBAL_NAMES.join('|')})$/]`,
          message: banned(
            'Local ambient declaration of a prohibited global (it hides the determinism check)',
            'time, ids and seeds',
          ),
        },
        {
          selector: `TSDeclareFunction > Identifier.id[name=/^(${BANNED_GLOBAL_NAMES.join('|')})$/]`,
          message: banned(
            'Local ambient declaration of a prohibited global (it hides the determinism check)',
            'time, ids and seeds',
          ),
        },
        {
          selector: `ClassDeclaration[declare=true] > Identifier.id[name=/^(${BANNED_GLOBAL_NAMES.join('|')})$/]`,
          message: banned(
            'Local ambient declaration of a prohibited global (it hides the determinism check)',
            'time, ids and seeds',
          ),
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: banned('new Date() with no argument (the current time)', 'time'),
        },
        {
          // new Date(...[]) has one argument node but none at runtime.
          selector: "NewExpression[callee.name='Date'] > SpreadElement",
          message: banned('new Date(...args) (with no args it is the current time)', 'time'),
        },
        {
          selector: "CallExpression[callee.name='Date']",
          message: banned('Date() (it returns the current time)', 'time'),
        },
        {
          // Date[k]() and Math['ran' + 'dom']() hide the property name.
          selector:
            "MemberExpression[computed=true][object.name=/^(Date|Math)$/]:not([property.type='Literal'])",
          message: banned('Computed access on Date or Math', 'time and random values'),
        },
        {
          // Date and Math may only be used directly, as Date.parse(...) or
          // new Date(eventTime), so an alias can't hide Date.now or Math.random.
          selector: `Identifier[name=/^(Date|Math)$/]${[
            ':not(NewExpression > Identifier.callee)',
            // Reported above with their own messages.
            ":not(CallExpression[callee.name='Date'] > Identifier.callee)",
            ":not(CallExpression[callee.object.name='Reflect'] > Identifier)",
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
