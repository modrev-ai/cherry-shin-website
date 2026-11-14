// Run with: node scripts/mediaPublish.test.mjs
//
// Publishing the web copies to Vercel Blob (TH-756, question 8438 "Web copies
// online"). Blob is stood in for by a Map behind head/put, so nothing here
// reaches the network; the CLI cases run the real script without a token, and
// with --dry-run, both of which must send nothing.

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import {
    BLOB_PREFIX,
    blobPathname,
    buildPublicManifest,
    publishAssets,
    sha256,
} from './mediaPublish.js';
import { fromPublicAsset } from '../src/services/gallery.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repoRoot, 'scripts', 'publish-media.mjs');

// Assembled, so no token-shaped literal sits in the repo for the scanner.
const FAKE_TOKEN = ['vercel', 'blob', 'rw', 'TESTSTORE01', 'notarealtokenjustatestvalue1234'].join('_');
const CAPTION = 'a caption that must never be published';

// Import-manifest assets as server/mediaLibrary.js writes them, plus a caption
// a later import might carry.
const asset = (id, kind, webSrc, extra = {}) => ({
    id,
    platform: 'instagram',
    kind,
    mime: kind === 'video' ? 'video/mp4' : 'image/jpeg',
    width: 1080,
    height: 1350,
    duration: kind === 'video' ? 12.5 : null,
    bytes: 4_000_000,
    publishedAt: '2026-11-13T09:35:37.000Z',
    permalink: `https://www.instagram.com/p/${id.split(':')[1]}/`,
    postId: id.split(':')[1],
    index: Number(id.split(':')[2]),
    originalQuality: 'original',
    sha256: 'ab'.repeat(32),
    original: `instagram/${id.split(':')[1]}/${id.split(':')[2]}.${kind === 'video' ? 'mp4' : 'jpg'}`,
    web: { src: webSrc, width: 600, height: 750, role: kind === 'video' ? 'poster' : 'image' },
    caption: CAPTION,
    ...extra,
});

const ASSETS = [
    asset('instagram:100:0', 'image', 'instagram/100/web/0.webp'),
    asset('instagram:100:1', 'image', 'instagram/100/web/1.webp'),
    asset('instagram:200:0', 'video', 'instagram/200/web/0-poster.jpg'),
];
const WEB = {
    'instagram/100/web/0.webp': Buffer.from('webp zero'),
    'instagram/100/web/1.webp': Buffer.from('webp one!'),
    'instagram/200/web/0-poster.jpg': Buffer.from('a poster jpeg'),
};
const TOTAL = Object.values(WEB).reduce((n, b) => n + b.length, 0);

// A Blob store: head() throws BlobNotFoundError like @vercel/blob does, put()
// records every call.
function fakeBlob() {
    const store = new Map();
    const calls = { head: 0, put: [] };
    return {
        store,
        calls,
        head: async pathname => {
            calls.head += 1;
            if (!store.has(pathname)) {
                const err = new Error('not found');
                err.name = 'BlobNotFoundError';
                throw err;
            }
            return { url: store.get(pathname), pathname };
        },
        put: async (pathname, body, options) => {
            calls.put.push({ pathname, bytes: body.length, options });
            const url = `https://store.public.blob.vercel-storage.com/${pathname}`;
            store.set(pathname, url);
            return { url, pathname };
        },
    };
}

const readerOf = files => async a => {
    if (!files[a.web.src]) throw new Error('ENOENT');
    return files[a.web.src];
};

// 1. Blob names: id plus the web copy's own hash, path-safe, stable.
{
    const hash = sha256(Buffer.from('x'));
    const name = blobPathname('instagram:100:0', hash, 'a/b/web/0.WEBP');
    check('the name is prefix, id slug and 16 hex of the hash', name === `${BLOB_PREFIX}/instagram_100_0-${hash.slice(0, 16)}.webp`, name);
    check('the same input names the same blob', blobPathname('instagram:100:0', hash, 'a/b/web/0.WEBP') === name);
    check('different content names a different blob', blobPathname('instagram:100:0', sha256(Buffer.from('y')), 'x.webp') !== name);
    check('no path traversal survives the slug', !blobPathname('../../etc:1', hash, 'x.webp').includes('..'));
}

