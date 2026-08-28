# How a page of the feed is assembled, and what stops it costing money

Two subjects that turn out to be one: the feed is a walk over paginated upstreams, and almost
every design decision in it exists because those upstreams are metered.

---

## The feed is a stream, not a pool

`src/services/mediaApi.js` keeps a single growing `stream` and serves page N from
`stream[6N .. 6N+5]`. It is not a fixed pool sliced by modulo arithmetic, and the difference
matters: cursors are opaque and cannot be jumped to, so the position in the walk has to be
remembered rather than derived from the page number.

```
fetchMixedMedia(page)
   │
   ├─ page already served? ── yes ─▶ return it   (pages are memoised; a repeat never re-walks)
   │
   └─ no ─▶ queue ─▶ servePage(page)
                        │
                        └─ while stream is shorter than (page+1) × 6:
                               extendStream()
```

`extendStream()` does one of two things:

1. **Fetch a batch** from every platform that still has a cursor, interleave it, append it.
2. **Cycle**, once every catalogue is exhausted — append another ordering of everything
   collected so far, seeded by the cycle number so the ordering is stable across the pages
   sliced out of it.

### Why the shuffle is seeded

An unseeded `Math.random()` reshuffled the ordering on every call, so page offsets pointed into
unrelated permutations: some posts appeared twice, others never. `mulberry32(cycles)` fixes the
ordering for the whole cycle being sliced.

### Why a post never lands on two consecutive slides

Once the catalogue runs out the feed has to repeat — there is nothing else to show — but a post
appearing directly after itself reads as a stutter rather than a loop. `appendToStream` swaps the
first two items of an incoming batch when the first would duplicate the current tail.

This is easy to write a test that never exercises. The first version used a full catalogue,
reached a cycle boundary about twice in a run, and passed just as happily with the swap deleted.
It now runs against a four-item pool so a boundary occurs every four items.

### What a platform contributes when it is unhappy

| State | Contributes | Cursor |
| --- | --- | --- |
| Answered with posts | the posts | advances to `paging.next` |
| Answered, nothing more | nothing | retired (`null`) |
| **Not configured** | its sample content, **once** | retired |
| **Configured but failing** | **nothing** | kept, so the batch is retried; retired after 3 consecutive failures |
| Timed out (6s) | nothing this batch | kept |

The fourth row is the one worth defending. A configured platform that is merely having a bad
minute must not fall back to samples, because that publishes invented posts under a real
account's name during an outage. Falling back is for "no credentials", never for "no answer".

The 6-second timeout exists because a cold Facebook was measured at 20s — it probes
embeddability once per post and no API field reports it — while the other three answer in 1–3s.
The abort is client-side only: the server finishes the work and caches it, so the platform
rejoins on the next extension with its batch already warm.

---

## There are two caches, and only one of them is ours

```
Browser ──▶ Vercel edge ──▶ Express app ──▶ server/cache.js ──▶ platform APIs
              (CDN)                            (in-memory)
```

**This is the single most misleading thing about the system**, so it is worth stating flatly:

Responses set `Cache-Control: public, max-age=600`, so Vercel's edge caches them. When the edge
replays a response it replays the **whole** response, including the `X-Cache` header the app set
when it originally filled. So a request served entirely from the edge, touching no server and no
upstream, still reports `X-Cache: MISS`.

That header describes the fill it came from, not the request you just made.

Reading it the other way costs an afternoon. During MRO-285 ten consecutive requests reported
`X-Cache: MISS` and `/api/cache/stats` read all zeros, which looks exactly like the in-memory
cache having been defeated by serverless statelessness. It had not been. The tells:

| Signal | Means |
| --- | --- |
| `X-Vercel-Cache: HIT` | the edge served it; no server ran |
| `Age` climbing across requests | the edge is replaying one stored response |
| `X-Cache` | the state of the *fill*, which may be long past |

To see what the app's own cache is doing, defeat the edge with a query parameter the app ignores
(`?cb=<random>`) — the URL is new to the edge but resolves to the same app cache key. Measured
that way, the app cache returned `X-Cache: HIT` on 5 of 5 requests.

### What `server/cache.js` does

| Mechanism | Purpose |
| --- | --- |
| TTL (10 min) | a fresh entry is served without touching upstream |
| Coalescing | a burst on an expired entry produces one upstream call, not one per caller |
| Stale-on-error | an outage or expired token serves the last good copy rather than an error |
| Failure backoff | a broken upstream is not retried on every request |
| Entry cap (500) | oldest-first eviction, so the store cannot grow without bound |
| **Fill budget** | at most 40 fills per upstream per 10 minutes |

Cache state is a module-level `Map`, so it belongs to one process. A serverless platform runs
several and starts each cold. That is a real limitation — but the edge in front absorbs most
repeat traffic, which is why it matters less in practice than the caveat alone suggests.

---

## Why any of this needs guarding

Both caller-supplied parameters end up in the cache key:

```js
`yt:videos:${limit}:${after || 'first'}`
```

A key that misses is a real upstream call. The YouTube free tier is 10,000 units a day and a fill
costs 2, so an unvalidated `limit` meant roughly five thousand requests — a trivial loop — could
take the feed dark until quota reset. Verified before the fix: five different `limit` values
produced five misses at both cache layers, and `?limit=999999` was served rather than refused.

`server/params.js` now bounds both:

| Input | Result |
| --- | --- |
| `?limit=999999`, `?limit=1e9` | 50 (the most any of these APIs returns in one page) |
| `?limit=-1`, `?limit=0`, `?limit=1.9` | 1 |
| `?limit=abc`, `?limit=` (empty) | 12, the default |
| `?after=` with a space, quote, newline, or over 512 chars | **400**, never forwarded |

The clamp is what removes the cheap attack: an unbounded key space becomes at most 50 values.

The budget is defence in depth for what the clamp cannot reach — a caller varying `after` within
the accepted charset. Being per-process it multiplies by however many instances are warm, so it
**bounds abuse rather than guaranteeing the quota**. Said plainly because the opposite is easy to
assume.

Note also that a structurally valid but bogus cursor is still forwarded and still costs a fill.
Nothing but the upstream can say whether a cursor is real, and asking is the call we are trying
to avoid.

---

## Which tests hold which claim

Run everything with `npm test` at the repo root.

| Suite | Holds |
| --- | --- |
| `src/services/mediaApi.test.mjs` | the walk: page shape, cursor advance, failure backoff, sample rules, cycling without stutter, serialisation |
| `server/test/cache.test.mjs` | TTL, coalescing, stale-on-error, backoff, the 500-entry cap, the fill budget |
| `server/test/params.test.mjs` | the clamp and cursor rejection table above |
| `scripts/scan-secrets.test.mjs` | that the credential scanner catches real shapes and stays quiet on placeholders |

The feed suite pins one regression by name: an `AbortError` raised inside `response.json()`
rather than by `fetch` used to escape and empty the entire feed, which served zero cards in
production. Reintroducing that failure turns the suite red.

---

## What this document does not cover

- **Platform setup and credentials** — see [platform-credentials.md](platform-credentials.md).
- **Rendering**: scroll-snap, autoplay, the landscape toggle. That is in the README.
- **Windowing.** Every card ever scrolled past stays mounted (MRO-268). Releasing far-offscreen
  cards is unimplemented, because it needs a browser that composites in order to watch the scroll
  position while testing it.
- **Anything about the edge cache's own eviction.** Its behaviour here is observed, not
  configured, and this document only claims what was measured from outside.
