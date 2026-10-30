import type { StudentMap, StudentMapIdea } from '@ideamap/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CategoryIcon, LockIcon, categoryColour } from './CategoryIcon';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  STRETCH,
  UNIT,
  exitPoint,
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

interface Node {
  idea: StudentMapIdea;
  x: number;
  y: number;
  hw: number;
  hh: number;
  centre: boolean;
}

const unlockText = (idea: StudentMapIdea) =>
  `Unlocks after ${idea.unlocksAfter.map((u) => u.title).join(', ')}`;

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
  const [message, setMessage] = useState('');

  const nodes = useMemo(() => {
    const out = new Map<string, Node>();
    for (const idea of map.ideas) {
      const centre = idea.id === map.centre;
      out.set(idea.id, {
        idea,
        ...toPixels(idea),
        ...halfSize(
          {
            title: idea.title,
            category: idea.category,
            requires: idea.state === 'locked' ? unlockText(idea) : undefined,
          },
          centre,
          idea.state === 'locked',
        ),
        centre,
      });
    }
    return out;
  }, [map]);
  const extent = useMemo(() => {
    let w = 0;
    let h = 0;
    for (const n of nodes.values()) {
      w = Math.max(w, Math.abs(n.x) + n.hw);
      h = Math.max(h, Math.abs(n.y) + n.hh);
    }
    return { w: w * 2 + 40, h: h * 2 + 40 };
  }, [nodes]);
  const colours = useMemo(() => {
    const names = map.categories.map((c) => c.category);
    for (const i of map.ideas) if (!names.includes(i.category)) names.push(i.category);
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
    if (view && size) setView(zoomAt(view, view.z * k, size.w / 2, size.h / 2));
  };
  const fit = () => size && setView(fitView(size.w, size.h, extent, true));

  // Bring a card into view when the keyboard reaches it.
  const reveal = (n: Node) => {
    if (size) setView((v) => v && revealPoint(v, n, size.w, size.h));
  };

  // Back from an idea page: focus the card that was open.
  useEffect(() => {
    if (!restoreFocus) return;
    box.current?.querySelector<HTMLElement>(`[data-idea="${CSS.escape(restoreFocus)}"]`)?.focus();
  }, [restoreFocus]);

  const titleOf = (id: string) => nodes.get(id)?.idea.title ?? id;
  const label = (idea: StudentMapIdea) => {
    const out = map.links.filter((l) => l.from === idea.id);
    const into = map.links.filter((l) => l.to === idea.id);
    const part = (ls: typeof out, other: 'to' | 'from') =>
      ls.map((l) => `${titleOf(l[other])} (${l.relation})`).join(', ');
    return [
      `${idea.title}.`,
      `${idea.category}.`,
      idea.state === 'open' ? 'Open.' : `Locked. ${unlockText(idea)}.`,
      out.length ? `Leads to ${part(out, 'to')}.` : '',
      into.length ? `Comes from ${part(into, 'from')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const click = (n: Node) => {
    if (gesture.current.moved) return;
    if (n.idea.state === 'locked') {
      setMessage(`${n.idea.title} is locked. ${unlockText(n.idea)}.`);
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
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (Math.hypot(dx, dy) < 1) return [];
        const s = exitPoint(a.hw + 4, a.hh + 4, dx, dy);
        const e = exitPoint(b.hw + 4, b.hh + 4, -dx, -dy);
        const x1 = a.x + s.x;
        const y1 = a.y + s.y;
        const x2 = b.x + e.x;
        const y2 = b.y + e.y;
        return [
          {
            key: `${l.from}>${l.to}`,
            link: l,
            x1,
            y1,
            x2,
            y2,
            deg: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
          },
        ];
      }),
    [map, nodes],
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
            className="imap-world"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
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
                return (
                  <g key={e.key} className={hot ? 'imap-edge imap-edge-hot' : 'imap-edge'}>
                    <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
                    <polygon
                      points="0,0 -10,-5 -10,5"
                      transform={`translate(${e.x2} ${e.y2}) rotate(${e.deg})`}
                    />
                    {hot && (
                      <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2} textAnchor="middle" dy="-4">
                        {e.link.relation}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            {[...nodes.values()].map((n) => {
              const locked = n.idea.state === 'locked';
              return (
                <button
                  key={n.idea.id}
                  type="button"
                  data-idea={n.idea.id}
                  data-state={n.idea.state}
                  className={['imap-node', n.centre && 'imap-centre', locked && 'imap-locked']
                    .filter(Boolean)
                    .join(' ')}
                  style={{ left: n.x, top: n.y }}
                  aria-label={label(n.idea)}
                  aria-disabled={locked || undefined}
                  onClick={() => click(n)}
                  onFocus={() => {
                    setActive(n.idea.id);
                    if (modality.current === 'keyboard') reveal(n);
                  }}
                  onBlur={() => setActive(null)}
                  onMouseEnter={() => setActive(n.idea.id)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span className="imap-title">
                    {locked && <LockIcon />}
                    {n.idea.title}
                  </span>
                  <span className="imap-cat" style={{ color: colours.get(n.idea.category) }}>
                    <CategoryIcon slug={icons.get(n.idea.category) ?? null} size={12} />
                    {n.idea.category}
                  </span>
                  {locked && <span className="imap-req">{unlockText(n.idea)}</span>}
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
