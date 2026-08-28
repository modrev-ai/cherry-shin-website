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
const DEFAULT_MAX_STALE_MS = 24 * 60 * 60 * 1000; // serve stale for up to a day
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

const stats = {
    hits: 0,
    misses: 0,
    coalesced: 0,
    upstreamCalls: 0,
    upstreamErrors: 0,
    staleServes: 0,
    suppressedRetries: 0,
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
    } = options;

    const entry = store.get(key);
    if (entry && Date.now() < entry.expiresAt) {
        stats.hits++;
        return describe(entry, ttlMs, 'store');
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

    const refresh = (async () => {
        try {
            stats.upstreamCalls++;
            const value = await producer();
            const now = Date.now();
            store.set(key, { value, storedAt: now, expiresAt: now + ttlMs, maxStaleMs });
            failures.delete(key);
            return { value, state: 'fresh', source: 'upstream', ageMs: 0 };
        } catch (error) {
            stats.upstreamErrors++;

            const stale = store.get(key);
            if (stale && Date.now() - stale.storedAt <= maxStaleMs) {
                // Hold off on hammering a failing upstream, but keep serving.
                stale.expiresAt = Date.now() + errorBackoffMs;
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
    failures.clear();
}
