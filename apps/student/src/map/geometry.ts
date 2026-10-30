// Drawing maths for the student map. Positions come from the version's stored layout
// (ring radius as the unit); this only scales them to pixels, as the prototype does with
// its ellipse (EX), and never lays anything out again.

/** Pixels per ring radius, and the sideways stretch of the rings. */
export const UNIT = 205;
export const STRETCH = 1.35;

export const toPixels = (p: { x: number; y: number }) => ({
  x: p.x * UNIT * STRETCH,
  y: p.y * UNIT,
});

/**
 * Half the size of an idea card, from its longest line of text (13px titles, 11px
 * category and "Unlocks after" lines), so links stop at its edge and Fit never clips it.
 */
export function halfSize(
  card: { title: string; category: string; requires?: string },
  centre: boolean,
  locked: boolean,
) {
  if (centre) return { hw: Math.max(70, card.title.length * 5.5 + 24), hh: 34 };
  const widest = Math.max(
    card.title.length * 7.4 + (locked ? 18 : 0),
    card.category.length * 6.4 + 18,
    (card.requires?.length ?? 0) * 6,
  );
  return { hw: Math.max(52, widest / 2 + 14), hh: locked ? 30 : 24 };
}

/** The point where a line from a card's centre toward (dx, dy) leaves the card. */
export function exitPoint(hw: number, hh: number, dx: number, dy: number) {
  const t = Math.min(
    Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : 9,
    Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : 9,
  );
  return { x: dx * t, y: dy * t };
}

export interface View {
  x: number;
  y: number;
  z: number;
}

export const MIN_ZOOM = 0.15;
export const MAX_ZOOM = 2.5;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/**
 * The view that centres the map in a box. Zoomed to fit, but never below a legible size
 * unless `whole` is set, which shrinks until every card is inside the box.
 */
export function fitView(
  width: number,
  height: number,
  extent: { w: number; h: number },
  whole = false,
): View {
  const fit = Math.min(1, width / extent.w, height / extent.h);
  return { x: width / 2, y: height / 2, z: clampZoom(whole ? fit : Math.max(0.55, fit)) };
}

/** Zoom about a point in the box, keeping the map point under it still. */
export function zoomAt(view: View, z: number, px: number, py: number): View {
  const next = clampZoom(z);
  const k = next / view.z;
  return { x: px - (px - view.x) * k, y: py - (py - view.y) * k, z: next };
}

/** Pan the least needed to bring a point (map pixels) inside the box, with a margin. */
export function revealPoint(
  view: View,
  p: { x: number; y: number },
  width: number,
  height: number,
  margin = 90,
): View {
  const sx = p.x * view.z + view.x;
  const sy = p.y * view.z + view.y;
  const dx = sx < margin ? margin - sx : sx > width - margin ? width - margin - sx : 0;
  const dy = sy < margin ? margin - sy : sy > height - margin ? height - margin - sy : 0;
  return dx === 0 && dy === 0 ? view : { ...view, x: view.x + dx, y: view.y + dy };
}
