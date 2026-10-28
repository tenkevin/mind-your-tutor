import { Anonymiser } from '@ideamap/ai/anonymise';
import { lazyModelRecognizer, type NerModelSource } from '@ideamap/ai/device';

// The student device's anonymous layer (D26, D33, A7). One Anonymiser per browser tab. An
// on-device ML NER model (a 4.5 MB int8 BERT, loaded the first time it is needed and kept
// in the browser cache) finds names and places from sentence context; pattern rules catch
// contact details, addresses and school identifiers. No class roster is ever on the device,
// and if no model can be loaded the layer fails closed (nothing is sent), never falling back
// to word lists.
// The label-to-name mapping lives only in this object's memory: it is never written to
// storage, sent or logged, and is dropped on sign-out (`clearPrivacyLayer`) or when the
// page goes away.

const MODEL_URL = new URL('../../../packages/ai/models/ner-bert-tiny-v1.bin', import.meta.url).href;
const CACHE = 'ideamap-ner-v1';

/** The model file, from the browser cache after the first visit. */
export async function loadModel(url = MODEL_URL): Promise<ArrayBuffer> {
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return await hit.arrayBuffer();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model ${res.status}`);
    await cache.put(url, res.clone()).catch(() => {});
    return await res.arrayBuffer();
  } catch {
    // No Cache API (private window, old browser): fetch it plainly.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`model ${res.status}`);
    return res.arrayBuffer();
  }
}

/**
 * The on-device models, tried in order (D33). One today; add an entry to give the device a
 * second model to switch to when the first can't be loaded. If none loads the layer fails
 * closed: nothing is sent and the student sees PRIVACY_UNAVAILABLE_MESSAGE.
 */
export const NER_MODELS: readonly NerModelSource[] = [
  { id: 'bert-tiny-conll-v1', load: () => loadModel(MODEL_URL) },
];

/** Shown when no model can be loaded: plain and calm, with nothing for the student to fix. */
export const PRIVACY_UNAVAILABLE_MESSAGE =
  "Your device can't hide names just yet, so your message wasn't sent. Check your connection and try again in a moment.";

function newLayer(): Anonymiser {
  return new Anonymiser({ recognizer: lazyModelRecognizer(NER_MODELS) });
}

let layer = newLayer();

export function privacyLayer(): Anonymiser {
  return layer;
}

/** Drop the mapping; call on sign-out. */
export function clearPrivacyLayer(): void {
  layer.clear();
  layer = newLayer();
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', clearPrivacyLayer);
}

/** The short note students can read about it (A7-U1). */
export const NAMES_STAY_NOTE =
  'Names stay on your device. Before your message is sent, names, places and contact details are swapped for labels, and swapped back when you read the answer.';
