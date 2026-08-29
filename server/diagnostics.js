// Whether the operator diagnostics are served, and the guard that enforces it.
//
// `/api/cache/stats` and `/api/instagram/status` were reachable by anyone. Two
// separate problems, and the second is the worse one:
//
// The cache view answered "is my cache-busting landing, and is the fill budget
// spent yet" — the feedback loop for the quota attack bounded in MRO-285. It
// creates no new capability; it removes the attacker's uncertainty, which is
// worth something to them and nothing to us in public. Dropping the key list
// alone would not have fixed it, because `upstreamCalls`, `hitRate` and
// `budgetRefusals` are the scoreboard.
//
// The Instagram status route makes an uncached call to Meta on every request.
// It does not go through the cache, so the TTL, the coalescing and the fill
// budget do not apply to it at all — an unauthenticated caller could spend
// Meta's rate limit in a loop, which is the same class of hole MRO-285 closed
// for the media routes and was left open here.
//
// Gated on the environment rather than a shared secret, deliberately. A secret
// would be a fourth credential to keep in `.env`, Vercel and the vault, on a
// project whose open credential work is about having too many already — and a
// gate that reads a variable fails open the day the variable is unset.
//
// Nothing useful is lost, because the production figures were never meaningful.
// Cache state lives in one process, so a serverless instance reports only
// itself and a cold one reports all zeros — a reading that says "the cache is
// broken" and "no traffic has reached this instance" with the same output. It
// very nearly became a bug report. The honest per-request view is still public
// and still correct in the `X-Cache`, `X-Vercel-Cache` and `Age` headers.

import { resolve } from 'path';

// Served only when this module's own file is the process entry point, which
// means a local development server. Vercel imports the app instead, so the
// entry point is the serverless handler and this is false there — the platform
// flag is belt and braces on top of that, not the only check.
export function diagnosticsEnabled({ entryPoint, moduleFile, isServerless }) {
    if (isServerless) return false;
    if (!entryPoint || !moduleFile) return false;
    return resolve(entryPoint) === resolve(moduleFile);
}

// 404 rather than 401 or 403: a refusal that names the thing it is refusing
// confirms the route exists, which is most of what the endpoint was leaking.
export function diagnosticsGuard(enabled) {
    return function guard(req, res, next) {
        if (!enabled) return res.status(404).json({ error: 'Not found' });
        return next();
    };
}