// 2. NEGATIVE: the public manifest carries no original path, original hash,
//    caption or token, at any depth.
{
    process.env.BLOB_READ_WRITE_TOKEN = FAKE_TOKEN;
    const blob = fakeBlob();
    const { entries } = await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), blob });
    const manifest = buildPublicManifest(entries, { now: new Date('2026-11-14T00:00:00Z') });
    const text = JSON.stringify(manifest);
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const keys = new Set();
    const walk = value => {
        if (value && typeof value === 'object') {
            for (const [key, inner] of Object.entries(value)) {
                keys.add(key);
                walk(inner);
            }
        }
    };
    walk(manifest);
    for (const forbidden of ['original', 'sha256', 'caption', 'bytes', 'mime', 'source_dir', 'src', 'token']) {
        check(`NEGATIVE: no "${forbidden}" key in the public manifest`, !keys.has(forbidden), [...keys].join(','));
    }
    check('NEGATIVE: no original path value in it', !ASSETS.some(a => text.includes(a.original)));
    check('NEGATIVE: no local web path in it', !Object.keys(WEB).some(src => text.includes(src)));
    check('NEGATIVE: no caption text in it', !text.includes(CAPTION));
    check('NEGATIVE: no token in it', !text.includes(FAKE_TOKEN) && !text.includes('vercel_blob_rw'));
    check('NEGATIVE: no original hash in it', !text.includes('ab'.repeat(32)));

    const first = manifest.assets[0];
    check('it carries the public fields',
        manifest.count === 3 && first.id === 'instagram:100:0' && first.kind === 'image' && first.width === 1080
        && first.height === 1350 && first.published_at === '2026-11-13T09:35:37.000Z' && first.platform === 'instagram'
        && first.post_id === '100' && first.index === 0 && first.permalink === 'https://www.instagram.com/p/100/'
        && first.web.url.startsWith('https://store.public.blob.vercel-storage.com/media/web/'),
        JSON.stringify(first));

    // What the hosted gallery makes of it: the web copy, no original file,
    // the post as the original.
    const item = fromPublicAsset(manifest.assets[2]);
    check('the gallery reads it back as an item with no original file',
        item.original.url === null && item.web.url === manifest.assets[2].web.url && item.web.role === 'poster'
        && item.permalink === 'https://www.instagram.com/p/200/' && item.postId === '200' && item.kind === 'video',
        JSON.stringify(item));
}

// 3. A dry run uploads nothing and touches no Blob call at all.
{
    const blob = fakeBlob();
    const { summary, entries } = await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), blob, dryRun: true });
    check('dry run: no put', blob.calls.put.length === 0, `${blob.calls.put.length} puts`);
    check('dry run: no head either', blob.calls.head === 0, `${blob.calls.head} heads`);
    check('dry run: counts and bytes', summary.images === 2 && summary.posters === 1 && summary.bytes === TOTAL
        && summary.uploaded === 0, JSON.stringify(summary));
    check('dry run: no URLs invented', entries.every(e => e.url === null));
    let threw = false;
    try {
        await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), dryRun: false });
    } catch {
        threw = true;
    }
    check('a real run without a Blob client refuses', threw);
}

