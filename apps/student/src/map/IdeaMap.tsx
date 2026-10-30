import type { StudentMap, StudentMapIdea } from '@ideamap/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CategoryIcon, LockIcon, NextIcon, categoryColour } from './CategoryIcon';
import {
  COMPACT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  STRETCH,
  UNIT,
  arc,
  fitView,
  halfSize,
  revealPoint,
  toPixels,
  zoomAt,
  type View,
} from './geometry';

// The map (S10, as Idea Map Explorer v2): the centre idea, two rings, kept links with
// arrows, dashed locked ideas that say what unlocks them. Positions are the stored
// layout; the browser only scales them. Every idea is a real button in reading order
// (centre, then each ring), so the keyboard and screen readers get the same map.
// Emphasis follows the server's lock state only: links between two locked ideas are
// quiet, and hovering or focusing an idea lights up its own links and neighbours.

interface Size {
  hw: number;
  hh: number;
}

interface Node {
  idea: StudentMapIdea;
  x: number;
  y: number;
  /** The full card, and the one-line card drawn below COMPACT_ZOOM. */
  full: Size;
  small: Size;
  centre: boolean;
}

const HIDDEN = 'Hidden idea';
const HINT = 'Explore nearby to reveal';
const unlockText = (idea: StudentMapIdea) =>
  `Unlocks after ${idea.unlocksAfter.map((u) => u.title).join(', ')}`;

