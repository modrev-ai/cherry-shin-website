// Run with: node server/test/mediaLibrary.test.mjs
//
// The media library import (TH-756): the index is parsed, every entry maps to
// exactly one asset or one named problem, sha256 is really checked, a missing
// file is reported rather than imported, and the server serves only what the
// manifest lists. Fixtures are written to a temp folder; the real mkb-data
// folder is read only by the last case, without hashing, and only if present.

import { createHash } from 'crypto';
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
    DEFAULT_MEDIA_DIR,
    buildManifest,
    mapEntry,
    parseIndex,
    resolveInside,
    toClientItem,
} from '../mediaLibrary.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..');
const sha = buf => createHash('sha256').update(buf).digest('hex');

// A media folder shaped like the pull's: <platform>/<post>/<n>.<ext> plus a
// web/ copy, and an index.json describing it.
async function fixture({ tamper = null, drop = null } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'cherry-media-'));
    const specs = [
        // A carousel, listed child 1 before child 0 as the real index does.
        { id: 'instagram:100:1', platform: 'instagram', kind: 'image', ext: 'jpg', mime: 'image/jpeg', at: '2026-11-12T05:46:28.000Z', w: 1080, h: 1350 },
        { id: 'instagram:100:0', platform: 'instagram', kind: 'image', ext: 'jpg', mime: 'image/jpeg', at: '2026-11-12T05:46:28.000Z', w: 3072, h: 4096 },
        { id: 'instagram:101:0', platform: 'instagram', kind: 'video', ext: 'mp4', mime: 'video/mp4', at: '2026-11-12T05:38:33.000Z', w: 720, h: 1280 },
        { id: 'facebook:200:0', platform: 'facebook', kind: 'video', ext: 'mp4', mime: 'video/mp4', at: '2026-11-10T06:47:40.000Z', w: 1920, h: 1080 },
        { id: 'facebook:201:0', platform: 'facebook', kind: 'image', ext: 'png', mime: 'image/png', at: '2026-10-01T00:00:00.000Z', w: 800, h: 800 },
    ];
    const assets = [];
    for (const spec of specs) {
        const [, post, n] = spec.id.split(':');
        const original = `${spec.platform}/${post}/${n}.${spec.ext}`;
        const web = `${spec.platform}/${post}/web/${n}${spec.kind === 'video' ? '-poster.jpg' : '.webp'}`;
        const body = Buffer.from(`original bytes of ${spec.id} `.repeat(64));
        await mkdir(join(dir, spec.platform, post, 'web'), { recursive: true });
        if (drop !== spec.id) await writeFile(join(dir, original), tamper === spec.id ? Buffer.from('changed') : body);
        await writeFile(join(dir, web), Buffer.from(`web ${spec.id}`));
        assets.push({
            id: spec.id, platform: spec.platform, kind: spec.kind, mime: spec.mime,
            original, original_quality: true, permalink: `https://example.test/p/${post}`,
            post_id: post, published_at: spec.at, sha256: sha(body), bytes: body.length,
            width: spec.w, height: spec.h, duration_seconds: spec.kind === 'video' ? 15.1 : null,
            bit_rate: null, web: { src: web, width: 600, height: 800, role: spec.kind === 'video' ? 'poster' : 'image' },
        });
    }
    const index = { schema: 1, count: assets.length, generated_at: '2026-11-14T05:01:17+00:00', assets };
    await writeFile(join(dir, 'index.json'), JSON.stringify(index));
    return { dir, index, indexText: JSON.stringify(index), cleanup: () => rm(dir, { recursive: true, force: true }) };
}

// 1. The index is parsed, and every entry maps.
{
    const fx = await fixture();
    const { index, problems } = parseIndex(fx.indexText);
    check('parseIndex reads the assets array', index.assets.length === 5 && problems.length === 0,
        `${index.assets.length} assets, ${problems.length} problems`);

    const result = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir });
    check('every entry is imported when every file is right',
        result.manifest.count === 5 && result.problems.length === 0,
        `${result.manifest.count} imported, problems ${JSON.stringify(result.problems)}`);
    check('every index id is in the manifest, once',
        result.manifest.assets.map(a => a.id).sort().join() === fx.index.assets.map(a => a.id).sort().join());
    const video = result.manifest.assets.find(a => a.id === 'facebook:200:0');
    check('a mapped asset keeps its original size, kind and paths',
        video.width === 1920 && video.height === 1080 && video.kind === 'video'
        && video.original === 'facebook/200/0.mp4' && video.web.role === 'poster' && video.originalQuality === 'original',
        JSON.stringify(video));
    const children = result.manifest.assets.filter(a => a.postId === '100').map(a => `${a.id}#${a.index}`).sort();
    check('carousel children share their post id and keep their index',
        children.join() === 'instagram:100:0#0,instagram:100:1#1', children.join());
    await fx.cleanup();
}

