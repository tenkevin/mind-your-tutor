// Line icons for the data views, in the shell's style (currentColor, 16-unit grid).
// The design uses Phosphor from a CDN; the apps load nothing from third parties.

export type DataIconName = 'tree' | 'shapes' | 'seal' | 'play' | 'student' | 'plug' | 'up' | 'down';

const PATHS: Record<DataIconName, string> = {
  tree: 'M2.5 2.5h4v3h-4zM9.5 6.5h4v3h-4zM9.5 11.5h4v3h-4zM6.5 4h1.5a1 1 0 0 1 1 1v8M9 8h.5M9 13h.5',
  shapes: 'M4.5 2.5 7.5 7.5h-6zM9.5 9.5h5v5h-5zM5 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  seal: 'M8 1.5l1.7 1.2 2.1-.1.7 2 1.7 1.2-.6 2 .6 2-1.7 1.2-.7 2-2.1-.1L8 14.5l-1.7-1.2-2.1.1-.7-2L1.8 10l.6-2-.6-2 1.7-1.2.7-2 2.1.1zM5.75 8l1.5 1.5 3-3',
  play: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.5 5.5l4 2.5-4 2.5z',
  student: 'M1.5 6 8 3l6.5 3L8 9zM4.5 7.5v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5v-3',
  plug: 'M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 0 1-7 0zM8 11.5v2',
  up: 'M4 10l4-4 4 4',
  down: 'M4 6l4 4 4-4',
};

export function DataIcon({ name }: { name: DataIconName }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
