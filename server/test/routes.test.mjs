// Run with: node server/test/routes.test.mjs
//
// The only suite that exercises an Express ROUTE rather than a pure module.
//
// It exists because of a measurement (MRO-370): reverting MRO-355's status
// change - the entire server half of it, 200 back to 500 - left all eleven
// other suites green. Every one of them imports a function and calls it, so a
// correct function wired up wrongly passes all of them. That is exactly how
// ff5026e put a ReferenceError into production: upstream.js was right and the
// route was not, and only probing production caught it.

// The app's cache is a module singleton and is NOT re-created per case: the
// ?case=N trick gives a fresh index.js, but its `import ... from './cache.js'`
// resolves to the one shared instance. So a failure cached by one case is
// served to the next under the same key, with no upstream call at all.
//
// That is not hypothetical - it happened here. Case 4's no-cursor request came
// back with case 3's 190 response and `stub calls: 0`, which is why the stub
// counter exists.
import { clear as clearCache } from '../cache.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// The server prints its configuration banner on import; it is noise here.
const realLog = console.log;
const realWarn = console.warn;
const realError = console.error;
const quiet = () => { console.warn = () => {}; console.error = () => {}; };
const loud = () => { console.warn = realWarn; console.error = realError; };

// Every credential the app reads at import time. These are set to '' BEFORE
// importing, and that is load-bearing rather than tidy:
//
//   server/index.js calls dotenv.config() at import, and a developer machine
//   has a real server/.env sitting next to it. dotenv does not overwrite a key
//   already present in process.env - and '' counts as present - so setting them
//   here is what stops real credentials leaking in and making this suite pass
//   or fail depending on whose machine ran it.
//
// Without this the "unconfigured" cases below would be green on CI and red on
// the machine that wrote them, which is worse than having no test.
const CREDENTIAL_KEYS = [
    'IG_ACCESS_TOKEN', 'IG_USER_ID',
    'YOUTUBE_API_KEY', 'YOUTUBE_CHANNEL_ID',
    'FB_PAGE_ID', 'FB_PAGE_ACCESS_TOKEN',
    'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'TIKTOK_REFRESH_TOKEN',
    'TIKTOK_POST_URLS',
    'ALLOWED_ORIGINS',
];

let caseId = 0;

