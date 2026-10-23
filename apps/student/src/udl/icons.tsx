// Small inline icons. Every control that shows one also shows a text label, so
// the icons are decorative (aria-hidden). Inline, so no icon font is fetched.

const paths = {
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12',
  pause: 'M7 5h3v14H7zM14 5h3v14h-3z',
  play: 'M7 5l12 7-12 7z',
  stop: 'M6 6h12v12H6z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  flag: 'M6 21V4M6 4h11l-2 4 2 4H6',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="udl-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
