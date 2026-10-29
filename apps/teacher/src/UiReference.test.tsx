import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiReference } from './UiReference';

describe('UiReference', () => {
  it('renders every F2 component class', () => {
    const html = renderToStaticMarkup(<UiReference />);
    for (const cls of [
      'btn btn-primary',
      'btn btn-secondary',
      'btn btn-ghost',
      'btn-icon',
      'btn-block',
      'class="input"',
      '<select',
      '<textarea',
      'class="field"',
      'tag tag-accent"',
      'tag tag-accent-2',
      'tag tag-neutral',
      'tag tag-outline',
      'class="table"',
      'id="theme-ref-select"',
      '--map-node-mastered',
    ]) {
      expect(html).toContain(cls);
    }
    expect(html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr>/g)).toHaveLength(3);
  });
});
