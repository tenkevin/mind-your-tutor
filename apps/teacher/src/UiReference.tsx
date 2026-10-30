import type { CSSProperties, ReactNode } from 'react';
import { ThemeReference } from './ThemeReference';

// Every @ideamap/ui component class in one page, marked up as in
// project/Teacher Settings.dc.html. Served at /reference.html.

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <h2 style={{ margin: 0, font: '500 20px var(--font-heading)' }}>{title}</h2>
      {children}
    </section>
  );
}

const units = [
  { label: 'Unit 1', title: 'Where water goes', due: '2026-11-02' },
  { label: 'Unit 2', title: 'Clouds and rain', due: '2026-11-16' },
  { label: 'Unit 3', title: 'The whole cycle', due: '2026-11-30' },
];

export function UiReference() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: 'var(--space-8) 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-8)',
      }}
    >
      <h1>UI reference</h1>

      <ThemeReference />

      <Section title="Buttons">
        <div style={row}>
          <button className="btn btn-primary">Primary</button>
          <button className="btn btn-secondary">Secondary</button>
          <button className="btn btn-ghost">Ghost</button>
          <button className="btn btn-ghost btn-icon" aria-label="Remove">
            ×
          </button>
          <button className="btn btn-primary" disabled>
            Disabled
          </button>
        </div>
        <div style={{ maxWidth: 320 }}>
          <button className="btn btn-primary btn-block">Block</button>
        </div>
      </Section>

      <Section title="Fields">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-6)',
          }}
        >
          <div className="field">
            <label htmlFor="ref-subject">Subject</label>
            <input id="ref-subject" className="input" defaultValue="Earth science" />
          </div>
          <div className="field">
            <label htmlFor="ref-grade">Grade level</label>
            <select id="ref-grade" className="input" defaultValue="5">
              <option value="4">Grade 4</option>
              <option value="5">Grade 5</option>
              <option value="6">Grade 6</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ref-disabled">Disabled</label>
            <input id="ref-disabled" className="input" defaultValue="Read-only value" disabled />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ref-objective">Whole-map objective</label>
          <textarea
            id="ref-objective"
            className="input"
            defaultValue="Explain how water moves between the land, the sea and the sky."
          />
        </div>
      </Section>

      <Section title="Tags">
        <div style={row}>
          <span className="tag tag-accent">Teacher</span>
          <span className="tag tag-accent-2">Accent 2</span>
          <span className="tag tag-neutral">Read-only</span>
          <span className="tag tag-outline">Editable here</span>
        </div>
      </Section>

      <Section title="Table">
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Title</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.label}>
                  <td style={{ fontWeight: 500 }}>{u.label}</td>
                  <td>{u.title}</td>
                  <td>{u.due}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </main>
  );
}
