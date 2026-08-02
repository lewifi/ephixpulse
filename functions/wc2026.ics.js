// The WC2026 calendar feed is retired. It was advertised as a webcal subscription
// (see wc2026.html), so subscribers' calendar apps still poll this URL on a schedule.
//
// The catch-all ("any 404 -> root") was serving the homepage with HTTP 200 here, and
// to a calendar client 200 = "feed is fine, keep polling" — which is why deleting the
// file never stopped the traffic. This Function matches /wc2026.ics explicitly (so it
// wins over the catch-all) and returns 410 Gone: the one status that tells a calendar
// client the feed is permanently gone, so compliant clients stop refreshing and drop
// the subscription. (200 = keep polling; 404 = temporarily missing, also retried.)
//
// The edge can cache the 410, so the long tail of stubborn clients costs ~nothing.
export function onRequest() {
  return new Response(
    '410 Gone — the FIFA World Cup 2026 calendar feed has been retired.\n',
    {
      status: 410,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    }
  );
}
