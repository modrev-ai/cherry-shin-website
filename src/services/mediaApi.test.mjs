// Run with: node src/services/mediaApi.test.mjs
//
// No framework, matching server/test/cache.test.mjs - one file, nothing to
// install. `fetch` is stubbed per case, so nothing here touches the network.
//
// The feed keeps its state in module-level singletons (`feed`, `queue`) with no
// reset, which is correct for the browser and awkward for a test. Rather than
// adding a resetFeed() export that only tests would call, each case imports the
// module under a unique specifier - node treats `./mediaApi.js?case=3` as a
// separate module and gives back a clean instance.

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// The module warns on every unavailable platform, which is the point of most of
// these cases and would otherwise bury the results.
const realWarn = console.warn;
console.warn = () => {};

let caseId = 0;

// A response shaped like the parts of fetch's Response that the module reads.
const respond = ({ status = 200, body = {}, jsonThrows = null }) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
        if (jsonThrows) throw jsonThrows;
        return body;
    },
});

const ok = (items, next = null) =>
    respond({ body: { data: items, paging: next ? { next } : {} } });

// The server's own error shape: JSON with an `error` key. `configured: false`
// means no credentials; anything else means set up but not answering.
const errored = (error, configured = true) =>
    respond({ status: 500, body: { error, configured } });

const posts = (platform, n, tag = '') =>
    Array.from({ length: n }, (_, i) => ({
        id: `${platform}-${tag}${i}`,
        platform,
        title: `${platform} post ${tag}${i}`,
        thumbnail: 'https://example.test/t.jpg',
        url: 'https://example.test/p',
    }));

const PATHS = {
    instagram: '/instagram/media',
    youtube: '/youtube/videos',
    tiktok: '/tiktok/posts',
    facebook: '/facebook/posts',
};

// Installs a fetch stub and returns a fresh copy of the module plus the call
// log. `routes` maps a platform path to (url, nthCallToThisPath) -> Response.
async function load(routes) {
    const calls = [];
    globalThis.fetch = async (url) => {
        calls.push(url);
        const path = url.slice('/api'.length).split('?')[0];
        const handler = routes[path];
        const nth = calls.filter(c => c.startsWith(`/api${path}?`)).length;
        if (!handler) throw new Error(`unrouted request: ${url}`);
        return handler(url, nth);
    };
    const mod = await import(`./mediaApi.js?case=${++caseId}`);
    return { mod, calls, forPath: p => calls.filter(c => c.startsWith(`/api${p}?`)) };
}

// Every platform answers with `n` posts and no cursor, unless overridden.
const allPlatforms = (n, overrides = {}) => {
    const routes = {};
    for (const [key, path] of Object.entries(PATHS)) {
        routes[path] = overrides[key] || (() => ok(posts(key, n)));
    }
    return routes;
};

const idsOf = page => page.map(i => i.id);

// 1. A page is exactly ITEMS_PER_PAGE items, and consecutive pages do not
//    overlap. Page N is stream[6N..6N+5], so an off-by-one here repeats or
//    skips posts - the failure the seeded PRNG was introduced to fix.
{
    const { mod } = await load(allPlatforms(25));
    const page0 = await mod.fetchMixedMedia(0);
    const page1 = await mod.fetchMixedMedia(1);
    check('page 0 holds exactly 6 items', page0.length === 6, `got ${page0.length}`);
    check('page 1 holds exactly 6 items', page1.length === 6, `got ${page1.length}`);
    const overlap = idsOf(page0).filter(id => idsOf(page1).includes(id));
    check('pages 0 and 1 share no posts', overlap.length === 0, `shared ${overlap.join(', ')}`);
    check('every item carries a cycleId', page0.every(i => typeof i.cycleId === 'string'));
}

// 2. A repeated call for the same page returns the same items rather than
//    walking again.
{
    const { mod, calls } = await load(allPlatforms(25));
    const first = await mod.fetchMixedMedia(0);
    const before = calls.length;
    const second = await mod.fetchMixedMedia(0);
    check('a repeated page is served from cache',
        calls.length === before && idsOf(first).join() === idsOf(second).join());
}

