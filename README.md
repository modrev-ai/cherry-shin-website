# cherrystudio.art

A full-screen reel feed that mirrors Cherry Shin's posts from several social platforms into one place.

**Live:** https://cherrystudio.art · **Hosting:** Vercel (`modrev` team) · **Deploys:** automatically on push to `main`

---

## Current status

| Platform | State | Needs |
| --- | --- | --- |
| YouTube | **Live** | already configured |
| Instagram | **Live** | already configured |
| Facebook | **Live** | like and comment counts need `pages_read_user_content` (MRO-248) |
| TikTok | Built, sample content | `TIKTOK_POST_URLS` for oEmbed, or `TIKTOK_CLIENT_*` for the Display API |

Any platform without credentials falls back to sample content for that platform only, so the feed
never breaks because a platform is unconfigured. A sample is labelled `Sample` on the card and
carries no engagement counts and no date - it asserts only a platform, a title and a picture.

The test is whether a platform is *configured*, not whether it returned anything. A connected
platform that answers with nothing this minute shows nothing, rather than reverting to invented
posts published under its own name.

## How it behaves

One post fills the screen at a time. Scrolling snaps to the next rather than scrolling the page,
and the video for whichever post is on screen plays automatically. Autoplay is **muted** — a
browser will not start unmuted playback without a click, which is why Instagram and TikTok behave
the same way. Sound is available through the player controls, or by opening the post at source.

Posts are interleaved so consecutive slides come from different platforms. Portrait video fills
the frame; landscape video gets a wider frame sized to the window, and can be hidden entirely with
the toggle in the right-hand controls. That preference is remembered per browser.

## Architecture

```
Browser ──▶ Vercel edge ──▶ /api/* ──▶ Express app ──▶ cache ──▶ platform APIs
   │            (CDN)                  (one implementation,   (in-memory)
   │                                    two entry points)
   └──▶ static build from dist/
```

The same Express app serves both environments, so local and production cannot drift:

- **Locally** `server/index.js` binds a port; Vite proxies `/api` to it.
- **In production** `api/index.js` imports that app and Vercel invokes it per request.
  `vercel.json` rewrites every `/api/*` path to it.

### Caching is what makes this affordable

`server/cache.js` decouples visitor count from upstream API calls. Without it every page load
would hit the platform APIs directly and a few hundred visitors would exhaust a rate limit.

- **TTL** — a fresh entry is served without touching upstream (default 10 minutes, `CACHE_TTL_MS`).
- **Coalescing** — a burst arriving on an expired entry produces one upstream call, not one per caller.
- **Stale-on-error** — an outage or expired token serves the last good copy rather than an error.
- **Failure backoff** — a broken upstream is not retried on every request, including from a cold start.
- **Fill budget** — at most 40 fills per upstream per 10 minutes, so a caller inventing cache keys
  cannot spend the day's quota. A refused fill serves a stale copy where there is one.

Measured: 200 concurrent callers produced a single upstream call.

### There are two caches, and `X-Cache` describes the wrong one

Responses set `Cache-Control: public, max-age=600`, so **Vercel's edge caches them too**. When the
edge replays a response it replays the whole response — including the `X-Cache` header the app set
when it originally filled. A request served entirely from the edge, touching no server and no
upstream, still reports `X-Cache: MISS`.

That header describes the fill it came from, not the request you just made. Reading it the other
way cost an afternoon during MRO-285: ten consecutive `MISS` responses and an all-zero
`/api/cache/stats` look exactly like the in-memory cache having stopped working. The tells are
`X-Vercel-Cache: HIT` and a climbing `Age`. To see what the app's own cache is doing, defeat the
edge with a parameter the app ignores (`?cb=<random>`) — new URL to the edge, same key to the app.

**Caveat on serverless.** Our cache lives in memory, so on Vercel it lasts only for the life of an
instance, and a cold start begins empty. That is real, but the edge in front absorbs most repeat
traffic, so it matters less than the caveat alone suggests. A shared cache (Vercel KV) is the fix
if traffic grows.

### Layout

