// A small BERT named-entity model that runs on the device (ARCHITECTURE.md D33, task A7).
// It reads whole sentences, so "sam said hi" and "Maya from Leeds" are found from context
// rather than from word lists. The weights are a 2-layer, 128-wide BERT (about 4.5 MB as
// int8, see scripts/model/export_ner.py) and the forward pass below is plain TypeScript:
// no WASM runtime, no server, no network once the file is loaded. Same input, same output.

export type NerLabel = 'PER' | 'ORG' | 'LOC' | 'MISC';

export interface NerSpan {
  /** Character offsets into the text given to `predict`. */
  start: number;
  end: number;
  label: NerLabel;
}

interface Header {
  config: {
    hidden_size: number;
    num_hidden_layers: number;
    num_attention_heads: number;
    intermediate_size: number;
    max_position_embeddings: number;
    layer_norm_eps: number;
  };
  tensors: {
    name: string;
    shape: number[];
    dtype: 'int8' | 'float32';
    offset: number;
    scaleOffset?: number;
  }[];
  vocab: { offset: number; length: number; count: number };
}

// The CoNLL-2003 tag order the model was trained with (checked against the weights in
// ner-model.test.ts).
const TAGS = [
  'O',
  'B-PER',
  'I-PER',
  'B-ORG',
  'I-ORG',
  'B-LOC',
  'I-LOC',
  'B-MISC',
  'I-MISC',
] as const;

interface Weight {
  rows: number;
  cols: number;
  q: Int8Array;
  scale: Float32Array;
}

const MAGIC = 'IMNER1\0\0';
const MAX_WORDPIECE = 100;
/** Wordpieces per window, leaving room for [CLS] and [SEP]. */
const WINDOW = 254;