// 3. A cursor handed back by a platform is sent as `after` on the next batch.
//    Cursors are opaque and cannot be derived from the page number, so losing
//    one silently restarts that platform's catalogue.
{
    const routes = allPlatforms(1);
    for (const [key, path] of Object.entries(PATHS)) {
        routes[path] = (url, nth) =>
            nth === 1 ? ok(posts(key, 1, 'a'), `CURSOR-${key}`) : ok(posts(key, 1, 'b'));
    }
    const { mod, forPath } = await load(routes);
    await mod.fetchMixedMedia(1); // needs 12 items; one batch yields 4 + 4 samples
    const second = forPath(PATHS.instagram)[1];
    check('the returned cursor is sent back as `after`',
        Boolean(second) && second.includes('after=CURSOR-instagram'),
        `second request was ${second}`);
}

// 4. A configured platform that errors keeps its cursor and is retried, then is
//    dropped after MAX_PLATFORM_FAILURES so a dead platform is not asked on
//    every extension for the rest of the session.
{
    const routes = allPlatforms(1, { instagram: () => errored('upstream exploded') });
    const { mod, forPath } = await load(routes);
    for (let page = 0; page <= 4; page++) await mod.fetchMixedMedia(page);
    const tries = forPath(PATHS.instagram).length;
    check('a failing platform is retried, then dropped after 3 batches',
        tries === 3, `asked ${tries} times`);
}

// 5. A platform with no credentials stands in with samples exactly once, and is
//    not asked again.
{
    const routes = allPlatforms(1, {
        instagram: () => errored('Instagram not configured', false),
    });
    const { mod, forPath } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 3; page++) seen.push(...await mod.fetchMixedMedia(page));

    const samples = new Set(seen.filter(i => i.platform === 'instagram').map(i => i.id));
    check('an unconfigured platform contributes its samples',
        samples.size > 0 && [...samples].every(id => id.startsWith('ig')),
        `saw ${[...samples].join(', ')}`);
    check('an unconfigured platform is asked only once',
        forPath(PATHS.instagram).length === 1,
        `asked ${forPath(PATHS.instagram).length} times`);
}

// 6. A configured platform that is merely failing contributes nothing at all.
//    Falling back to samples here would publish invented posts under a real
//    account during an outage, which is worse than showing fewer posts.
{
    const routes = allPlatforms(1, { instagram: () => errored('upstream exploded') });
    const { mod } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 3; page++) seen.push(...await mod.fetchMixedMedia(page));
    const invented = seen.filter(i => i.platform === 'instagram');
    check('a failing platform never falls back to samples',
        invented.length === 0, `leaked ${invented.map(i => i.id).join(', ')}`);
}

// 7. MRO-270, pinned. The timeout can land anywhere in the exchange: aborting
//    while the body is still being read rejects json(), not fetch. Catching
//    only around fetch let that AbortError escape, and the caller reads any
//    unrecognised error as "no more content" - which served zero cards in
//    production. This case fails if that fix is reverted.
{
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    const routes = allPlatforms(25, {
        instagram: () => respond({ status: 200, jsonThrows: abort }),
    });
    const { mod } = await load(routes);
    const page0 = await mod.fetchMixedMedia(0);
    check('a timeout inside json() costs one platform, not the feed',
        page0.length === 6, `got ${page0.length} items`);
    check('the aborted platform contributes nothing',
        page0.every(i => i.platform !== 'instagram'));
}

// 8. The same abort arriving from fetch itself is handled identically.
{
    const abort = new Error('timed out');
    abort.name = 'TimeoutError';
    const routes = allPlatforms(25, { instagram: () => { throw abort; } });
    const { mod } = await load(routes);
    const page0 = await mod.fetchMixedMedia(0);
    check('a timeout on the request itself costs one platform',
        page0.length === 6, `got ${page0.length} items`);
}

// 9. A response that is not our JSON error shape means nothing is answering
//    behind the proxy, which has to surface rather than quietly show samples.
{
    const routes = allPlatforms(25, {
        instagram: () => respond({ status: 502, jsonThrows: new SyntaxError('not json') }),
    });
    const { mod } = await load(routes);
    let raised = null;
    try { await mod.fetchMixedMedia(0); } catch (err) { raised = err; }
    check('a dead backend surfaces as BackendUnreachableError',
        raised instanceof mod.BackendUnreachableError, `got ${raised}`);
}