// 2. sha256 is checked: one changed byte drops that asset and names it.
{
    const fx = await fixture({ tamper: 'instagram:100:0' });
    const result = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir });
    check('a file whose sha256 does not match is not imported',
        !result.manifest.assets.some(a => a.id === 'instagram:100:0') && result.manifest.count === 4,
        `count ${result.manifest.count}`);
    check('and is reported as a sha256 mismatch',
        result.problems.some(p => p.id === 'instagram:100:0' && /sha256 mismatch/.test(p.reason)),
        JSON.stringify(result.problems));

    const skipped = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir, hash: false });
    check('--no-hash really skips the hash (the control for the case above)',
        skipped.manifest.count === 5 && skipped.manifest.hashed === false, `count ${skipped.manifest.count}`);
    await fx.cleanup();
}

// 3. NEGATIVE: a missing original is reported, never imported as if present.
{
    const fx = await fixture({ drop: 'facebook:201:0' });
    const result = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir });
    check('NEGATIVE: a missing original is not in the manifest',
        !result.manifest.assets.some(a => a.id === 'facebook:201:0'));
    check('NEGATIVE: and is reported by id as missing',
        result.problems.some(p => p.id === 'facebook:201:0' && /original missing/.test(p.reason)),
        JSON.stringify(result.problems));
    check('the summary counts it as dropped', result.summary.dropped === 1 && result.summary.listed === 5,
        JSON.stringify(result.summary));
    await fx.cleanup();
}

// 4. Bad entries are named, not silently skipped, and cannot point outside.
{
    const baseFx = await fixture();
    const base = baseFx.index.assets[0];
    const cases = [
        ['an original path climbing out of the folder', { ...base, original: '../../secret.txt' }, /outside/],
        ['an absolute original path', { ...base, original: 'C:/Windows/win.ini' }, /outside/],
        ['a web copy climbing out', { ...base, web: { ...base.web, src: 'a/../../b.webp' } }, /web copy/],
        ['a malformed sha256', { ...base, sha256: 'abc' }, /sha256/],
        ['an unreadable date', { ...base, published_at: 'soon' }, /published_at/],
        ['an unknown kind', { ...base, kind: 'audio' }, /kind/],
    ];
    for (const [name, entry, reason] of cases) {
        const result = mapEntry(entry);
        check(`rejects ${name}`, !result.asset && reason.test(result.reason || ''), JSON.stringify(result));
    }
    check('a child index comes from the id when there is no index field',
        mapEntry({ ...base, id: 'instagram:100:7' }).asset?.index === 7);
    check('an explicit index field wins', mapEntry({ ...base, index: 3 }).asset?.index === 3);
    check('NEGATIVE: an id with no index and no field is rejected, not guessed as 0',
        /child index/.test(mapEntry({ ...base, id: 'instagram-100' }).reason || ''));
    const clash = await buildManifest({
        indexText: JSON.stringify({ assets: [base, { ...base, id: 'instagram:100:other', index: base.index ?? 1 }] }),
        mediaDir: '.', hash: false,
    });
    check('two children claiming one slot in a post are reported',
        clash.problems.some(p => /already has a child at index 1/.test(p.reason)), JSON.stringify(clash.problems));
    check('resolveInside refuses a path that escapes', resolveInside('/srv/media', '../etc/passwd') === null);

    const text = JSON.stringify({ count: 3, assets: [base, base] });
    const parsed = parseIndex(text);
    check('a count that disagrees with the list is reported', parsed.problems.length === 1, JSON.stringify(parsed.problems));
    let threw = false;
    try { parseIndex('{"nope":1}'); } catch { threw = true; }
    check('an index with no assets array is an error, not an empty library', threw);
    await baseFx.cleanup();
}

// 5. The client item carries URLs on the site's own /api, never local paths.
{
    const fx = await fixture();
    const { manifest } = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir, hash: false });
    const item = toClientItem(manifest.assets.find(a => a.id === 'instagram:100:0'));
    const text = JSON.stringify(item);
    check('client item points at /api/media/original/<id>',
        item.original.url === '/api/media/original/instagram%3A100%3A0' && item.web.url === '/api/media/web/instagram%3A100%3A0'
        && item.postId === '100' && item.index === 0,
        text);
    check('client item leaks no local path or hash', !text.includes(fx.dir.replaceAll('\\', '/')) && !text.includes('sha256') && !text.includes('0.jpg'),
        text);
    await fx.cleanup();
}