/** The card's "Unlocks after" line: two names, then a count. The full list is in its label. */
const shortUnlockText = (idea: StudentMapIdea) => {
  const names = idea.unlocksAfter.map((u) => u.title);
  return names.length <= 2
    ? unlockText(idea)
    : `Unlocks after ${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
};

export function IdeaMap({
  map,
  onOpen,
  restoreFocus,
}: {
  map: StudentMap;
  /** Opens an idea's page; `at` is the card's centre on screen, for the transition. */
  onOpen: (id: string, at?: { x: number; y: number }) => void;
  /** The idea whose page was just closed; its card takes focus again. */
  restoreFocus: string | null;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [active, setActive] = useState<string | null>(null);
  // The card the pointer or focus just left, so its lift eases back down (map.css).
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(null), 200);
    return () => clearTimeout(t);
  }, [leaving]);
  // Synchronous, so the class is on the card before the browser restyles it without
  // :hover; a later render would let the border snap back.
  const leave = (id: string) =>
    flushSync(() => {
      setActive(null);
      setLeaving(id);
    });
  const [message, setMessage] = useState('');
  // The buttons, Fit and the keyboard glide the view; drag, wheel and pinch follow at once.
  const [glide, setGlide] = useState(false);

  const nodes = useMemo(() => {
    const out = new Map<string, Node>();
    for (const idea of map.ideas) {
      const centre = idea.id === map.centre;
      const locked = idea.state !== 'open';
      const card = {
        title: idea.title ?? HIDDEN,
        category: idea.category ?? '',
        requires:
          idea.state === 'next' ? shortUnlockText(idea) : idea.state === 'far' ? HINT : undefined,
      };
      out.set(idea.id, {
        idea,
        ...toPixels(idea),
        full: halfSize(card, centre, locked),
        small: halfSize(card, centre, locked, true),
        centre,
      });
    }
    return out;
  }, [map]);
  const extent = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const n of nodes.values()) {
      w = Math.max(w, Math.abs(n.x) + n.full.hw);
      h = Math.max(h, Math.abs(n.y) + n.full.hh);
    }
    return { w: w * 2 + 40, h: h * 2 + 40 };
  }, [nodes]);
  const colours = useMemo(() => {
    const names = map.categories.map((c) => c.category);
    for (const i of map.ideas)
      if (i.category && !names.includes(i.category)) names.push(i.category);
    return new Map(names.map((name, i) => [name, categoryColour(i)]));
  }, [map]);
  const icons = useMemo(() => new Map(map.categories.map((c) => [c.category, c.icon])), [map]);

  // Measure the box, and fit the map to it the first time.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const next = { w: el.clientWidth, h: el.clientHeight };
      // Hidden behind an idea page, the box measures 0; fit once it is shown.
      if (next.w === 0 || next.h === 0) return;
      setSize(next);
      setView((v) => v ?? fitView(next.w, next.h, extent));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [extent]);

  // Wheel zoom needs a non-passive listener to stop the page scrolling under the map.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setGlide(false);
      const r = el.getBoundingClientRect();
      setView(
        (v) =>
          v && zoomAt(v, v.z * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top),
      );
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  // Drag to pan, two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ moved: false, pinch: 0 });
  // How the last input arrived: only the keyboard pans a focused card into view, so a
  // click on a card near the edge isn't moved out from under the pointer.
  const modality = useRef<'keyboard' | 'pointer'>('keyboard');
  const down = (e: React.PointerEvent) => {
    modality.current = 'pointer';
    setGlide(false);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = { moved: false, pinch: 0 };
  };
  const move = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !view) return;
    const now = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
      const r = box.current!.getBoundingClientRect();
      const cx = (pts[0]!.x + pts[1]!.x) / 2 - r.left;
      const cy = (pts[0]!.y + pts[1]!.y) / 2 - r.top;
      // Read the last distance now: the state updater runs later, after it is replaced.
      const last = gesture.current.pinch;
      if (last > 0) setView((v) => v && zoomAt(v, v.z * (dist / last), cx, cy));
      gesture.current.pinch = dist;
      gesture.current.moved = true;
      return;
    }
    const dx = now.x - prev.x;
    const dy = now.y - prev.y;
    if (!gesture.current.moved && Math.hypot(dx, dy) < 4) return;
    gesture.current.moved = true;
    setView((v) => v && { ...v, x: v.x + dx, y: v.y + dy });
  };
  const up = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    gesture.current.pinch = 0;
  };

  const zoomBy = (k: number) => {
    if (!view || !size) return;
    setGlide(true);
    setView(zoomAt(view, view.z * k, size.w / 2, size.h / 2));
  };
  const fit = () => {
    if (!size) return;
    setGlide(true);
    setView(fitView(size.w, size.h, extent, true));
  };

  // Bring a card into view when the keyboard reaches it.
  const reveal = (n: Node) => {
    if (!size) return;
    setGlide(true);
    setView((v) => v && revealPoint(v, n, size.w, size.h));
  };

  // Back from an idea page: focus the card that was open.
  useEffect(() => {
    if (!restoreFocus) return;
    box.current?.querySelector<HTMLElement>(`[data-idea="${CSS.escape(restoreFocus)}"]`)?.focus();
  }, [restoreFocus]);

  const titleOf = (id: string) => nodes.get(id)?.idea.title ?? 'a hidden idea';
  const label = (idea: StudentMapIdea) => {
    const out = map.links.filter((l) => l.from === idea.id);
    const into = map.links.filter((l) => l.to === idea.id);
    const part = (ls: typeof out, other: 'to' | 'from') =>
      ls.map((l) => `${titleOf(l[other])} (${l.relation})`).join(', ');
    if (idea.state === 'far') return `${HIDDEN}. ${HINT}`;
    return [
      `${idea.title}.`,
      `${idea.category}.`,
      idea.state === 'open' ? 'Open.' : `Next up. ${unlockText(idea)}.`,
      out.length ? `Leads to ${part(out, 'to')}.` : '',
      into.length ? `Comes from ${part(into, 'from')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const compact = view !== null && view.z < COMPACT_ZOOM;
  const open = (id: string) => nodes.get(id)?.idea.state === 'open';
  // The hovered or focused idea's direct neighbours, lit up with it.
  const near = useMemo(() => {
    if (!active) return null;
    const out = new Set<string>();
    for (const l of map.links) {
      if (l.from === active) out.add(l.to);
      if (l.to === active) out.add(l.from);
    }
    return out;
  }, [map, active]);

  const click = (n: Node) => {
    if (gesture.current.moved) return;
    if (n.idea.state !== 'open') {
      setMessage(
        n.idea.state === 'far'
          ? `${HIDDEN}. ${HINT}.`
          : `${n.idea.title} is next up. ${unlockText(n.idea)}.`,
      );
      return;
    }
    setMessage('');
    const r = box.current
      ?.querySelector(`[data-idea="${CSS.escape(n.idea.id)}"]`)
      ?.getBoundingClientRect();
    onOpen(n.idea.id, r && { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const edges = useMemo(
    () =>
      map.links.flatMap((l) => {
        const a = nodes.get(l.from);
        const b = nodes.get(l.to);
        if (!a || !b) return [];
        const curve = arc(
          { x: a.x, y: a.y, ...(compact ? a.small : a.full) },
          { x: b.x, y: b.y, ...(compact ? b.small : b.full) },
        );
        if (curve.len < 1) return [];
        return [{ key: `${l.from}>${l.to}`, link: l, ...curve }];
      }),
    [map, nodes, compact],
  );

  return (
    <div className="imap-wrap">
      <div className="imap-bar">
        <p className="imap-hint">
          Drag to move · scroll or pinch to zoom · Tab to move between ideas
        </p>
        <div className="imap-controls">
          <button
            type="button"
            className="btn btn-secondary imap-btn"
            onClick={() => zoomBy(1.25)}
            disabled={!view || view.z >= MAX_ZOOM}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="btn btn-secondary imap-btn"
            onClick={() => zoomBy(0.8)}
            disabled={!view || view.z <= MIN_ZOOM}
            aria-label="Zoom out"
          >
            −
          </button>
          <button type="button" className="btn btn-secondary imap-btn" onClick={fit}>
            Fit
          </button>
        </div>
      </div>
      <div
        ref={box}
        className="imap"
        role="group"
        aria-label={`Idea map: ${map.topic}. ${map.ideas.length} ideas. Drag to move, scroll or pinch to zoom.`}
        onKeyDown={() => (modality.current = 'keyboard')}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {view && (
          <div
            className={['imap-world', compact && 'imap-compact', glide && 'imap-world-glide']
              .filter(Boolean)
              .join(' ')}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
            onTransitionEnd={(e) => e.target === e.currentTarget && setGlide(false)}
          >
            <svg className="imap-svg" width="1" height="1" aria-hidden="true" focusable="false">
              {[1, 2].map((ring) => (
                <ellipse
                  key={ring}
                  className="imap-ring"
                  cx="0"
                  cy="0"
                  rx={ring * UNIT * STRETCH}
                  ry={ring * UNIT}
                />
              ))}
              {edges.map((e) => {
                const hot = active === e.link.from || active === e.link.to;
                const quiet = !open(e.link.from) && !open(e.link.to);
                const cls = [
                  'imap-edge',
                  hot && 'imap-edge-hot',
                  !hot && quiet && 'imap-edge-quiet',
                  !hot && active && 'imap-edge-faded',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <g key={e.key} className={cls} data-link={e.key}>
                    <path d={e.d} />
                    <polygon
                      points="0,0 -10,-5 -10,5"
                      transform={`translate(${e.end.x} ${e.end.y}) rotate(${e.deg})`}
                    />
                    {hot && (
                      <text x={e.mid.x} y={e.mid.y} textAnchor="middle" dy="-4">
                        {e.link.relation}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {[...nodes.values()].map((n) => {
              const locked = n.idea.state !== 'open';
              return (
                <button
                  key={n.idea.id}
                  type="button"
                  data-idea={n.idea.id}
                  data-state={n.idea.state}
                  className={[
                    'imap-node',
                    n.centre && 'imap-centre',
                    locked && `imap-${n.idea.state}`,
                    near?.has(n.idea.id) && 'imap-near',
                    leaving === n.idea.id && 'imap-leaving',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  // --ring staggers the fade-in from the centre outwards.
                  style={{ left: n.x, top: n.y, ['--ring' as string]: n.idea.ring }}
                  aria-label={label(n.idea)}
                  aria-disabled={locked || undefined}
                  onClick={() => click(n)}
                  onFocus={() => {
                    setActive(n.idea.id);
                    if (modality.current === 'keyboard') reveal(n);
                  }}
                  onBlur={() => leave(n.idea.id)}
                  onMouseEnter={() => setActive(n.idea.id)}
                  onMouseLeave={() => leave(n.idea.id)}
                >
                  <span className="imap-title">
                    {n.idea.state === 'next' && <NextIcon />}
                    {n.idea.state === 'far' && <LockIcon />}
                    {n.idea.title ?? HIDDEN}
                  </span>
                  {n.idea.category && (
                    <span className="imap-cat" style={{ color: colours.get(n.idea.category) }}>
                      <CategoryIcon slug={icons.get(n.idea.category) ?? null} size={12} />
                      <span className="imap-cat-name">{n.idea.category}</span>
                    </span>
                  )}
                  {n.idea.state === 'far' && <span className="imap-req">{HINT}</span>}
                  {n.idea.state === 'next' && <UnlockLine idea={n.idea} />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="imap-status" role="status" aria-live="polite">
        {message}
      </p>
    </div>
  );
}

/** "Unlocks after …" on a locked card; a long list shows in full on hover and focus. */
function UnlockLine({ idea }: { idea: StudentMapIdea }) {
  const full = unlockText(idea);
  const short = shortUnlockText(idea);
  if (short === full) return <span className="imap-req">{full}</span>;
  return (
    <span className="imap-req">
      <span className="imap-req-short">{short}</span>
      <span className="imap-req-full">{full}</span>
    </span>
  );
}
