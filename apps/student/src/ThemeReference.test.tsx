// @vitest-environment jsdom
import { alphaTokens, colourTokens, shapeTokens } from '@ideamap/ui';
import { fireEvent, screen } from '@testing-library/dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeReference } from './ThemeReference';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  const el = document.createElement('div');
  document.body.append(el);
  root = createRoot(el);
  act(() => root.render(<ThemeReference />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  delete document.documentElement.dataset['theme'];
});

describe('ThemeReference (F8-U1, F8-F3)', () => {
  it('shows every colour token', () => {
    for (const t of [...colourTokens, ...alphaTokens, ...shapeTokens])
      expect(screen.getByText(t)).toBeTruthy();
  });

  it('switches the page theme without a reload, and back', () => {
    const select = screen.getByLabelText('Theme') as HTMLSelectElement;
    act(() => {
      fireEvent.change(select, { target: { value: 'daylight-test' } });
    });
    expect(document.documentElement.dataset['theme']).toBe('daylight-test');
    act(() => {
      fireEvent.change(select, { target: { value: 'nocturne' } });
    });
    expect(document.documentElement.dataset['theme']).toBe('nocturne');
  });
});