// 6. The CLI: exit 0 and a manifest when everything is right; exit 1 with the
//    missing file named when it is not (NEGATIVE).
{
    const script = join(repoRoot, 'scripts', 'import-media.mjs');
    const good = await fixture();
    const out = join(good.dir, 'out', 'library.json');
    const run = spawnSync(process.execPath, [script, '--source', good.dir, '--out', out], { encoding: 'utf-8' });
    const written = existsSync(out) ? JSON.parse(await readFile(out, 'utf-8')) : null;
    check('CLI exits 0 and writes all five assets', run.status === 0 && written?.count === 5,
        `status ${run.status} ${run.stderr}`);
    await good.cleanup();

    const bad = await fixture({ drop: 'instagram:101:0' });
    const badOut = join(bad.dir, 'library.json');
    const badRun = spawnSync(process.execPath, [script, '--source', bad.dir, '--out', badOut], { encoding: 'utf-8' });
    check('NEGATIVE: CLI exits 1 when a file is missing', badRun.status === 1, `status ${badRun.status}`);
    check('NEGATIVE: and names the missing asset', /instagram:101:0: original missing/.test(badRun.stderr), badRun.stderr);
    await bad.cleanup();

    const none = spawnSync(process.execPath, [script, '--source', join(tmpdir(), 'no-such-media-dir-756')], { encoding: 'utf-8' });
    check('CLI exits 2 when there is no index at all', none.status === 2, `status ${none.status}`);
}

// 7. The routes: the library and its files are served from the manifest, and
//    nothing else is.
{
    const fx = await fixture();
    const { manifest } = await buildManifest({ indexText: fx.indexText, mediaDir: fx.dir });
    const manifestFile = join(fx.dir, 'manifest.json');
    await writeFile(manifestFile, JSON.stringify(manifest));

    const quietLog = console.log;
    console.log = () => {};
    const start = async (env) => {
        process.env.MEDIA_LIBRARY_FILE = env.MEDIA_LIBRARY_FILE;
        process.env.CHERRY_MEDIA_DIR = env.CHERRY_MEDIA_DIR || '';
        const { default: app } = await import(`../index.js?media=${Math.random()}`);
        const server = app.listen(0);
        await new Promise(r => server.once('listening', r));
        return { base: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(r => server.close(r)) };
    };

    const app = await start({ MEDIA_LIBRARY_FILE: manifestFile, CHERRY_MEDIA_DIR: fx.dir });
    console.log = quietLog;
    const lib = await (await fetch(`${app.base}/api/media/library`)).json();
    check('GET /api/media/library lists every imported asset', lib.configured === true && lib.data?.length === 5,
        JSON.stringify(lib).slice(0, 160));

    const id = encodeURIComponent('instagram:101:0');
    const res = await fetch(`${app.base}/api/media/original/${id}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    check('GET /api/media/original/<id> returns the original byte for byte',
        res.status === 200 && sha(bytes) === manifest.assets.find(a => a.id === 'instagram:101:0').sha256
        && res.headers.get('content-type') === 'video/mp4',
        `status ${res.status} type ${res.headers.get('content-type')}`);

    const ranged = await fetch(`${app.base}/api/media/original/${id}`, { headers: { Range: 'bytes=0-9' } });
    check('a Range request gets 206, so video can seek', ranged.status === 206, `status ${ranged.status}`);

    const web = await fetch(`${app.base}/api/media/web/${id}`);
    check('GET /api/media/web/<id> returns the web copy', web.status === 200 && (await web.text()) === 'web instagram:101:0');

    const unknown = await fetch(`${app.base}/api/media/original/${encodeURIComponent('instagram:999:0')}`);
    check('an id the manifest does not list is 404', unknown.status === 404, `status ${unknown.status}`);
    const climb = await fetch(`${app.base}/api/media/original/..%2F..%2Findex.json`);
    check('a path in place of an id is 404', climb.status === 404, `status ${climb.status}`);
    await app.close();

    console.log = () => {};
    const bare = await start({ MEDIA_LIBRARY_FILE: join(fx.dir, 'not-imported.json') });
    console.log = quietLog;
    const unconfigured = await fetch(`${bare.base}/api/media/library`);
    const body = await unconfigured.json();
    check('with no manifest the library answers 200 configured:false, like an unconfigured platform',
        unconfigured.status === 200 && body.configured === false && /media:import/.test(body.error || ''),
        JSON.stringify(body));
    await bare.close();
    await fx.cleanup();
}

// 8. The real index, if this machine has it: every one of its entries maps.
//    Existence and hashes are the import's job and too slow for a unit run.
{
    const indexFile = join(process.env.CHERRY_MEDIA_DIR || DEFAULT_MEDIA_DIR, 'index.json');
    if (!existsSync(indexFile)) {
        console.log(` SKIP real index not on this machine (${indexFile})`);
    } else {
        const { index, problems } = parseIndex(await readFile(indexFile, 'utf-8'));
        const unmapped = index.assets.map(mapEntry).filter(r => !r.asset);
        check(`every entry of the real index maps (${index.assets.length})`,
            problems.length === 0 && unmapped.length === 0, JSON.stringify([...problems, ...unmapped]).slice(0, 300));
    }
}

if (fail.length) {
    console.log(`\n${fail.length} failed`);
    process.exit(1);
}
console.log('\nall media library checks passed');
process.exit(0);
