// The Teacher Settings sections, in the order of the design's section nav
// (project/Teacher Settings.dc.html). Later tasks fill each one in (ARCHITECTURE.md §11);
// T1 gives each its anchor, heading and place in the nav.

export type SectionIcon = 'table' | 'cap' | 'chat' | 'calendar' | 'cards' | 'lock';

export interface Section {
  /** The section's element id, and the URL fragment the nav links to. */
  id: string;
  /** The nav label. */
  label: string;
  /** The section heading. */
  heading: string;
  icon: SectionIcon;
  summary: string;
  /** A tag beside the heading, as in the design. */
  tag?: string;
}

export const SECTIONS: readonly Section[] = [
  {
    id: 'sec-source',
    label: 'Curriculum data',
    heading: 'Curriculum data',
    icon: 'table',
    summary:
      'The spreadsheet is the source of truth for ideas, links, categories, prerequisites, standards codes, media and assessment questions. Edit those there, then import a new version.',
  },
  {
    id: 'sec-course',
    label: 'Course details',
    heading: 'Course details',
    icon: 'cap',
    summary:
      'Subject, map title, grade, standards framework and whole-map objective for this class.',
    tag: 'Editable here',
  },
  {
    id: 'sec-personas',
    label: 'AI personas',
    heading: 'AI personas & prompts',
    icon: 'chat',
    summary: 'How Ms. Ivy, Milo and Atlas talk to your students.',
  },
  {
    id: 'sec-schedule',
    label: 'Schedule',
    heading: 'Schedule',
    icon: 'calendar',
    summary: 'Due dates for each unit.',
  },
  {
    id: 'sec-cards',
    label: 'Cards',
    heading: 'Card classification',
    icon: 'cards',
    summary: 'Which ideas are common, rare or legendary cards.',
  },
  {
    id: 'sec-data',
    label: 'From spreadsheet',
    heading: 'From the spreadsheet',
    icon: 'lock',
    summary: 'The tabs of the imported spreadsheet, read-only.',
  },
];

/** The section a URL fragment names, or null. */
export function sectionFor(hash: string): Section | null {
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  return SECTIONS.find((s) => s.id === id) ?? null;
}