// A fresh module instance per case, because the app reads env into consts at
// import time. Node treats `../index.js?case=2` as a separate module, the same
// trick src/services/mediaApi.test.mjs uses for its singletons.
//
// listen(0) takes an ephemeral port on purpose. A fixed port would collide with
// a dev server and the suite would then be testing whichever process got there
// first - a stale-process reading that looks exactly like a real result.
async function startApp(overrides = {}) {
    clearCache();
    for (const key of CREDENTIAL_KEYS) process.env[key] = '';
    for (const [key, value] of Object.entries(overrides)) process.env[key] = value;

    const { default: app } = await import(`../index.js?case=${++caseId}`);
    const server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    return {
        base: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

const PLATFORM_PATHS = [
    ['TikTok', '/api/tiktok/posts'],
    ['YouTube', '/api/youtube/videos'],
    ['Instagram', '/api/instagram/media'],
    ['Facebook', '/api/facebook/posts'],
];

quiet();

// 1. MRO-355. An unconfigured platform is not a server fault. This is the case
//    whose mutation survived every other suite.
{
    const app = await startApp();
    for (const [label, path] of PLATFORM_PATHS) {
        const res = await fetch(`${app.base}${path}?limit=2`);
        const body = await res.json();
        check(`${label}: unconfigured answers 200, not 5xx`,
            res.status === 200, `got ${res.status}`);
        check(`${label}: and carries configured:false`,
            body.configured === false, JSON.stringify(body).slice(0, 120));
    }
    await app.close();
}

// 2. The positive control for 1, and the one that stops "return 200 always"
//    satisfying this suite: a route that does not exist must still 404.
{
    const app = await startApp();
    const res = await fetch(`${app.base}/api/definitely-not-a-route`);
    check('an unknown route still 404s, so 200 is not universal',
        res.status === 404, `got ${res.status}`);
    await app.close();
}

// A stubbed upstream, installed BEFORE the app makes any request, with a call
// counter. The counter is a positive control on the stub itself: without it a
// case can quietly hit the real Graph API and still go green, because a junk
// token there returns 400/190 - the very shape one of these cases asserts.
// That happened while writing this file and only the counter would have shown it.
function stubUpstream(payload, status = 400) {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async (url, init) => {
        if (String(url).includes('127.0.0.1')) return realFetch(url, init);
        calls += 1;
        return { ok: false, status, json: async () => ({ error: payload }) };
    };
    return {
        realFetch,
        calls: () => calls,
        restore: () => { globalThis.fetch = realFetch; },
    };
}

// 3. MRO-357, wired. describeUpstreamFailure is unit-tested; that it is CALLED,
//    and that classifyUpstream's status reaches res.status(), was covered by
//    nothing. Meta answers 400 with code 190 for a dead token - measured against
//    the Graph API - so that is the shape stubbed here. No network.
{
    const stub = stubUpstream({ message: 'Invalid OAuth access token', code: 190, type: 'OAuthException' });
    const app = await startApp({ FB_PAGE_ID: '123456789', FB_PAGE_ACCESS_TOKEN: 'EAAjunktokennotreal' });

    const res = await stub.realFetch(`${app.base}/api/facebook/posts?limit=2`);
    const body = await res.json();

    check('the stub was actually used, not the real Graph API',
        stub.calls() > 0, `stub calls: ${stub.calls()}`);
    check('a dead token answers 502, not 400 — the auth branch is wired',
        res.status === 502, `got ${res.status}: ${JSON.stringify(body).slice(0, 140)}`);
    check('and upstream’s code is passed through',
        body.code === 190, JSON.stringify(body).slice(0, 140));
    check('the hint names the token',
        typeof body.hint === 'string' && /token/i.test(body.hint), String(body.hint));

    stub.restore();
    await app.close();
}

// 4. The sentCursor WIRING, which case 3 cannot reach: under kind 'auth' the
//    token hint comes back whatever sentCursor says. Only a REJECTED failure
//    has a hint that depends on it, so this is the case that fails if the route
//    stops passing the request through.
//
//    An assertion about cursors sat in case 3 before this existed. It was
//    vacuous - hardcoding sentCursor to true survived it - and mutation testing
//    is what found that. Code 100 is Meta's bad-cursor code and is deliberately
//    not in AUTH_CODES.
{
    const stub = stubUpstream({ message: '(#100) Invalid cursor', code: 100 });
    const app = await startApp({ FB_PAGE_ID: '123456789', FB_PAGE_ACCESS_TOKEN: 'EAAjunktokennotreal' });

    const without = await stub.realFetch(`${app.base}/api/facebook/posts?limit=2`);
    const noCursor = await without.json();

    check('the stub was used for the no-cursor request',
        stub.calls() > 0, `stub calls: ${stub.calls()}`);
    check('a refused request is 400, not 502',
        without.status === 400, `got ${without.status}: ${JSON.stringify(noCursor).slice(0, 140)}`);
    check('no ?after= was sent, so there is no hint about ?after=',
        !('hint' in noCursor), JSON.stringify(noCursor).slice(0, 160));
    check('and upstream’s own message still reaches the caller',
        /Invalid cursor/.test(String(noCursor.message)), JSON.stringify(noCursor).slice(0, 160));

    const withCursor = await stub.realFetch(`${app.base}/api/facebook/posts?limit=2&after=notarealcursor`);
    const cursorBody = await withCursor.json();
    check('a cursor WAS sent, so the cursor hint comes back — MRO-338 intact',
        withCursor.status === 400 && /after=/.test(String(cursorBody.hint)),
        `${withCursor.status} ${JSON.stringify(cursorBody).slice(0, 160)}`);

    stub.restore();
    await app.close();
}

// 5. The display_name scope fallback. `tiktokStats` had no coverage at all, and
//    the path most worth covering is the one that only runs when something is
//    wrong: a token without `user.info.basic` fails the WHOLE user/info request,
//    and tiktokStats returning null is skipped by summariseStats WITHOUT counting
//    as a failure — so a refusal would delete TikTok from /api/stats silently.
//
//    A sequenced stub rather than stubUpstream's fixed one, because the whole
//    claim is that the SECOND call differs from the first. The url log is the
//    positive control: asserting `followers === 12` alone would pass if the
//    retry never happened and the first call had simply succeeded.
{
    const seen = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        const href = String(url);
        if (href.includes('127.0.0.1')) return realFetch(url, init);
        seen.push(href);

        if (href.includes('/oauth/token/')) {
            return { ok: true, status: 200, json: async () => ({ access_token: 'stub-access', expires_in: 86400 }) };
        }
        // The refusal: a request carrying display_name comes back with no user.
        if (href.includes('display_name')) {
            return { ok: false, status: 401, json: async () => ({ error: { code: 'scope_not_authorized', message: 'stubbed refusal' } }) };
        }
        return {
            ok: true, status: 200,
            json: async () => ({ data: { user: { follower_count: 12, video_count: 3, likes_count: 40 } }, error: { code: 'ok' } }),
        };
    };

    const app = await startApp({
        TIKTOK_CLIENT_KEY: 'ttkey', TIKTOK_CLIENT_SECRET: 'ttsecret', TIKTOK_REFRESH_TOKEN: 'ttrefresh',
    });
    const body = await (await realFetch(`${app.base}/api/stats`)).json();

    const infoCalls = seen.filter(u => u.includes('/user/info/'));
    check('the retry actually fired — two user/info calls, not one',
        infoCalls.length === 2, `calls: ${JSON.stringify(infoCalls)}`);
    check('the first asked for display_name and the second did not',
        infoCalls.length === 2 && infoCalls[0].includes('display_name') && !infoCalls[1].includes('display_name'),
        JSON.stringify(infoCalls));
    check('the counts survived the refusal — TikTok is still in /api/stats',
        body.platforms?.tiktok?.followers === 12, JSON.stringify(body.platforms || {}).slice(0, 160));
    check('and TikTok did not silently vanish from connected',
        Array.isArray(body.connected) && body.connected.includes('tiktok'), JSON.stringify(body.connected));

    globalThis.fetch = realFetch;
    await app.close();
}

// 6. The ordinary success path, which case 5 never reaches (MRO-402).
//
//    Case 5 covers the branch that only runs when something is wrong. The path
//    that runs EVERY time in normal operation had no coverage at all, so the
//    function read as tested while the production path was not.
//
//    Two requests with the cache cleared between them, because three of the four
//    claims here are about state that persists ACROSS calls: the once-per-process
//    log, and `tiktokNameAllowed` staying true when nothing was refused. A single
//    request cannot distinguish "logs once" from "logs every time".
{
    const seen = [];
    const warned = [];
    const realFetch = globalThis.fetch;
    console.warn = (msg) => { warned.push(String(msg)); };

    globalThis.fetch = async (url, init) => {
        const href = String(url);
        if (href.includes('127.0.0.1')) return realFetch(url, init);
        seen.push(href);
        if (href.includes('/oauth/token/')) {
            return { ok: true, status: 200, json: async () => ({ access_token: 'stub-access', expires_in: 86400 }) };
        }
        // Everything succeeds. No refusal anywhere, which is the whole point.
        return {
            ok: true, status: 200,
            json: async () => ({
                data: { user: { display_name: 'itscherryshin', follower_count: 12, video_count: 3, likes_count: 40 } },
            }),
        };
    };

    const app = await startApp({
        TIKTOK_CLIENT_KEY: 'ttkey', TIKTOK_CLIENT_SECRET: 'ttsecret', TIKTOK_REFRESH_TOKEN: 'ttrefresh',
    });

    const first = await (await realFetch(`${app.base}/api/stats`)).json();
    const afterFirst = seen.filter(u => u.includes('/user/info/'));

    // Cleared so the second request re-runs tiktokStats rather than being served
    // the memoised answer -- otherwise the cross-call claims below test nothing.
    clearCache();
    await realFetch(`${app.base}/api/stats`);
    const infoCalls = seen.filter(u => u.includes('/user/info/'));
    const connectedLines = warned.filter(m => m.includes('connected as'));

    check('counts map onto the right fields',
        first.platforms?.tiktok?.followers === 12 && first.platforms?.tiktok?.posts === 3,
        JSON.stringify(first.platforms?.tiktok));
    check('a successful call is not retried — exactly one user/info request',
        afterFirst.length === 1, `calls: ${JSON.stringify(afterFirst)}`);
    check('nothing was refused, so the second request still asks for display_name',
        infoCalls.length === 2 && infoCalls[1].includes('display_name'),
        JSON.stringify(infoCalls));
    check('the connected-as line is logged once per process, not per request',
        connectedLines.length === 1, `${connectedLines.length}: ${JSON.stringify(connectedLines)}`);

    console.warn = () => {};
    globalThis.fetch = realFetch;
    await app.close();
}

loud();
console.log = realLog;
console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
