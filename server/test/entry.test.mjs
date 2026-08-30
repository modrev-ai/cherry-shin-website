// Run with: node server/test/entry.test.mjs
//
// The PRODUCTION entry point. Everything else in this repo tests `server/index.js`
// -- either as pure modules, or via `app.listen(0)` in routes.test.mjs. Production
// does neither: Vercel imports `api/index.js` and invokes its `handler`, which
// restores the original path and then calls `app(req, res)`. Those eleven lines
// carry every /api/* request and nothing touched them (MRO-387).
//
// This lives in server/test/ rather than beside the code it tests, deliberately:
// Vercel treats files under api/ as deployable functions, so `api/index.test.mjs`
// would ship as an endpoint.
//
// `http.createServer(handler)` rather than a hand-rolled req/res. The ticket's
// criterion said "no listen", meaning do not test app.listen INSTEAD of handler
// -- but mocking IncomingMessage well enough for Express is a fixture that can
// pass for the wrong reason, and the thing under test here is `handler`, which
// this genuinely invokes with real request objects. Amended on the ticket rather
// than quietly reinterpreted.

import { createServer } from 'node:http';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const realWarn = console.warn;
const realError = console.error;
console.warn = () => {};
console.error = () => {};

// Same hermeticity guard as routes.test.mjs, and load-bearing for the same
// reason: server/index.js calls dotenv.config() at import and a developer
// machine has a real server/.env beside it. Set before the import below.
for (const key of [
    'IG_ACCESS_TOKEN', 'IG_USER_ID', 'YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID',
    'FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN', 'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN', 'TIKTOK_POST_URLS',
    'ALLOWED_ORIGINS',
]) process.env[key] = '';

const { default: handler } = await import('../../api/index.js');

const server = createServer(handler);
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;

// Never assume the body is JSON. A route that does not match returns Express's
// default 404 page, which is HTML -- and calling res.json() on it throws an
// unhandled SyntaxError that kills the process mid-suite. That is not a
// theoretical tidiness point: the first version of this file did exactly that,
// and under mutation it DETECTED the defect by dying rather than by failing.
// A suite that crashes names nothing, and a crash is indistinguishable from a
// broken test file -- so the mutation came back "invalid" instead of "killed".
async function get(path, headers = {}) {
    const res = await fetch(`${base}${path}`, { headers });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* an HTML 404, say */ }
    return { status: res.status, body, text };
}

// 1. The ordinary path: already /api/..., no header. Must reach the routes.
{
    const { status, body, text } = await get('/api/tiktok/posts?limit=2');
    check('an /api/ request with no header reaches the routes',
        status === 200 && body?.configured === false,
        `${status} ${(JSON.stringify(body) ?? text).slice(0, 90)}`);
}

// 2. The restoration. This is what the file exists for: a request that arrived
//    rewritten, with the original path in the header.
{
    const { status, body, text } = await get('/', {
        'x-vercel-original-path': '/api/tiktok/posts?limit=2',
    });
    check('a rewritten request is restored from x-vercel-original-path',
        status === 200 && body?.configured === false,
        `${status} ${(JSON.stringify(body) ?? text).slice(0, 90)}`);
}

// 3. The GUARD, and the case with no other coverage anywhere. The condition is
//    `!req.url.startsWith('/api/')` so a correct URL is never clobbered by a
//    stale header. Nothing stated that before this line.
{
    const { status, body, text } = await get('/api/tiktok/posts?limit=2', {
        'x-vercel-original-path': '/api/youtube/videos?limit=2',
    });
    check('a correct /api/ url is NOT overwritten by a stale header',
        status === 200 && typeof body?.error === 'string' && /TikTok/.test(body.error),
        `${status} ${(JSON.stringify(body) ?? text).slice(0, 110)}`);
}

// 4. The honest failure: rewritten, no header to restore from. It must 404
//    rather than being coerced into something that happens to route.
{
    const { status } = await get('/');
    check('a rewritten request with no header 404s rather than guessing',
        status === 404, `got ${status}`);
}

// closeAllConnections() first, and NO process.exit(). Without both this aborted
// on Windows -- UV_HANDLE_CLOSING -- AFTER printing "all passing", exiting 127.
// The log said green and the exit code said dead; npm test chains on && so this
// link would have failed the run while its own output looked clean. fetch keeps
// sockets in a pool and exiting on top of them is what trips it.
server.closeAllConnections?.();
await new Promise(resolve => server.close(resolve));
console.warn = realWarn;
console.error = realError;
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exitCode = fail.length ? 1 : 0;