// 10. Once the catalogue is exhausted the feed repeats - there is nothing else
//     to show - but a post must never land on two consecutive slides.
//
//     The pool has to be small for this to be worth asserting. It holds just
//     Facebook's four samples - Facebook UNCONFIGURED so it stands in, every
//     other platform down - so the feed reaches a cycle boundary, the seam
//     where a post can land on top of itself, every four items rather than
//     every hundred. The first version of this case used a full catalogue,
//     reached a boundary about twice, and passed just as happily with the
//     anti-stutter swap deleted.
//
//     That four-item pool used to come from X's samples, which were injected
//     unconditionally. X was dropped (MRO-242), so the fixture is rebuilt from
//     an unconfigured Facebook - same size, same boundary frequency, same
//     discriminating power. Without this substitution the case would still
//     pass and would no longer be able to fail.
//
//     In the green direction this is exact: with the swap in place no stutter
//     is possible at all. In the red direction a boundary collision is a 1-in-4
//     event, and 37 boundaries put the chance of missing a broken swap at about
//     three in a hundred thousand.
{
    const routes = {};
    for (const path of Object.values(PATHS)) routes[path] = () => errored('down');
    routes[PATHS.facebook] = () => errored('down', false);
    const { mod } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 24; page++) seen.push(...await mod.fetchMixedMedia(page));
    const stutters = seen.filter((item, i) => i > 0 && seen[i - 1].id === item.id);
    check('a cycling feed never repeats a post back to back',
        stutters.length === 0, `${stutters.length} stutter(s): ${stutters.map(s => s.id).join(', ')}`);
    check('cycling keeps serving full pages', seen.length === 150, `got ${seen.length}`);
}

// 11. The same, with a full catalogue, so the ordinary path is covered too.
{
    const { mod } = await load(allPlatforms(1));
    const seen = [];
    for (let page = 0; page <= 5; page++) seen.push(...await mod.fetchMixedMedia(page));
    const stutters = seen.filter((item, i) => i > 0 && seen[i - 1].id === item.id);
    check('a full catalogue cycles without a stutter either',
        stutters.length === 0, `${stutters.length} stutter(s)`);
    check('a full catalogue keeps serving full pages', seen.length === 36, `got ${seen.length}`);
}

// 12. React StrictMode double-invokes effects and a retry can land mid-fetch,
//     so concurrent callers must not both extend and append the same batch.
{
    const { mod } = await load(allPlatforms(25));
    const [a, b, again] = await Promise.all([
        mod.fetchMixedMedia(0),
        mod.fetchMixedMedia(1),
        mod.fetchMixedMedia(0),
    ]);
    check('concurrent calls for one page agree',
        idsOf(a).join() === idsOf(again).join());
    const overlap = idsOf(a).filter(id => idsOf(b).includes(id));
    check('concurrent calls for different pages do not overlap',
        overlap.length === 0, `shared ${overlap.join(', ')}`);
}

// 13. A total outage must reach the UI as an ERROR, never as an empty page,
//     because EndlessReels reads a zero-length page as "you have reached the
//     end" and stops the scroll sentinel.
//
//     This used to hold by accident: X had no integration, so its samples were
//     pushed unconditionally and the pool was never empty. Dropping X (MRO-242)
//     removed that prop, so the assertion is now on the behaviour itself rather
//     than on the sample content that happened to guarantee it.
{
    const routes = {};
    for (const path of Object.values(PATHS)) routes[path] = () => errored('down');
    const { mod } = await load(routes);
    let raised = null, returned = null;
    try { returned = await mod.fetchMixedMedia(0); } catch (err) { raised = err; }
    check('every configured platform failing raises rather than returning an empty page',
        raised instanceof mod.BackendUnreachableError,
        `raised ${raised && raised.name}, returned ${returned && returned.length} items`);
    check('and specifically does NOT return [], which would render as end-of-feed',
        returned === null, `returned ${JSON.stringify(returned)}`);
}

