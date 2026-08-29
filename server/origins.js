// Who may read this API from a browser, and why the answer is "nobody" by default.
//
// THE POINT (MRO-342): the site fetches `/api` as a RELATIVE path, so its own
// requests are same-origin and need no CORS header at all. `app.use(cors())`
// with no options sent `Access-Control-Allow-Origin: *` on every response,
// which grants access to precisely the callers the site does not have.
//
// That is not a data leak - these routes return posts that are already public.
// It is a question of who spends the quota. The clamp, the TTL, the coalescing
// and the 40-fill budget all exist because the upstreams are metered, and a
// wildcard invites any page to spend that budget from its visitors' browsers.
// When the budget trips, the degraded response goes to Cherry's visitors.
//
// So: default to no cross-origin access, and let a deployment name the origins
// it actually needs. VITE_API_BASE exists so the frontend can be served from a
// different host, and that case is exactly what the allow-list is for.

// Parsed the same way TIKTOK_POST_URLS is - comma, space or newline - because
// a second separator convention in one .env is a trap for whoever edits it.
export function readAllowedOrigins(raw) {
    if (!raw) return [];
    return raw
        .split(/[\s,]+/)
        .map(value => value.trim())
        // An origin is scheme://host[:port] and nothing else. Anything with a
        // path is a misunderstanding that would silently never match, so it is
        // dropped here rather than failing to match at request time.
        .filter(value => /^https?:\/\/[^/]+$/.test(value));
}

// `origin: false` makes the cors package send NO Access-Control-Allow-Origin
// at all, which is what "same-origin only" means on the wire. It is not the
// same as sending the header with a falsy value.
export function corsOptionsFor(raw) {
    const allowed = readAllowedOrigins(raw);
    return allowed.length ? { origin: allowed } : { origin: false };
}
