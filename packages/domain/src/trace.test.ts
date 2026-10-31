import { describe, expect, it } from 'vitest';
import { traceTargets, type TraceIdea } from './index.js';

const idea = (idea_id: string, requires: string[] = [], layer: TraceIdea['layer'] = 'process') => ({
  idea_id,
  requires,
  layer,
});

// The water cycle in miniature: the process loop lives in Links, so requires is a chain
// over the mechanisms.
const water: TraceIdea[] = [
  idea('evap', ['thermal', 'phase']),
  idea('cond', ['evap', 'phase']),
  idea('prec', ['cond', 'dropmass', 'gravity']),
  idea('coll', ['prec', 'gravity', 'topo']),
  idea('thermal', [], 'mechanism'),
  idea('phase', ['thermal'], 'mechanism'),
  idea('gravity', [], 'mechanism'),
  idea('dropmass', ['phase', 'gravity'], 'mechanism'),
  idea('topo', ['gravity'], 'mechanism'),
];

describe('traceTargets (C12, D41)', () => {
  it('C12-F4: names only mechanisms for a process idea, deepest first, never loop neighbours', () => {
    expect(traceTargets(water, 'prec', new Set())).toEqual([
      'thermal',
      'gravity',
      'phase',
      'dropmass',
    ]);
    const targets = traceTargets(water, 'coll', new Set());
    expect(targets).not.toContain('prec');
    expect(targets).not.toContain('cond');
    expect(targets).not.toContain('evap');
    expect(targets).toEqual(['thermal', 'gravity', 'phase', 'topo', 'dropmass']);
  });

  it('leaves out mastered mechanisms and what only they need', () => {
    expect(traceTargets(water, 'prec', new Set(['phase']))).toEqual([
      'thermal',
      'gravity',
      'dropmass',
    ]);
    expect(traceTargets(water, 'prec', new Set(['dropmass', 'gravity']))).toEqual([
      'thermal',
      'phase',
    ]);
  });

  it('walks through a mastered or unmastered process idea to reach the mechanisms below it', () => {
    expect(traceTargets(water, 'cond', new Set(['evap']))).toEqual(['thermal', 'phase']);
  });

  it('a mechanism idea traces to its own mechanism prerequisites', () => {
    expect(traceTargets(water, 'dropmass', new Set())).toEqual(['thermal', 'gravity', 'phase']);
    expect(traceTargets(water, 'thermal', new Set())).toEqual([]);
  });

  it('returns nothing for an unknown idea or one with no unmastered prerequisites', () => {
    expect(traceTargets(water, 'nope', new Set())).toEqual([]);
    expect(traceTargets(water, 'evap', new Set(['thermal', 'phase']))).toEqual([]);
  });

  it('walks requires as before in a single-layer pack', () => {
    const kinematics = [
      idea('speed'),
      idea('velocity', ['speed']),
      idea('accel', ['velocity']),
      idea('motion', ['accel', 'speed']),
    ];
    expect(traceTargets(kinematics, 'motion', new Set())).toEqual(['speed', 'velocity', 'accel']);
    expect(traceTargets(kinematics, 'motion', new Set(['velocity']))).toEqual(['speed', 'accel']);
  });

  it('survives a requires loop it was never meant to see', () => {
    const loop = [idea('a', ['b']), idea('b', ['a'])];
    expect(traceTargets(loop, 'a', new Set())).toEqual(['b']);
  });

  it('is fast on 2,000 ideas across both layers (C12-P1)', () => {
    const ideas: TraceIdea[] = [];
    for (let i = 0; i < 1000; i++)
      ideas.push(idea(`m${i}`, i > 0 ? [`m${i - 1}`] : [], 'mechanism'));
    for (let i = 0; i < 1000; i++)
      ideas.push(idea(`p${i}`, [i > 0 ? `p${i - 1}` : 'm999', `m${i}`]));
    const run = () => traceTargets(ideas, 'p999', new Set());
    for (let k = 0; k < 10; k++) run(); // let the engine warm up
    const times = Array.from({ length: 15 }, () => {
      const start = performance.now();
      run();
      return performance.now() - start;
    }).sort((a, b) => a - b);
    expect(times[7]).toBeLessThan(5); // the median of 15 calls
    const targets = run();
    expect(targets).toHaveLength(1000);
    expect(targets[0]).toBe('m0');
  });
});
