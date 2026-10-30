import { describe, expect, it } from 'vitest';
import {
  COMPACT_ZOOM,
  exitPoint,
  fitView,
  halfSize,
  revealPoint,
  toPixels,
  zoomAt,
  UNIT,
  STRETCH,
} from './geometry';

describe('map geometry', () => {
  it('scales stored positions without moving them', () => {
    expect(toPixels({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(toPixels({ x: 1, y: -1 })).toEqual({ x: UNIT * STRETCH, y: -UNIT });
  });

  it('trims a link where it leaves the card', () => {
    expect(exitPoint(50, 20, 100, 0)).toEqual({ x: 50, y: 0 });
    expect(exitPoint(50, 20, 0, 100)).toEqual({ x: 0, y: 20 });
  });

  it('keeps the map point under the cursor fixed when zooming', () => {
    const view = { x: 100, y: 50, z: 1 };
    const next = zoomAt(view, 2, 300, 200);
    expect((300 - next.x) / next.z).toBeCloseTo((300 - view.x) / view.z);
    expect((200 - next.y) / next.z).toBeCloseTo((200 - view.y) / view.z);
  });

  it('starts on a phone without shrinking text below a legible size', () => {
    expect(fitView(400, 600, { w: 1400, h: 900 }).z).toBe(0.55);
    expect(fitView(1600, 900, { w: 1400, h: 900 }).z).toBe(1);
  });

  it('Fit shows every card, even on a phone', () => {
    const view = fitView(400, 600, { w: 1400, h: 900 }, true);
    expect(view.z * 1400).toBeLessThanOrEqual(400);
    expect(view.z * 900).toBeLessThanOrEqual(600);
  });

  it('a compact card is one line and narrower than the full card', () => {
    const card = {
      title: 'Condensation',
      category: 'Process',
      requires: 'Unlocks after Evaporation',
    };
    const full = halfSize(card, false, true);
    const small = halfSize(card, false, true, true);
    expect(small.hw).toBeLessThan(full.hw);
    expect(small.hh).toBeLessThan(full.hh);
    expect(COMPACT_ZOOM).toBeLessThan(fitView(400, 600, { w: 1400, h: 900 }).z);
  });

  it('pans only when a focused idea is out of view', () => {
    const view = { x: 200, y: 200, z: 1 };
    expect(revealPoint(view, { x: 0, y: 0 }, 400, 400)).toBe(view);
    expect(revealPoint(view, { x: 500, y: 0 }, 400, 400).x).toBeLessThan(view.x);
  });
});