```
src/
  App.jsx                     owns the wide-post toggle, persists it to localStorage
  components/
    HeroSection.jsx           first slide; audience stats and the scroll cue
    EndlessReels.jsx          feed, infinite scroll, error and retry states
    MediaCard.jsx             one slide: media, inline player, caption, watch button
    MediaActions.jsx          right-hand rail: view/like/comment readouts, and copy-link
    ReelNav.jsx               fixed controls: previous, next, wide-post toggle, home
    PlatformIcon.jsx          per-platform badge
  constants/platforms.js      platform labels and orientation resolution
  hooks/useInfiniteScroll.js  IntersectionObserver that triggers the next page
  services/mediaApi.js        walks each platform by cursor into one interleaved stream
server/
  index.js                    Express app and all routes; exports the app
  cache.js                    TTL cache with coalescing and stale-on-error
api/index.js                  Vercel entry point; delegates to the Express app
```

### API routes

| Route | Purpose |
| --- | --- |
| `GET /api/youtube/videos?limit=&after=` | uploads, with Shorts detected so portrait video is not letterboxed |
| `GET /api/instagram/media?limit=&after=` | recent media |
| `GET /api/facebook/posts?limit=&after=` | Page posts, with embeddability probed per post |
| `GET /api/tiktok/posts?limit=` | oEmbed for the configured post URLs; no cursor, the list is fixed |
| `GET /api/instagram/status` | token validity — **local only**, 404 in production |
| `GET /api/stats` | audience totals aggregated across configured platforms |
| `GET /api/cache/stats` | hit rate and upstream call counts — **local only**, 404 in production |

`after` is the cursor from the previous response's `paging.next`; its absence means the platform
has nothing more. Every platform is normalised to that one shape.

`instagram/status` and `cache/stats` are operator diagnostics rather than feed endpoints, and
they are **served only when the server is run directly**. In production the app is imported by
`api/index.js`, so both return 404. Neither is called by the frontend.

They were public until MRO-303. Two different problems: the cache view answered "is my
cache-busting landing, and is the fill budget spent" to anyone who asked — the feedback loop for
the quota attack bounded in MRO-285 — and `instagram/status` calls Meta on every request without
going through the cache at all, so neither the TTL nor the fill budget applied to it.

Gated on the environment rather than a shared secret, so there is no fourth credential to keep in
three places, and no gate that fails open the day a variable is unset. Little is lost: cache state
is per-instance, so the production numbers only ever described whichever instance answered, and a
cold one reported all zeros. The honest per-request view is still public in the `X-Cache`,
`X-Vercel-Cache` and `Age` headers.

`limit` is clamped to 1–50 and `after` is validated by charset and length (400 otherwise). Both
values form part of the cache key, and a key that misses is a real upstream call — unclamped, a
loop over `?limit=` could exhaust the YouTube daily quota. See
[docs/feed-and-caching.md](docs/feed-and-caching.md).

Responses carry `X-Cache: HIT | MISS | STALE` and an `Age` header — but read the caching section
above before trusting `X-Cache` on production.

---

## Documentation

| Document | Covers |
| --- | --- |
| [docs/feed-and-caching.md](docs/feed-and-caching.md) | How a page of the feed is assembled, the two cache layers and why `X-Cache` misleads, the quota guardrails, why no media byte is served from our origin, and which test holds which claim |
| [docs/platform-credentials.md](docs/platform-credentials.md) | Every platform's setup, what each variable is for, where secrets live and how to rotate them |

## Local development

```bash
npm install                 # also installs the git hooks
npm run dev                 # frontend on http://localhost:5173

cd server && npm install
npm start                   # API on http://localhost:3001
```

The frontend calls a relative `/api`, which Vite proxies to the API port. Nothing needs a hardcoded
localhost URL, which is what previously broke the deployed build.

### Environment

