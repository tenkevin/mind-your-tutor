import { Anonymiser } from '@ideamap/ai/anonymise';

// The student device's anonymous layer (D26, A7). One Anonymiser per browser tab: it
// blurs names, places, contact details and school identifiers before any text is sent
// and fills the labels back into replies. The label-to-name mapping lives only in this
// object's memory: it is never written to storage, sent or logged, and is dropped on
// sign-out (`clearPrivacyLayer`) or when the page goes away.

let layer = new Anonymiser();

export function privacyLayer(): Anonymiser {
  return layer;
}

/** Drop the mapping; call on sign-out. */
export function clearPrivacyLayer(): void {
  layer.clear();
  layer = new Anonymiser();
}

if (typeof addEventListener === 'function') {
  addEventListener('pagehide', clearPrivacyLayer);
}

/** The short note students can read about it (A7-U1). */
export const NAMES_STAY_NOTE =
  'Names stay on your device. Before your message is sent, names, places and contact details are swapped for labels, and swapped back when you read the answer.';