function erf(x: number): number {
  // Abramowitz and Stegun 7.1.26, error under 1.5e-7.
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

export class BertNer {
  private readonly cfg: Header['config'];
  private readonly w = new Map<string, Weight>();
  private readonly v = new Map<string, Float32Array>();
  private readonly vocab = new Map<string, number>();
  private readonly dim: number;
  private readonly heads: number;

  private constructor(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    if (new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC)
      throw new Error('Not a model file');
    const view = new DataView(buffer);
    const headerLength = view.getUint32(8, true);
    const header = JSON.parse(
      new TextDecoder().decode(bytes.subarray(12, 12 + headerLength)),
    ) as Header;
    const base = 12 + headerLength;
    this.cfg = header.config;
    this.dim = header.config.hidden_size;
    this.heads = header.config.num_attention_heads;
    for (const t of header.tensors) {
      const at = base + t.offset;
      if (t.dtype === 'int8') {
        const [rows, cols] = t.shape as [number, number];
        this.w.set(t.name, {
          rows,
          cols,
          q: new Int8Array(buffer.slice(at, at + rows * cols)),
          scale: new Float32Array(
            buffer.slice(base + t.scaleOffset!, base + t.scaleOffset! + rows * 4),
          ),
        });
      } else {
        const n = t.shape.reduce((a, b) => a * b, 1);
        this.v.set(t.name, new Float32Array(buffer.slice(at, at + n * 4)));
      }
    }
    const words = new TextDecoder()
      .decode(
        bytes.subarray(
          base + header.vocab.offset,
          base + header.vocab.offset + header.vocab.length,
        ),
      )
      .split('\n');
    words.forEach((word, i) => this.vocab.set(word, i));
  }

  /** Parse a model file (the bytes of `ner-bert-tiny-v1.bin`). */
  static load(buffer: ArrayBuffer): BertNer {
    return new BertNer(buffer);
  }

  private weight(name: string): Weight {
    const found = this.w.get(name);
    if (!found) throw new Error(`Model file is missing ${name}`);
    return found;
  }

  private vector(...names: string[]): Float32Array {
    for (const name of names) {
      const found = this.v.get(name);
      if (found) return found;
    }
    throw new Error(`Model file is missing ${names[0]}`);
  }

  // --- tokenizer: BERT uncased, basic split then greedy wordpiece ---------------------

  private wordpieces(word: string): number[] {
    const norm = word.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
    const chars = [...norm];
    if (chars.length > MAX_WORDPIECE) return [this.vocab.get('[UNK]')!];
    const ids: number[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let found: number | undefined;
      while (start < end) {
        const piece = (start > 0 ? '##' : '') + chars.slice(start, end).join('');
        found = this.vocab.get(piece);
        if (found !== undefined) break;
        end--;
      }
      if (found === undefined) return [this.vocab.get('[UNK]')!];
      ids.push(found);
      start = end;
    }
    return ids;
  }

  /** Words with their character spans: whitespace splits, punctuation stands alone. */
  private static words(text: string): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    let from = -1;
    let i = 0;
    for (const ch of text) {
      const isSpace = /\s/u.test(ch) || /\p{C}/u.test(ch);
      const isPunct = !isSpace && /[!-/:-@[-`{-~]|\p{P}/u.test(ch);
      if (isSpace || isPunct) {
        if (from >= 0) out.push({ start: from, end: i });
        from = -1;
        if (isPunct) out.push({ start: i, end: i + ch.length });
      } else if (from < 0) {
        from = i;
      }
      i += ch.length;
    }
    if (from >= 0) out.push({ start: from, end: i });
    return out;
  }

  // --- forward pass -------------------------------------------------------------------

  private linear(x: Float32Array, n: number, name: string, bias: string): Float32Array {
    const { rows, cols, q, scale } = this.weight(name);
    const b = this.vector(bias);
    const out = new Float32Array(n * rows);
    for (let t = 0; t < n; t++) {
      const xo = t * cols;
      for (let o = 0; o < rows; o++) {
        let sum = 0;
        const wo = o * cols;
        for (let i = 0; i < cols; i++) sum += x[xo + i]! * q[wo + i]!;
        out[t * rows + o] = sum * scale[o]! + b[o]!;
      }
    }
    return out;
  }

  private layerNorm(x: Float32Array, n: number, prefix: string): Float32Array {
    const gamma = this.vector(`${prefix}.weight`, `${prefix}.gamma`);
    const beta = this.vector(`${prefix}.bias`, `${prefix}.beta`);
    const d = this.dim;
    const eps = this.cfg.layer_norm_eps;
    for (let t = 0; t < n; t++) {
      let mean = 0;
      for (let i = 0; i < d; i++) mean += x[t * d + i]!;
      mean /= d;
      let variance = 0;
      for (let i = 0; i < d; i++) variance += (x[t * d + i]! - mean) ** 2;
      variance /= d;
      const inv = 1 / Math.sqrt(variance + eps);
      for (let i = 0; i < d; i++)
        x[t * d + i] = (x[t * d + i]! - mean) * inv * gamma[i]! + beta[i]!;
    }
    return x;
  }

  private embed(ids: number[]): Float32Array {
    const d = this.dim;
    const word = this.weight('bert.embeddings.word_embeddings.weight');
    const pos = this.weight('bert.embeddings.position_embeddings.weight');
    const type = this.weight('bert.embeddings.token_type_embeddings.weight');
    const x = new Float32Array(ids.length * d);
    ids.forEach((id, t) => {
      for (let i = 0; i < d; i++) {
        x[t * d + i] =
          word.q[id * d + i]! * word.scale[id]! +
          pos.q[t * d + i]! * pos.scale[t]! +
          type.q[i]! * type.scale[0]!;
      }
    });
    return this.layerNorm(x, ids.length, 'bert.embeddings.LayerNorm');
  }

  private attention(x: Float32Array, n: number, layer: string): Float32Array {
    const d = this.dim;
    const h = this.heads;
    const hd = d / h;
    const p = `bert.encoder.layer.${layer}.attention`;
    const q = this.linear(x, n, `${p}.self.query.weight`, `${p}.self.query.bias`);
    const k = this.linear(x, n, `${p}.self.key.weight`, `${p}.self.key.bias`);
    const v = this.linear(x, n, `${p}.self.value.weight`, `${p}.self.value.bias`);
    const ctx = new Float32Array(n * d);
    const scores = new Float32Array(n);
    const norm = 1 / Math.sqrt(hd);
    for (let head = 0; head < h; head++) {
      const off = head * hd;
      for (let i = 0; i < n; i++) {
        let max = -Infinity;
        for (let j = 0; j < n; j++) {
          let s = 0;
          for (let c = 0; c < hd; c++) s += q[i * d + off + c]! * k[j * d + off + c]!;
          scores[j] = s * norm;
          if (scores[j]! > max) max = scores[j]!;
        }
        let total = 0;
        for (let j = 0; j < n; j++) {
          scores[j] = Math.exp(scores[j]! - max);
          total += scores[j]!;
        }
        for (let c = 0; c < hd; c++) {
          let s = 0;
          for (let j = 0; j < n; j++) s += scores[j]! * v[j * d + off + c]!;
          ctx[i * d + off + c] = s / total;
        }
      }
    }
    const out = this.linear(ctx, n, `${p}.output.dense.weight`, `${p}.output.dense.bias`);
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + x[i]!;
    return this.layerNorm(out, n, `${p}.output.LayerNorm`);
  }

  private layer(x: Float32Array, n: number, layer: string): Float32Array {
    const a = this.attention(x, n, layer);
    const p = `bert.encoder.layer.${layer}`;
    const mid = this.linear(a, n, `${p}.intermediate.dense.weight`, `${p}.intermediate.dense.bias`);
    for (let i = 0; i < mid.length; i++) {
      const m = mid[i]!;
      mid[i] = 0.5 * m * (1 + erf(m / Math.SQRT2));
    }
    const out = this.linear(mid, n, `${p}.output.dense.weight`, `${p}.output.dense.bias`);
    for (let i = 0; i < out.length; i++) out[i] = out[i]! + a[i]!;
    return this.layerNorm(out, n, `${p}.output.LayerNorm`);
  }

  /** Tag index per wordpiece (including [CLS] and [SEP]) for one window. */
  private tag(ids: number[]): number[] {
    let x = this.embed(ids);
    for (let l = 0; l < this.cfg.num_hidden_layers; l++) x = this.layer(x, ids.length, String(l));
    const logits = this.linear(x, ids.length, 'classifier.weight', 'classifier.bias');
    const labels = this.weight('classifier.weight').rows;
    return ids.map((_, t) => {
      let best = 0;
      for (let c = 1; c < labels; c++)
        if (logits[t * labels + c]! > logits[t * labels + best]!) best = c;
      return best;
    });
  }

  /** People, organisations, places and other names, as character spans of `text`. */
  predict(text: string): NerSpan[] {
    const words = BertNer.words(text);
    const pieces = words.map((w) => this.wordpieces(text.slice(w.start, w.end)));
    const tags: string[] = [];
    // Windows of wordpieces that never split a word.
    let i = 0;
    while (i < words.length) {
      const ids = [this.vocab.get('[CLS]')!];
      const firsts: number[] = [];
      let j = i;
      while (j < words.length && (j === i || ids.length - 1 + pieces[j]!.length <= WINDOW)) {
        firsts.push(ids.length);
        ids.push(...pieces[j]!);
        j++;
      }
      ids.push(this.vocab.get('[SEP]')!);
      const predicted = this.tag(ids);
      for (const at of firsts) tags.push(TAGS[predicted[at]!] ?? 'O');
      i = j;
    }

    const spans: NerSpan[] = [];
    let open: NerSpan | null = null;
    tags.forEach((tag, k) => {
      const word = words[k]!;
      const label = tag.slice(2) as NerLabel;
      if (tag === 'O') {
        open = null;
      } else if (tag.startsWith('I-') && open && open.label === label) {
        open.end = word.end;
      } else {
        open = { start: word.start, end: word.end, label };
        spans.push(open);
      }
    });
    return spans;
  }
}
