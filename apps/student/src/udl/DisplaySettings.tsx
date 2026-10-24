import { useEffect, useState } from 'react';

export const TEXT_SIZES = [100, 150, 200] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export interface Display {
  textSize: TextSize;
  /** Calmer: no moving parts, whatever the device setting says. */
  calm: boolean;
}

const KEY = 'ideamap.display';
const SIZE_WORDS: Record<TextSize, string> = { 100: 'Normal', 150: 'Big', 200: 'Biggest' };

export function loadDisplay(): Display {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Display> | null;
    return {
      textSize: TEXT_SIZES.find((s) => s === d?.textSize) ?? 100,
      calm: d?.calm === true,
    };
  } catch {
    return { textSize: 100, calm: false };
  }
}

/** Puts the settings on <html>, where udl.css reads them. */
export function applyDisplay(d: Display, root: HTMLElement = document.documentElement) {
  root.style.setProperty('--udl-scale', String(d.textSize / 100));
  if (d.calm) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

/**
 * Text size and motion, chosen by the student and kept in this browser only
 * (D17 representation). The device's own reduced-motion setting always applies
 * too; "Calm screen" adds to it and can't turn it off.
 */
export function DisplaySettings() {
  const [d, setD] = useState<Display>(() =>
    typeof localStorage === 'undefined' ? { textSize: 100, calm: false } : loadDisplay(),
  );
  useEffect(() => {
    applyDisplay(d);
    try {
      localStorage.setItem(KEY, JSON.stringify(d));
    } catch {
      // Storage blocked: the setting lasts until the page closes.
    }
  }, [d]);

  return (
    <fieldset className="udl-settings">
      <legend className="udl-label">Words on the page</legend>
      <div className="seg">
        {TEXT_SIZES.map((size) => (
          <label key={size} className="seg-opt udl-seg-opt">
            <input
              type="radio"
              name="udl-text-size"
              checked={d.textSize === size}
              onChange={() => setD({ ...d, textSize: size })}
            />
            {SIZE_WORDS[size]}
          </label>
        ))}
      </div>
      <label className="udl-check">
        <input
          type="checkbox"
          checked={d.calm}
          onChange={(e) => setD({ ...d, calm: e.target.checked })}
        />
        Calm screen (no moving parts)
      </label>
    </fieldset>
  );
}
