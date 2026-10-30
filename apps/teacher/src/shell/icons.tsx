import type { SectionIcon } from './sections';

// Small line icons for the shell, drawn in currentColor. The design uses Phosphor from
// a CDN; the apps load nothing from third parties (ARCHITECTURE.md §10), so these are
// inline. Decorative only: every icon sits beside its text label.

export type IconName =
  | SectionIcon
  | 'eye'
  | 'check'
  | 'spinner'
  | 'warning'
  | 'error'
  | 'info'
  | 'upload'
  | 'pending'
  | 'failed';

const PATHS: Record<IconName, string> = {
  table: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M2.5 9.5h11M6.5 6.5v6',
  cap: 'M1.5 6 8 3l6.5 3L8 9 1.5 6zM4.5 7.5v3c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5v-3M14.5 6v3.5',
  chat: 'M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z',
  calendar: 'M2.5 4h11v9h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  cards: 'M4.5 4.5h7v9h-7zM6.5 2.5h7v9',
  lock: 'M4 7.5h8v6H4zM5.5 7.5v-2a2.5 2.5 0 0 1 5 0v2',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  check: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.25 8.25l1.75 1.75 3.75-3.75',
  spinner: 'M8 1.5A6.5 6.5 0 1 1 1.5 8',
  warning: 'M8 2 14.5 13.5h-13zM8 6.5v3.25M8 11.5v.25',
  error: 'M5.3 1.5h5.4l3.8 3.8v5.4l-3.8 3.8H5.3l-3.8-3.8V5.3zM8 4.75v3.75M8 11v.25',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.25v4M8 4.75V5',
  upload: 'M8 10.5V2.5M5 5.5l3-3 3 3M2.5 10v3.5h11V10',
  pending: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13z',
  failed: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.75 5.75l4.5 4.5M10.25 5.75l-4.5 4.5',
};

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
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
