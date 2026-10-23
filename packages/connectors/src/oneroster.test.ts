import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseOneRosterCsv, parseOneRoster, RosterError } from './index.js';

const fixture = (name: string) =>
  readFileSync(new URL(`../../../fixtures/oneroster/${name}`, import.meta.url), 'utf8');
const sample = () => ({
  users: fixture('users.csv'),
  classes: fixture('classes.csv'),
  enrollments: fixture('enrollments.csv'),
});

describe('parseCsv', () => {
  it('reads quotes, doubled quotes, CRLF and a BOM', () => {
    expect(parseOneRosterCsv('﻿a,b\r\n"x, y","say ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
  });

  it('keeps empty fields and skips blank lines', () => {
    expect(parseOneRosterCsv('a,,c\n\n,b,\n')).toEqual([
      ['a', '', 'c'],
      ['', 'b', ''],
    ]);
  });

  it('refuses an unclosed quote', () => {
    expect(() => parseOneRosterCsv('a,"b\n')).toThrow(RosterError);
  });
});

describe('parseOneRoster (F5-F8)', () => {
  it('keeps only names, email and roster ids (COPPA, F5-S5)', () => {
    const roster = parseOneRoster(sample());
    expect(roster.users).toEqual([
      {
        sourcedId: 't-100',
        role: 'teacher',
        name: 'Ada Teacher',
        email: 'ada.teacher@example.org',
      },
      {
        sourcedId: 't-101',
        role: 'teacher',
        name: 'Ben Teacher',
        email: 'ben.teacher@example.org',
      },
      {
        sourcedId: 's-200',
        role: 'student',
        name: 'Cal Student',
        email: 'cal.student@example.org',
      },
      { sourcedId: 's-201', role: 'student', name: 'Dee Student', email: null },
      {
        sourcedId: 's-202',
        role: 'student',
        name: 'Eli "E" Student',
        email: 'eli.student@example.org',
      },
    ]);
    const text = JSON.stringify(roster);
    for (const leaked of ['555-0', 'hunter2', 'Q', '"06"']) expect(text).not.toContain(leaked);
  });

  it('reads classes and teacher and student enrollments', () => {
    const roster = parseOneRoster(sample());
    expect(roster.classes).toEqual([
      { sourcedId: 'c-1', title: 'Science 6A' },
      { sourcedId: 'c-2', title: 'Science 6B' },
    ]);
    expect(roster.enrollments).toHaveLength(5);
    expect(roster.enrollments[0]).toEqual({
      classSourcedId: 'c-1',
      userSourcedId: 't-100',
      role: 'teacher',
      primary: true,
    });
  });

  it('lists the rows it skips, with reasons', () => {
    expect(parseOneRoster(sample()).skipped).toEqual([
      { file: 'users.csv', line: 7, reason: 'role "parent" is not imported' },
      { file: 'users.csv', line: 8, reason: 'marked tobedeleted' },
      { file: 'enrollments.csv', line: 7, reason: 'role "guardian" is not imported' },
      { file: 'enrollments.csv', line: 8, reason: 'unknown class' },
    ]);
  });

  it('refuses a file without a required column', () => {
    expect(() => parseOneRoster({ ...sample(), classes: 'sourcedId\nc-1\n' })).toThrow(
      'classes.csv has no title column.',
    );
  });
});
