# Handover: All Time Top 100

Written 2026-09-24. Everything below is on `main`, **committed but not pushed**, so
nothing is deployed and nothing is live.

```
b49d2e1  Add an All Time Top 100, by genre and decade
b830fa7  Stop backdrop-filter clipping the logo glow
         main is ahead of origin/main by 2
```

## What it is

A browsable counterpart to the Live Top 100, at `/all-time.html`, for finding something
older rather than something current. Two independent selectors, **genre** and **decade**,
each with an **All**, so it answers four questions with one page: best of a decade, best of
a genre, both together, or best of everything.

The point is not to compete with IMDb's list. The point is that every tile carries the
owner-only download icon, so it doubles as a way to pick something nostalgic and send it
straight to Sonarr and Radarr at home.

## No backend work was needed

`functions/api/tmdb.js` already forwards arbitrary paths and params and caches for 30
minutes, so the whole page is `discover/movie` with the right filters. Nothing was added to
`functions/`, and no new environment variables exist.

## The filter values are measured, not guessed

Every number was tested against the live proxy with curl before being written down. If you
change them, re-test rather than reasoning about it, because TMDB's data is lumpier than it
looks.

**`with_runtime.gte=70`** keeps shorts out. Without it the 1950s list opens with
`Night and Fog`, a 32-minute documentary, and `Duck Amuck`, a seven-minute cartoon. With
it, the same query returns 12 Angry Men, Seven Samurai, Rear Window, Ikiru, Sunset
Boulevard.

**The vote floor has to scale by decade**, because TMDB vote counts skew hard towards
recent releases. A single floor either buries everything pre-1990 or floods the recent
decades with obscurity.

| Query | Floor | Results | Top result |
|---|---|---|---|
| All decades | 500 | 7,976 | Avatar Aang (2026) |
| All decades | 2,000 | 2,801 | Swapped (2026) |
| **All decades** | **5,000** | **1,065** | **The Shawshank Redemption** |
| All decades | 10,000 | 388 | The Shawshank Redemption |
| 1950s | 100 | 492 | Duck Amuck (a cartoon short) |
| **1950s** | **150** | **332** | **12 Angry Men** |
| 1970s | 300 | 398 | Dersu Uzala |
| 1990s | 300 | 1,277 | Saving Private Ryan |
| 2010s | 800 | 2,092 | Parasite |

The "all decades" row is the important one. Below roughly 5,000 votes a film released weeks
ago outranks The Godfather, because early ratings run hot before the average settles. That
is why `minVotes('')` returns 5000 and not something tidier.

**Narrow combinations genuinely run out.** There are no 1950s documentaries with 150 votes.
Rather than dead-ending, the floor steps down through 300, 150, 50, 20 until at least 20
results appear, and the page says it relaxed rather than pretending:

```
Documentary 1950s, floor 150  ->  0 results
Documentary 1950s, floor  50  ->  2   Kon-Tiki, The Mystery of Picasso
Documentary 1950s, floor  20  ->  9
```

Other thin but workable combinations: Western 2010s has 24, War pre-1950 has 9, Sci-Fi
1960s has 36 with 2001 on top, Animation 1990s has 73 with Princess Mononoke on top.

## Decisions worth not reversing

**The glow fix is not what it looks like.** `backdrop-filter` on `header` establishes a
backdrop root, which clips everything painted inside the element to its own box. The logo's
`logo-breathe` text-shadows reach a 180px blur radius against a 64px header, so the bloom
was cut off at the bottom border. `overflow` was already `visible` and was never the cause.
The fix moves background, blur and border to `header::before` at `inset: 0; z-index: -1`,
which keeps the blur and frees the glow. **Verified by removing `backdrop-filter` on the
live page and watching the glow escape**, not by reasoning.

The `max-width: 600px` rule that disables the blur on phones was retargeted from `header`
to `header::before` at the same time. Left alone it would have silently stopped working.

**The link placement is deliberate.** It sits beside the `Live Top 100` heading rather than
in the menu or the footer, because the relationship then needs no explanation: live
hundred, all-time hundred. It is styled small on purpose, a side door rather than a second
headline.

**The page is standalone, not refactored.** It copies the components it needs from
`index.html` rather than extracting shared CSS, because `index.html` is around 7,000 lines
with no component system and it is the file currently earning traffic. The tradeoff is
accepted and known: the card renderer now exists twice and can drift. Extract later if the
page proves worth keeping.

## Not yet verified

**The page has never run.** `/api/tmdb` is a Pages Function that only exists once deployed,
so opening the file locally cannot fetch anything. The data layer is proven, because every
query above was run against the live proxy by hand, but these are unverified:

- Rendering and layout at real widths
- The tab strip scrolling sideways with 18 genres on a phone
- The owner-only download icon appearing, and `/api/add` accepting a film from this page
- Whether the unclipped glow looks right over scrolled content rather than merely correct

`/all-time.html` currently returns 200 on the live site, but that is Pages serving
`index.html` as a fallback for unknown paths. Do not take it as evidence of anything.

## Open questions

- **Push and deploy?** Nothing is live yet.
- **TV as well as films?** `discover/tv` works the same way with `first_air_date`. Films
  only for now because that is the nostalgia case and it avoids the season picker.
- **Extract the shared components** into a CSS file both pages load, once the page has
  earned it.
- The main site's `logo-breathe` runs a 4 second infinite pulse with no
  `prefers-reduced-motion` guard. The new page has one. Worth adding to `index.html` too.
