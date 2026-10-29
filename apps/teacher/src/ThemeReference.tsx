import {
  alphaTokens,
  applyTheme,
  colourTokens,
  cssVar,
  defaultTheme,
  resolveTheme,
  shapeTokens,
  themes,
} from '@ideamap/ui';
import { useState, type CSSProperties } from 'react';

// Every colour token for the active theme, with a switcher, so a designer can
// review a theme in one place (F8-U1). Colours come only from var(--token).
// Map states carry a shape as well as a colour (UDL, D17). The teacher app's
// reference page has the same component.

const swatch: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-3)',
  fontSize: 12,
};

const states = [
  { token: '--map-node-open', label: 'Open', shape: '○' },
  { token: '--map-node-locked', label: 'Locked', shape: '▣' },
  { token: '--map-node-mastered', label: 'Mastered', shape: '★' },
] as const;

export function ThemeReference() {
  const [id, setId] = useState<string>(defaultTheme.id);

  return (
    <section aria-labelledby="theme-ref-title" style={{ display: 'grid', gap: 'var(--space-4)' }}>
      <h2 id="theme-ref-title">Themes</h2>
      <div className="field">
        <label htmlFor="theme-ref-select">Theme</label>
        <select
          id="theme-ref-select"
          className="input"
          value={id}
          onChange={(e) => setId(applyTheme(e.target.value, document.documentElement).id)}
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-6)', flexWrap: 'wrap' }}>
        {states.map((s) => (
          <span key={s.token} style={{ ...swatch, color: cssVar(s.token), fontSize: 15 }}>
            <span aria-hidden="true" style={{ fontSize: 24 }}>
              {s.shape}
            </span>
            {s.label}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: 'var(--space-3)',
        }}
      >
        {colourTokens.map((t) => (
          <div key={t} style={swatch}>
            <span
              aria-hidden="true"
              style={{
                width: 28,
                height: 28,
                borderRadius: 'var(--radius-sm)',
                background: cssVar(t),
                boxShadow: 'var(--shadow-sm)',
                // Forced colours replaces backgrounds; the border keeps the swatch visible.
                border: '1px solid currentcolor',
              }}
            />
            <code>{t}</code>
          </div>
        ))}
      </div>

      <table className="table">
        <caption style={{ textAlign: 'left' }}>Alpha, type, radius and shadow tokens</caption>
        <thead>
          <tr>
            <th>Token</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {[...alphaTokens, ...shapeTokens].map((t) => (
            <tr key={t}>
              <td>
                <code>{t}</code>
              </td>
              <td>{resolveTheme(id).values[t]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