Copy `server/.env.example` to `server/.env`. Everything is optional; an unset platform falls back
to sample content.

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | YouTube Data API v3 key |
| `YOUTUBE_CHANNEL_ID` | channel to mirror |
| `IG_ACCESS_TOKEN` | Instagram Graph API token |
| `IG_USER_ID` | Instagram account id — **required with the token, not optional** |
| `TIKTOK_POST_URLS` | TikTok post URLs to mirror (oEmbed route), comma/space/newline separated |
| `TIKTOK_CLIENT_KEY` | TikTok Display API client key |
| `TIKTOK_CLIENT_SECRET` | TikTok Display API client secret |
| `TIKTOK_REFRESH_TOKEN` | TikTok refresh token from the one-off OAuth |
| `FB_PAGE_ID` | Facebook Page id |
| `FB_PAGE_ACCESS_TOKEN` | Facebook **Page** access token, not a user token |
| `CACHE_TTL_MS` | cache freshness window, default 600000 |
| `PORT` | API port, default 3001 |
| `YT_API_BASE`, `IG_API_BASE`, `FB_API_BASE`, `TIKTOK_API_BASE`, `TIKTOK_OEMBED_BASE` | override upstream base URLs, for testing |

`server/.env` is gitignored. In production these live in Vercel's environment variables.

---

## Connecting a platform

> Full step-by-step for every platform — including the Meta console URLs, the order permissions
> must be added in, and where secrets live — is in
> [docs/platform-credentials.md](docs/platform-credentials.md). The summaries below cover what
> each platform needs and why.

### YouTube — done

Google Cloud Console → enable **YouTube Data API v3** → create an API key → restrict it to that
API. Channel id comes from YouTube Studio → Settings → Channel → Advanced.

Uses `playlistItems.list` (1 quota unit) rather than `search.list` (100), plus one `videos.list`
for view and like counts. About **288 units a day** against a 10,000 free allowance, independent
of traffic.

Shorts are detected by requesting `youtube.com/shorts/{id}`: YouTube serves it for a Short and
redirects for anything else. The API exposes no aspect ratio — `player.embedHtml` reports 480x270
for every video, and duration is ambiguous because Shorts may run to three minutes.

### Instagram — done

The Instagram Basic Display API was **shut down in December 2024**. This uses the Instagram Graph
API instead.

Prerequisites that catch people out:

1. The account must be **Business or Creator**, not personal.
2. It must be **linked to a Facebook Page**.

Then: Meta Developers → create a Business-type app → add the Instagram product → link the Page →
Graph API Explorer → generate a token with `instagram_basic`, `pages_show_list` and
`pages_read_engagement` → exchange it for a long-lived token.

Set **both** `IG_ACCESS_TOKEN` and `IG_USER_ID`. Setting one alone counts as unconfigured,
deliberately, so a half-finished setup fails loudly rather than querying the wrong account.

**The token does not need refreshing.** The 60-day expiry applies to a long-lived *user* token; what
the site runs on is a **Page** token derived from one, and that does not expire. It stays valid
until the password changes or the app's permissions are revoked.

Reels return no `media_url` and every embed variant renders the full Instagram chrome, so an
Instagram card shows the still and a watch button rather than an inline player.

### Facebook — done

Live. Both `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` are required — setting one alone counts as
unconfigured, deliberately, so a half-finished setup fails loudly rather than querying the wrong
thing. It shares the Meta app and the token with Instagram.

Use the **same Meta app as Instagram**, so do both in one sitting. You must be an admin of the
Page. Grant `pages_read_engagement` and `pages_show_list`, then generate a **Page** access token,
not a user token — this is the step people usually get wrong.

Notes on what it returns:

- Posts with no image are filtered out; they would render as an empty card in a media feed.
- Videos embed through `plugins/video.php` and other posts through `plugins/post.php`. Page posts
  have no direct media URL to embed.
- Orientation comes from the attachment's image dimensions.
- The Page's follower count feeds the hero totals alongside YouTube's.
- **Like and comment counts are missing.** They need `pages_read_user_content`, which the token does
  not carry, and requesting them without it fails the whole request rather than those fields — so
  the server asks once, falls back, and remembers. Granting the scope restores them with no code
  change. Tracked in MRO-248.

### TikTok — built, needs post URLs