// 13b. The positive control for 13: an UNCONFIGURED platform is not an outage.
//      It stands in with samples, so the feed still serves a page. Without this
//      the module could raise on everything and satisfy 13 completely.
{
    const routes = {};
    for (const path of Object.values(PATHS)) routes[path] = () => errored('down', false);
    const { mod } = await load(routes);
    let raised = null, page0 = null;
    try { page0 = await mod.fetchMixedMedia(0); } catch (err) { raised = err; }
    check('unconfigured platforms still serve samples rather than raising',
        raised === null && Array.isArray(page0) && page0.length > 0,
        `raised ${raised && raised.name}, got ${page0 && page0.length} items`);
}

// MRO-355. A platform with no credentials now answers a plain 200 carrying the
// flag, because that condition is not a server fault and a permanent 5xx floor
// makes a real outage unreadable. The status changed; the meaning did not.
const unconfigured200 = error =>
    respond({ status: 200, body: { configured: false, error } });

// 14. The new shape has to behave exactly as the old one did: samples, once.
{
    const routes = allPlatforms(1, {
        instagram: () => unconfigured200('Instagram not configured'),
    });
    const { mod, forPath } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 3; page++) seen.push(...await mod.fetchMixedMedia(page));

    const samples = new Set(seen.filter(i => i.platform === 'instagram').map(i => i.id));
    check('a 200 carrying configured:false still contributes samples',
        samples.size > 0 && [...samples].every(id => id.startsWith('ig')),
        `saw ${[...samples].join(', ')}`);
    check('and is still asked only once',
        forPath(PATHS.instagram).length === 1,
        `asked ${forPath(PATHS.instagram).length} times`);
}

// 15. The positive control for 14, and the one that matters most. Reading the
//     flag on the ok path must not swallow the ordinary path: a healthy 200
//     with posts still has to deliver them. Without this, returning
//     configured:false unconditionally would satisfy 14 perfectly.
{
    const { mod } = await load(allPlatforms(25));
    const page0 = await mod.fetchMixedMedia(0);
    // Live fixtures are `<platform>-<n>`; every sample id is short - tt1, yt2,
    // ig1, fb1. Matching the live shape explicitly is what gives this case
    // teeth. An earlier version excluded only 'ig-sample' and so counted the
    // other three platforms' samples as live, which meant it passed whatever
    // the code did - it killed no mutation at all.
    const live = page0.filter(i => /^(instagram|youtube|tiktok|facebook)-[0-9]+$/.test(String(i.id)));
    check('a healthy 200 still delivers its live posts, not samples',
        page0.length === 6 && live.length === 6,
        `got ${page0.length} items, ${live.length} live: ${idsOf(page0).join(', ')}`);
}

// 16. A CONFIGURED platform answering 200 with nothing is not the same thing and
//     must not get samples. This is the line the flag draws: absent credentials
//     stand in, an empty real answer does not - inventing posts under a live
//     account is the failure MRO-317 and case 6 exist to prevent.
{
    const routes = allPlatforms(1, {
        instagram: () => respond({ status: 200, body: { data: [], paging: {} } }),
    });
    const { mod } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 3; page++) seen.push(...await mod.fetchMixedMedia(page));
    const invented = seen.filter(i => i.platform === 'instagram');
    check('an empty 200 from a configured platform gets no samples',
        invented.length === 0, `leaked ${invented.map(i => i.id).join(', ')}`);
}

// 17. Backward compatibility, stated as a test rather than as a claim. The
//     client must be correct against a server that still answers 500, which is
//     what makes the two sides safe to deploy in either order - and what makes a
//     browser tab left open across the deploy harmless.
{
    const routes = allPlatforms(1, {
        instagram: () => errored('Instagram not configured', false),
    });
    const { mod } = await load(routes);
    const seen = [];
    for (let page = 0; page <= 3; page++) seen.push(...await mod.fetchMixedMedia(page));
    const samples = seen.filter(i => i.platform === 'instagram');
    check('the old 500 shape is still read correctly',
        samples.length > 0, 'no samples from the legacy shape');
}

console.warn = realWarn;
console.log(fail.length ? `\n${fail.length} failed:\n  ${fail.join('\n  ')}` : '\nAll passed.');
process.exit(fail.length ? 1 : 0);
