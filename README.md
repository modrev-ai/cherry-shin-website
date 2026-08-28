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
| X | Sample content | paid API tier |

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
Browser ──▶ /api/*  ──▶  Express app  ──▶  cache  ──▶  platform APIs
   │                     (one implementation, two entry points)
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

Measured: 200 concurrent callers produced a single upstream call.

**Caveat on serverless.** The cache lives in memory, so on Vercel it lasts only for the life of an
instance. A cold start begins empty and calls upstream again. Still far inside the free quotas at
current traffic, but weaker than the long-lived local process. A shared cache (Vercel KV) is the
fix if traffic grows.

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
| `GET /api/instagram/status` | token validity |
| `GET /api/stats` | audience totals aggregated across configured platforms |
| `GET /api/cache/stats` | hit rate and upstream call counts |

`after` is the cursor from the previous response's `paging.next`; its absence means the platform
has nothing more. Every platform is normalised to that one shape. `GET /api/instagram/media/next`
still exists but is superseded by `/api/instagram/media?after=` and nothing calls it.

Responses carry `X-Cache: HIT | MISS | STALE` and an `Age` header.

---

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

### X — needs a paid tier

Reading a user timeline is not available on the free tier. Options are to pay, leave it on sample
content, or drop it.

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

The Vercel team is on the **Hobby** plan, whose terms prohibit commercial use. The repo is public
because Hobby does not support Git integration for a private organisation repo — that restriction
also left several builds stuck in a `BLOCKED` state with no logs. Upgrading to Pro would allow a
private repo and resolve the commercial-use question; Cloudflare Pages is the free alternative
without either restriction.

## CI and hooks

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`: install, lint, build, then
install the server's dependencies and syntax-check them.

Lint uses `lint:ci`, which adds `--deny-warnings`. Plain `oxlint` exits 0 on warnings, so wiring
`npm run lint` into CI would have produced a check that never failed.

`.githooks/pre-push` runs the same lint and build before a push. It is a speed bump, not a gate:
bypassable with `--no-verify`, and only active where `npm install` has been run. Branch protection
would be the real gate but needs a paid GitHub plan.

## Known gaps

- **TikTok and X show sample content.** TikTok is built and needs only `TIKTOK_POST_URLS`
  (MRO-240); X needs a paid API tier (MRO-242). Both are labelled `Sample` on the card.
- **Facebook shows no like or comment counts.** Those fields need `pages_read_user_content`, which
  the Page token does not carry; requesting them without it fails the whole request, so the server
  falls back once and remembers.
- **Cache is per-instance** on serverless, so cold starts re-fetch.

## Licence

MIT
