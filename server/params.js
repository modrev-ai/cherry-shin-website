// Validation for the two caller-supplied values on every media route.
//
// Both of them end up in the cache key, and a cache key that misses costs a
// real upstream call against a metered quota. So an unvalidated parameter is
// not a tidiness problem: `?limit=N` for arbitrary N is an unbounded set of
// keys, each one a fill, and the YouTube free tier is 10,000 units a day at
// 2 units per fill. Roughly five thousand requests takes the feed dark until
// quota reset. Clamping collapses that set to one value.

// The most any of these APIs returns in a single page. Asking for more is
// either a mistake or an attempt to mint a new cache key.
export const MAX_LIMIT = 50;
export const DEFAULT_LIMIT = 12;

export function readLimit(raw) {
    // Number('') is 0, not NaN, so an empty `?limit=` would otherwise clamp to
    // 1 and quietly serve one post per page instead of meaning "no opinion".
    if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
    const n = Number(raw);
    // Covers undefined, '', 'abc', NaN, Infinity, and an array from a repeated
    // ?limit=, all of which should simply mean "no opinion".
    if (!Number.isFinite(n)) return DEFAULT_LIMIT;
    return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(n)));
}

// Cursors are opaque to us, but they are not arbitrary: every platform issues
// URL-safe base64 with a little punctuation. Anything outside that was not
// issued by an upstream we talk to, so passing it on would only mint another
// key and another fill.
const CURSOR = /^[A-Za-z0-9_\-=.%|~]{1,512}$/;

// Returns { ok: false } rather than throwing, so the caller decides the status
// code. An absent cursor is valid and means the first page.
export function readAfter(raw) {
    if (raw === undefined || raw === null || raw === '') return { ok: true, value: null };
    if (typeof raw !== 'string') return { ok: false };
    if (!CURSOR.test(raw)) return { ok: false };
    return { ok: true, value: raw };
}
