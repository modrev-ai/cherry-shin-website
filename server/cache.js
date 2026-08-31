// In-memory response cache.
//
// The point of this layer is to decouple visitor count from upstream API calls.
// Without it, every page load hits the platform API directly, so 1,000 visitors
// means 1,000+ calls and a rate limit. With it, upstream is called once per TTL
// no matter how many people are looking.
//
// Three behaviours matter at that scale:
//
//   TTL          - a fresh entry is served without touching upstream.
//   Coalescing   - when an entry expires, the first caller refreshes it and any
//                  callers arriving mid-flight wait on that same request rather
//                  than each starting their own (a thundering herd on expiry is
//                  exactly what a burst of traffic would cause).
//   Stale-on-error - if upstream fails and we still hold an older copy, serve
//                  the old copy instead of an error. A platform outage or an
//                  expired token then degrades to slightly stale content rather
//                  than a broken feed.

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Serve stale for up to a day. This ceiling is not arbitrary: a cached payload
// holds media URLs signed at fill time, and Meta's are signed for about 105
// hours, so the oldest URL we would ever hand out still has ~81 hours left.
// Keep this BELOW the shortest upstream signature lifetime. Exceeding it fails
// silently - a complete, correct-looking 200 whose image URLs are all dead.
// See docs/feed-and-caching.md, "No media byte is ours" (MRO-317).
//
// "Shortest" is a claim across every platform, and the 105h above is one
// platform's. Measured against production rather than assumed, since a ceiling
// justified on one upstream and applied to all is how a constant goes quietly
// wrong when a platform is added:
//
//   instagram  scontent-*.cdninstagram.com   Meta-signed, ~105h
//   facebook   scontent-*.xx.fbcdn.net       Meta-signed, same family
//   youtube    i.ytimg.com/vi/<id>/*.jpg     NO query string at all - unsigned,
//                                            so it never expires and is not the
//                                            binding constraint
//   tiktok     not configured                contributes no media today
//
// So 24h currently clears every configured platform with room to spare, and the
// binding one is Meta.
//
// TikTok is the gap: its CDN thumbnails DO carry expiry parameters and their
// lifetime has never been measured here, because TIKTOK_POST_URLS has never
// been set in production. Measure it before enabling TikTok media (MRO-247),
// rather than after - this ceiling failing is invisible from the response.
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ERROR_BACKOFF_MS = 30 * 1000; // don't retry a failing upstream per-request
// Ceiling on retained entries. Cursor-keyed pagination makes the key space
// unbounded - every distinct cursor is its own key, and cursors shift as new
// posts are published - so nothing else guarantees the store stops growing.
const MAX_ENTRIES = 500;

const store = new Map();
const inFlight = new Map();
// Remembers a failure when there is no cached copy to fall back on, so a cold
// start against a bad token does not send one upstream call per visitor.
const failures = new Map();

// Clamping `limit` collapses the cheap way to mint cache keys, but a caller can
// still vary `after`, so the number of fills per upstream is capped per window
// too. This bounds abuse; it is not a quota guarantee. Cache state lives in the
// process, and a serverless platform runs several, so the real ceiling is this
// number times however many instances are warm.
//
// 40 per ten minutes sits above what legitimate traffic needs. A cold cache
// plus one reader scrolling to the end of a platform's catalogue is roughly
// twenty fills, and once walked those entries serve everyone else for the rest
// of the TTL.
const BUDGET_WINDOW_MS = 10 * 60 * 1000;
const BUDGET_MAX_FILLS = 40;
const budgets = new Map();

export class BudgetExceededError extends Error {
    constructor(name) {
        super(`Upstream budget spent for ${name}`);
        this.name = 'BudgetExceededError';
        this.budget = name;
    }
}

// Returns false when this window's fills are already spent. Only called on the
// path that is about to hit upstream, so a cache hit or a coalesced wait costs
// nothing against it.
function claimFill(name, now) {
    const current = budgets.get(name);
    if (!current || now - current.windowStart >= BUDGET_WINDOW_MS) {
        budgets.set(name, { windowStart: now, fills: 1 });
        return true;
    }
    if (current.fills >= BUDGET_MAX_FILLS) return false;
    current.fills++;
    return true;
}

const stats = {
    hits: 0,
    misses: 0,
    coalesced: 0,
    upstreamCalls: 0,
    upstreamErrors: 0,
    staleServes: 0,
    suppressedRetries: 0,
    budgetRefusals: 0,
};

// Nothing removed entries before this: they were overwritten or read, never
// deleted. That was survivable when keys were `ig:media:12` and there were a
// handful of them; cursor pagination made the key space unbounded.
//
// Expiry alone is not the right test - stale-on-error deliberately keeps an
// expired copy for up to maxStaleMs so an outage degrades to slightly stale
// content. An entry is only dead once it is older than that.
//
// Runs on a miss, not on every lookup: misses happen about once per TTL per
// key, so the walk costs nothing in practice and a cache hit stays a plain map
// lookup.
function sweep(now) {
    for (const [key, entry] of store) {
        if (now - entry.storedAt > entry.maxStaleMs) store.delete(key);
    }
    for (const [key, failure] of failures) {
        if (now >= failure.until) failures.delete(key);
    }

    // The caller is a miss that is about to insert one entry, so leave room for
    // it - trimming to exactly MAX_ENTRIES here would settle at one over.
    const room = MAX_ENTRIES - 1;
    if (store.size <= room) return;

    // Still over the ceiling. Drop oldest first - they are the closest to being
    // useless for stale-on-error anyway.
    const oldestFirst = [...store.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [key] of oldestFirst.slice(0, store.size - room)) {
        store.delete(key);
    }
}

