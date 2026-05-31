// functions/api/og/[type]/[id].js — neat path route
// Serves /api/og/movie/12345 and /api/og/tv/12345.
// Delegates to renderOG in functions/api/og.js. Keep this file tiny.

import { renderOG } from '../../og.js';

export async function onRequest(context) {
  const { type, id } = context.params;
  return renderOG(context, type, id);
}
