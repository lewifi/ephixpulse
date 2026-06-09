// /api/og/promo — compact top-5 poster strip for cross-promos (wc2026 CTA).
import { renderOGPromo } from '../og.js';

export async function onRequest(context) {
  return renderOGPromo(context);
}