function describe(entry, ttlMs, source) {
    const ageMs = Date.now() - entry.storedAt;
    return {
        value: entry.value,
        state: ageMs > ttlMs ? 'stale' : 'fresh',
        source, // 'store' | 'upstream' | 'stale' - where this response came from
        ageMs,
    };
}

/**
 * Read through the cache, calling `producer` only when there is no usable entry.
 *
 * @param {string} key
 * @param {() => Promise<any>} producer  fetches fresh data from upstream
 * @param {object} [options]
 * @param {number} [options.ttlMs]        how long an entry counts as fresh
 * @param {number} [options.maxStaleMs]   oldest entry still worth serving on error
 * @param {number} [options.errorBackoffMs] how long to keep serving stale before retrying
 * @returns {Promise<{value: any, state: 'fresh'|'stale', source: 'store'|'upstream'|'stale', ageMs: number}>}
 */
export async function cached(key, producer, options = {}) {
    const {
        ttlMs = DEFAULT_TTL_MS,
        maxStaleMs = DEFAULT_MAX_STALE_MS,
        errorBackoffMs = DEFAULT_ERROR_BACKOFF_MS,
        budget = null,
    } = options;

    const entry = store.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        stats.hits++;
        return describe(entry, ttlMs, 'store');
    }

    // Expired, but upstream failed recently and we are holding off retrying it.
    // This is a stale serve and says so (MRO-410). It used to be reported as an
    // ordinary hit, because the error path below pushed `expiresAt` forward to
    // implement the backoff - so the check above could not tell "still fresh"
    // from "expired, and we are not retrying yet". Those are now separate
    // fields, because one value answering two questions gets read as whichever
    // is more flattering: during an outage every request after the first came
    // back X-Cache: HIT alongside Warning: 110 - Response is stale.
    //
    // Bounded by the entry's OWN maxStaleMs, which is what sweep() deletes on -
    // serving something the sweeper considers dead would be the same disagreement
    // one layer down.
    if (entry && entry.retryAfter && Date.now() < entry.retryAfter
        && Date.now() - entry.storedAt <= entry.maxStaleMs) {
        stats.staleServes++;
        return describe(entry, ttlMs, 'stale');
    }

    // No usable copy and upstream failed recently: fail fast rather than let
    // every caller retry a known-broken upstream.
    const failure = failures.get(key);
    if (failure && Date.now() < failure.until) {
        stats.suppressedRetries++;
        throw failure.error;
    }

    // Someone else is already refreshing this key; wait for their result.
    const pending = inFlight.get(key);
    if (pending) {
        stats.coalesced++;
        return pending;
    }

    stats.misses++;
    sweep(Date.now());

    // Serving a stale copy beats spending a fill we do not have, and beats
    // failing a platform that has perfectly good slightly-old content.
    if (budget && !claimFill(budget, Date.now())) {
        stats.budgetRefusals++;
        const stale = store.get(key);
        if (stale && Date.now() - stale.storedAt <= maxStaleMs) {
            stats.staleServes++;
            return describe(stale, ttlMs, 'stale');
        }
        throw new BudgetExceededError(budget);
    }

    const refresh = (async () => {
        try {
            stats.upstreamCalls++;
            const value = await producer();
            const now = Date.now();
            // A new object, so any previous `retryAfter` is gone: upstream
            // answered, so there is nothing left to back off from.
            store.set(key, { value, storedAt: now, expiresAt: now + ttlMs, maxStaleMs });
            failures.delete(key);
            return { value, state: 'fresh', source: 'upstream', ageMs: 0 };
        } catch (error) {
            stats.upstreamErrors++;

            const stale = store.get(key);
            if (stale && Date.now() - stale.storedAt <= maxStaleMs) {
                // Hold off on hammering a failing upstream, but keep serving.
                // `retryAfter` rather than `expiresAt`: the entry is NOT fresh
                // and must not start reporting itself as a hit (MRO-410).
                stale.retryAfter = Date.now() + errorBackoffMs;
                store.set(key, stale);
                stats.staleServes++;
                return describe(stale, ttlMs, 'stale');
            }

            failures.set(key, { error, until: Date.now() + errorBackoffMs });
            throw error;
        } finally {
            inFlight.delete(key);
        }
    })();

    inFlight.set(key, refresh);
    return refresh;
}

export function getStats() {
    const lookups = stats.hits + stats.misses + stats.coalesced;
    return {
        ...stats,
        lookups,
        hitRate: lookups ? +((stats.hits + stats.coalesced) / lookups).toFixed(3) : 0,
        entries: [...store.entries()].map(([key, entry]) => ({
            key,
            ageMs: Date.now() - entry.storedAt,
            expiresInMs: Math.max(0, entry.expiresAt - Date.now()),
        })),
    };
}

export function clear() {
    store.clear();
    inFlight.clear();
    budgets.clear();
    failures.clear();
}
