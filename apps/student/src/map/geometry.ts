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

/** Half the size of an idea card, for trimming links where they meet its edge. */
export function halfSize(title: string, centre: boolean) {
  return centre
    ? { hw: Math.max(70, title.length * 5.5 + 24), hh: 34 }
    : { hw: Math.max(52, title.length * 3.6 + 20), hh: 22 };
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

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

/** The view that centres the map in a box, zoomed to fit but never below a legible size. */
export function fitView(width: number, height: number, extent: { w: number; h: number }): View {
  const z = clampZoom(Math.min(1, Math.max(0.55, Math.min(width / extent.w, height / extent.h))));
  return { x: width / 2, y: height / 2, z };
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
