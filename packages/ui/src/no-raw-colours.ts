// The "no raw colours outside theme files" check (D46, F8-F5). Pure functions
// so the check can be tested on its own; no-raw-colours.test.ts runs them over the repo.

// CSS named colours. transparent and currentcolor are not themed colours and stay allowed.
const NAMED =
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(
    /\s+/,
  );
const named = new Set(NAMED);

export interface RawColour {
  line: number;
  text: string;
}

/** Replaces every match of `re` with spaces, keeping newlines, so line numbers stay put. */
const blank = (s: string, re: RegExp) => s.replace(re, (m) => m.replace(/[^\n]/g, ' '));

/** Theme blocks in a stylesheet are where raw colours belong. */
export function withoutThemeBlocks(css: string): string {
  return blank(css, /\/\* theme:begin ([\w-]+)[\s\S]*?\/\* theme:end \1 \*\//g);
}

/** Raw colours in a source file: hex, rgb()/hsl()/oklch() and friends, and named colours. */
export function findRawColours(source: string, file: string): RawColour[] {
  const isCss = file.endsWith('.css');
  let text = blank(source, /\/\*[\s\S]*?\*\//g);
  if (!isCss) text = blank(text, /(^|[^:])\/\/[^\n]*/g);
  const found: RawColour[] = [];
  const lineOf = (index: number) => text.slice(0, index).split('\n').length;
  const add = (index: number, t: string) => found.push({ line: lineOf(index), text: t });

  for (const m of text.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
    if ([4, 5, 7, 9].includes(m[0].length)) add(m.index ?? 0, m[0]);
  // In code, rgb(...) may be a function of the program's own; only a CSS string counts.
  const fn = isCss
    ? /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g
    : /(?<=["'`][^"'`\n]*)\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;
  for (const m of text.matchAll(fn)) add(m.index ?? 0, m[0]);

  if (isCss) {
    // Words in a declaration's value, except where a word is not a colour (font names, content).
    for (const d of text.matchAll(/([\w-]+)\s*:\s*([^;{}]*)/g)) {
      if (
        /^(font|font-family|content|src|unicode-range|animation-name|grid-area|counter-.*)$/.test(
          d[1] ?? '',
        )
      )
        continue;
      for (const w of (d[2] ?? '').matchAll(/(?<![\w-])[a-z]+(?![\w-])(?!\()/gi))
        if (named.has(w[0].toLowerCase())) add((d.index ?? 0) + d[0].indexOf(w[0]), w[0]);
    }
  } else {
    // Code: look only inside string and template literals, and only where they hold style.
    const wordRe = /(?<![\w-])[a-z]+(?![\w-])(?!\()/gi;
    const flagWords = (value: string, at: number) => {
      for (const w of value.matchAll(wordRe))
        if (named.has(w[0].toLowerCase())) add(at + (w.index ?? 0), w[0]);
    };
    const styleKey =
      /(?:color|background\w*|border\w*|outline\w*|fill|stroke|\w*shadow|\w*gradient|filter|caret\w*|textDecoration\w*|style)["']?\s*[:=]\s*\{?\s*$/i;
    for (const lit of text.matchAll(/(["'`])((?:\\[\s\S]|(?!\1)[^\\])*)\1/g)) {
      const value = lit[2] ?? '';
      const start = (lit.index ?? 0) + 1;
      const before = text.slice(Math.max(0, (lit.index ?? 0) - 60), lit.index ?? 0);
      if (
        styleKey.test(before) ||
        (/gradient\(|[\w-]+\s*:[^;{}]+(?:;|\})/.test(value) &&
          /color|background|border|outline|fill|stroke|shadow|gradient/i.test(value))
      ) {
        // A CSS-looking string: `1px solid red`, `linear-gradient(red, blue)`, `.x{color:red}`, `color: white`.
        // Only the value side of each declaration counts, never a property name.
        const decl = /(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]*)/g;
        if (/[\w-]+\s*:/.test(value) && /[;{}:]/.test(value) && !styleKey.test(before)) {
          for (const d of value.matchAll(decl)) {
            const vstart = start + (d.index ?? 0) + d[0].lastIndexOf(d[2] ?? '');
            flagWords(d[2] ?? '', vstart);
          }
        } else flagWords(value, start);
      }
    }
  }
  return found;
}