// 4. Idempotent: the same input skips every existing blob; a changed web copy
//    is the only thing uploaded again.
{
    const blob = fakeBlob();
    const first = await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), blob });
    check('first run uploads each web copy once', first.summary.uploaded === 3 && blob.calls.put.length === 3,
        JSON.stringify(first.summary));
    check('uploads are public, unsuffixed and long-cached',
        blob.calls.put.every(c => c.options.access === 'public' && c.options.addRandomSuffix === false && c.options.cacheControlMaxAge >= 86400));
    check('content types follow the file', blob.calls.put.map(c => c.options.contentType).sort().join() === 'image/jpeg,image/webp,image/webp');

    const second = await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), blob });
    check('second run uploads nothing', second.summary.uploaded === 0 && blob.calls.put.length === 3, JSON.stringify(second.summary));
    check('second run skips all three', second.summary.skipped === 3);
    check('and names the same URLs', JSON.stringify(second.entries.map(e => e.url)) === JSON.stringify(first.entries.map(e => e.url)));

    const changed = { ...WEB, 'instagram/100/web/1.webp': Buffer.from('webp one, re-encoded') };
    const third = await publishAssets({ assets: ASSETS, readWeb: readerOf(changed), blob });
    check('a changed copy uploads under a new name, the rest skip',
        third.summary.uploaded === 1 && third.summary.skipped === 2 && third.entries[1].url !== first.entries[1].url,
        JSON.stringify(third.summary));
}

// 5. Failures: an unreadable copy is named and left out; a Blob error that is
//    not "not found" stops the run rather than re-uploading blind.
{
    const blob = fakeBlob();
    const partial = { ...WEB };
    delete partial['instagram/100/web/1.webp'];
    const { summary, entries } = await publishAssets({ assets: ASSETS, readWeb: readerOf(partial), blob });
    check('an unreadable web copy is named, not uploaded', summary.failed.length === 1 && summary.failed[0].id === 'instagram:100:1'
        && entries.length === 2 && summary.uploaded === 2);

    const broken = { head: async () => { throw new Error('store suspended'); }, put: async () => { throw new Error('should not put'); } };
    let message = '';
    try {
        await publishAssets({ assets: ASSETS, readWeb: readerOf(WEB), blob: broken });
    } catch (err) {
        message = err.message;
    }
    check('a non-404 head error stops the run', message === 'store suspended', message);
}

// 6. The CLI: no token means nothing uploaded and nothing written; --dry-run
//    prints counts and bytes and writes nothing.
{
    const dir = await mkdtemp(join(tmpdir(), 'cherry-publish-'));
    for (const [src, bytes] of Object.entries(WEB)) {
        await mkdir(dirname(join(dir, src)), { recursive: true });
        await writeFile(join(dir, src), bytes);
    }
    const manifestFile = join(dir, 'media-library.json');
    await writeFile(manifestFile, JSON.stringify({ schema: 1, source_dir: dir.replaceAll('\\', '/'), count: 3, assets: ASSETS }));
    const out = join(dir, 'public', 'media-library.json');

    const env = { ...process.env };
    delete env.BLOB_READ_WRITE_TOKEN;
    delete env.CHERRY_MEDIA_DIR;
    delete env.MEDIA_LIBRARY_FILE;
    const run = args => spawnSync(process.execPath, [script, '--manifest', manifestFile, '--out', out, ...args],
        { env, encoding: 'utf-8', timeout: 60_000 });

    const noToken = run([]);
    check('no token: exits 2', noToken.status === 2, `status ${noToken.status} ${noToken.stderr}`);
    check('no token: says why', /BLOB_READ_WRITE_TOKEN is not set/.test(noToken.stderr) && /nothing was uploaded/.test(noToken.stderr));
    check('no token: writes no manifest', !existsSync(out));

    const dry = run(['--dry-run']);
    check('dry run: exits 0 with no token', dry.status === 0, `status ${dry.status} ${dry.stderr}`);
    check('dry run: prints counts and total bytes',
        dry.stdout.includes('3 web copies of 3 assets') && dry.stdout.includes('2 images, 1 video posters') && dry.stdout.includes(`${TOTAL} bytes`),
        dry.stdout.trim());
    check('dry run: says nothing was sent', dry.stdout.includes('nothing sent') && !dry.stdout.includes('uploaded'));
    check('dry run: writes no manifest', !existsSync(out));

    await rm(dir, { recursive: true, force: true });
}

console.log(fail.length ? `\n${fail.length} failed:\n  ${fail.join('\n  ')}` : '\nAll passed.');
process.exit(fail.length ? 1 : 0);