Implemented via TikTok's **public oEmbed endpoint**: no credentials, no OAuth, no app review. Set
`TIKTOK_POST_URLS` to the posts you want mirrored, separated by commas, spaces or newlines:

```
TIKTOK_POST_URLS=https://www.tiktok.com/@itscherryshin/video/123, https://www.tiktok.com/@itscherryshin/video/456
```

The Display API would discover posts automatically, but it needs a full OAuth flow plus app
review, and works only with the developer's own account until it passes. oEmbed resolves one post
at a time, which is why the list is explicit — the cost is adding a URL when Cherry posts.

Two things it does not give you:

- **No engagement figures and no publish date.** Those fields are left unset rather than invented,
  so TikTok cards show no counts and no date.
- **No automatic discovery.** New posts do not appear until their URL is added.

A post that cannot be resolved — deleted, private, mistyped — is skipped and logged, costing one
card rather than the whole feed. The embed uses `tiktok.com/embed/v2/{id}`, since the HTML oEmbed
returns is a blockquote plus TikTok's widget script and will not load in the feed's iframe player.

### X — dropped

Reading a user timeline needs paid API credits, and the decision (MRO-242) was to **drop the
platform rather than pay for it or leave placeholder posts on a live brand site indefinitely**.
X is gone from the feed, the platform table and the icon set — not left as a disabled tile.

The `twitter:` meta tags in `index.html` stay. Those are Twitter Card tags, which control how a
shared link previews across several services, and are unrelated to the dropped integration.

> Every path above needs admin access to the account being mirrored. There is no compliant way to
> mirror someone else's posts without it; scraping would breach all of these platforms' terms.

---

## Deployment

Vercel, `modrev` team, project `cherry-shin-website`. Pushes to `main` deploy automatically.

- Static build from `dist/`, plus one serverless function for `/api/*`.
- Environment variables live in Vercel → Settings → Environment Variables.
- Stable fallback URL: `cherry-shin-website.vercel.app`. Per-deployment URLs change each time.

### DNS

Registrar is Namecheap. The apex uses an A record and `www` a CNAME:

| Type | Host | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com.` |

**Leave the `google._domainkey` TXT record alone** — it is DKIM for email and unrelated to hosting.

The TLS certificate must cover both the apex and `www`. It was initially issued for the apex only,
which left `www` serving a mismatched certificate and failing every handshake.

### Plan constraints worth knowing

The Vercel team is on the **Hobby** plan, which restricts commercial use. The repo is public
because Hobby does not support Git integration for a private organisation repo — that restriction
also left several builds stuck in a `BLOCKED` state with no logs.

How much the commercial-use clause actually bites is narrower than it sounds: Vercel's own fair-use
examples are taking payment from visitors and carrying advertisements, and this site does neither.
What remains is a broad clause about financial gain by anyone involved in producing the project,
which is a judgement rather than a bright line.

The two ways out are not equivalent, and the difference is DNS rather than money:

| | Cost | What moves |
| --- | --- | --- |
| **Vercel Pro** | $20 per developer seat/month | Nothing. No DNS change, no certificate re-issue |
| **Cloudflare Pages** | Free, and no non-commercial restriction | The **whole zone**. The site is served at the apex, and an apex custom domain requires the domain to be a Cloudflare zone — so every record is re-created, `google._domainkey` included |

So it was $20/month against a mandatory nameserver migration whose first casualty, done
carelessly, is email signing.

**Decided (MRO-243): stay on Hobby.** The commercial-use exposure is accepted deliberately rather
than left as an unexamined default — the concrete fair-use examples are taking payment and carrying
advertisements, and this site does neither. What remains is the broad financial-gain clause, which
is a judgement.

Two consequences follow and are worth stating rather than rediscovering. **The repo stays public**,
because Hobby does not support Git integration for a private organisation repo — so nothing secret
may ever be committed, which is what `scripts/scan-secrets.mjs` and the pre-commit hook enforce.
And **builds can still land in `BLOCKED` with no logs**; that is this plan's failure mode, not a
new fault. Revisit if the site ever takes payment or carries advertising, which is the line the
fair-use examples actually draw.

## CI and hooks

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: install, lint, build,
install the server's dependencies, syntax-check them, scan for credentials, then run the tests.

Lint uses `lint:ci`, which adds `--deny-warnings`. Plain `oxlint` exits 0 on warnings, so wiring
`npm run lint` into CI would have produced a check that never failed.

`.githooks/pre-commit` refuses to commit staged content carrying a credential. The repo is public,
so a secret that lands in a commit is scraped within minutes and cannot be unpublished — rotation
is the only remedy afterwards. `npm run scan:secrets` runs the same check by hand.

`.githooks/pre-push` runs lint, build and the full test suite before a push.

`.githooks/prepare-commit-msg` records **which agent session** ran `git commit`, as a
`Claude-Session:` trailer. Several Claude sessions run on this machine and all commit as the same
git identity, so without it `git log` cannot say which one made a change — and a session auditing
work cannot establish the work was not its own. `Co-Authored-By: Claude Opus 5` does not help: it
names the *model*, identical across every session, so it is a present-but-useless field.

The value is **scoped, not the raw identifier**. The harness exports the session UUID into every
child process; this repo is public and a published commit cannot be unpublished, so the id is
hashed and only `cs-` plus eight hex digits is written — stable within a session, distinct between
sessions, not reversible. Set `CLAUDE_SESSION_TRAILER` to override with an explicit value.

It writes **nothing** when no session id is present, because a person's commit is not a session's.
It never overwrites an existing trailer, so cherry-picking or amending a peer's commit keeps naming
whoever did the work — and it leaves merge and squash messages alone. Decided on MRO-346; the
limits are on MRO-320, chiefly that the trailer records who ran `git commit`, not whose work it is.

Both are speed bumps rather than gates: bypassable with `--no-verify`, and only active where
`npm install` has been run. CI is the backstop. Branch protection would be the real gate but needs
a paid GitHub plan.

`npm test` runs twelve frameworkless suites — three at the root (the commit trailer, the secret
scanner, the client-side feed walk) and nine under `server/`. Each is plain `node` against a
hand-rolled `check(name, ok, detail)`, so there is nothing to install and any one of them runs on
its own.

**There are deliberately no component tests, and that is a decision rather than an omission.** The
behavioural half of the feed — the walk, cursors, cycling, failure backoff, sample rules — lives in
`src/services/mediaApi.js` and has a suite. What is left in `src/components/` is layout and one or
two conditionals, and layout is what a DOM assertion tests worst: it can confirm a class is present,
not that anything is legible or reachable. The guarantees in that layer that have actually caught
bugs were caught by **measuring the rendered page** — tap targets at 375×812 (MRO-280), eager
versus lazy card loading (MRO-268) — and no virtual DOM would have found either. A harness would
cost three dependencies and a second test idiom alongside the suites above, and buy assertions on
conditionals that are verifiable by reading them. Costed and decided on MRO-311.

If a component ever grows a genuinely behavioural decision — a retry, a state machine, an ordering
rule — move that logic into a plain module and give it a plain suite, the way `params.js`,
`diagnostics.js`, `tiktok.js`, `credentials.js` and `stats.js` were. That path needs no dependency
and no new convention.

## Known gaps

- **TikTok shows sample content.** It is built and needs only `TIKTOK_POST_URLS` (MRO-240);
  its cards are labelled `Sample`. X is no longer listed here at all — it was dropped rather
  than left permanently sampled (MRO-242).
- **Facebook shows no like or comment counts.** Those fields need `pages_read_user_content`, which
  the Page token does not carry; requesting them without it fails the whole request, so the server
  falls back once and remembers.
- **Our cache is per-instance** on serverless, so cold starts re-fetch. Vercel's edge cache in
  front of it absorbs most repeat traffic; `X-Cache` on a production response describes the fill it
  came from, not the request being served.
- **Every card ever scrolled past stays mounted** (MRO-268). Releasing far-offscreen cards needs a
  browser that composites, to watch scroll position while testing it.

## Licence

MIT
