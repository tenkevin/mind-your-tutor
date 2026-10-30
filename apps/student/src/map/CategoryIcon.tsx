// Category icons and colours. The Categories tab names an icon; the paths here cover the
// sample set and everything else gets a plain dot. The colour is a second cue, never the
// only one: the category name is always written beside it (D17).

const paths: Record<string, string> = {
  'arrows-clockwise': 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  lightning: 'M13 3L5 13h6l-1 8 8-10h-6z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  dot: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
};

/** The category palette from @ideamap/ui (--category-1 to -6), by category order. */
const SLOTS = 6;

export const categoryColour = (index: number) =>
  `var(--category-${(Math.max(0, index) % SLOTS) + 1})`;

export function CategoryIcon({ slug, size = 14 }: { slug: string | null; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={(slug && paths[slug]) || paths.dot} />
    </svg>
  );
}

export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" />
    </svg>
  );
}

/** An arrow: one step away. The shape, as well as the colour, says "next up" (D17). */
export function NextIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
