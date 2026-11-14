// Cherry's media library: every photo and video pulled from her accounts at
// original upload quality (TH-909), brought into the site (TH-756).
//
// WHERE THE FILES LIVE. Not in git. The originals are ~1.8 GB and the repo has
// never stored media - every picture the feed shows comes from a platform API
// at request time. So the library is served from the folder the pull wrote,
// C:/Workstation/mkb-data/sources/media/cherry by default, by this site's own
// Express server:
//
//   npm run media:import     reads that folder's index.json, checks every
//                            entry and its files (sha256), and writes the
//                            manifest the server reads
//                            (server/generated/media-library.json, ignored).
//   GET /api/media/library   the manifest as feed-shaped items, or
//                            configured:false when nothing was imported.
//   GET /api/media/web/:id       the web copy (webp, or a video's poster).
//   GET /api/media/original/:id  the original, byte for byte, with Range
//                                support so video seeks.
//
// Two settings, both optional: CHERRY_MEDIA_DIR points at the folder (the
// import records it in the manifest, and the variable overrides that at serve
// time), MEDIA_LIBRARY_FILE moves the manifest. On Vercel neither the folder
// nor the manifest exists, so the library reads as not configured there and
// the site behaves exactly as it did before - hosting the files publicly is a
// separate decision.
//
// The source folder is read-only to this code: nothing here writes to it.
//
// PRIVACY. The index carries no captions, and nothing here adds any. Assets are
// referred to by id; the only text a visitor sees is the platform, the kind and
// the date, all of which the platforms already publish beside the post.

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import { isAbsolute, resolve, sep } from 'path';

export const MANIFEST_SCHEMA = 1;
export const DEFAULT_MEDIA_DIR = 'C:/Workstation/mkb-data/sources/media/cherry';

const PLATFORMS = new Set(['instagram', 'facebook', 'youtube', 'tiktok']);
const KINDS = new Set(['image', 'video']);
const SHA256 = /^[0-9a-f]{64}$/;

// Reads index.json's text. Throws on anything that is not the index's shape,
// because a half-read index would import as a smaller library with nothing
// saying why.
export function parseIndex(text) {
    let index;
    try {
        index = JSON.parse(text);
    } catch (err) {
        throw new Error(`index.json is not JSON: ${err.message}`);
    }
    if (!index || !Array.isArray(index.assets)) {
        throw new Error('index.json has no assets array');
    }
    const problems = [];
    if (typeof index.count === 'number' && index.count !== index.assets.length) {
        problems.push({ id: null, reason: `index says ${index.count} assets but lists ${index.assets.length}` });
    }
    return { index, problems };
}

// A path from the index, kept only if it stays inside the media folder. The
// server later joins it onto that folder and hands the result to sendFile, so
// '../' or an absolute path here would serve any file on the machine.
export function safeRelative(value) {
    if (typeof value !== 'string' || !value) return null;
    if (isAbsolute(value) || /^[a-zA-Z]:/.test(value)) return null;
    const parts = value.split(/[\\/]+/);
    if (parts.some(part => part === '..' || part === '')) return null;
    return parts.join('/');
}

export function resolveInside(root, relative) {
    const safe = safeRelative(relative);
    if (!safe) return null;
    const base = resolve(root);
    const full = resolve(base, safe);
    return full.startsWith(base + sep) ? full : null;
}

// Where a child sits in its post. The pull writes it as the id's last segment
// ('instagram:<post>:2'); an explicit numeric `index` field wins if a later
// index carries one.
export function childIndex(entry) {
    if (Number.isInteger(entry?.index) && entry.index >= 0) return entry.index;
    const match = /:(\d+)$/.exec(entry?.id || '');
    return match ? Number(match[1]) : null;
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

// One index entry to one manifest asset, or a reason it cannot be one. Every
// entry ends in exactly one of the two, which is what lets the import say how
// many it dropped and why.
export function mapEntry(entry) {
    if (!entry || typeof entry !== 'object') return { reason: 'not an object' };
    const id = typeof entry.id === 'string' && entry.id ? entry.id : null;
    const fail = reason => ({ id, reason });

    if (!id) return fail('no id');
    if (!PLATFORMS.has(entry.platform)) return fail(`unknown platform ${JSON.stringify(entry.platform)}`);
    if (!KINDS.has(entry.kind)) return fail(`unknown kind ${JSON.stringify(entry.kind)}`);
    const original = safeRelative(entry.original);
    if (!original) return fail('original path missing or outside the media folder');
    const web = safeRelative(entry.web?.src);
    if (!web) return fail('web copy path missing or outside the media folder');
    if (!SHA256.test(entry.sha256 || '')) return fail('sha256 missing or malformed');
    const published = Date.parse(entry.published_at);
    if (Number.isNaN(published)) return fail('published_at missing or unreadable');
    if (!positive(entry.width) || !positive(entry.height)) return fail('pixel size missing');
    const index = childIndex(entry);
    if (index === null) return fail('no child index (neither an index field nor an id ending :<n>)');

    return {
        asset: {
            id,
            platform: entry.platform,
            kind: entry.kind,
            mime: typeof entry.mime === 'string' ? entry.mime : null,
            width: entry.width,
            height: entry.height,
            duration: positive(entry.duration_seconds) ? entry.duration_seconds : null,
            bytes: positive(entry.bytes) ? entry.bytes : null,
            publishedAt: new Date(published).toISOString(),
            permalink: typeof entry.permalink === 'string' && entry.permalink.startsWith('https://')
                ? entry.permalink
                : null,
            // A post's children share post_id; index orders them (0 is the
            // cover). A single-image post is a post with one child.
            postId: entry.post_id != null && entry.post_id !== '' ? String(entry.post_id) : id,
            index,
            // 'partial' is the pull's word for a carousel that gave only its
            // first image; the file itself is still the uploaded original.
            originalQuality: entry.original_quality === true ? 'original' : String(entry.original_quality ?? 'unknown'),
            sha256: entry.sha256,
            original,
            web: {
                src: web,
                width: positive(entry.web.width) ? entry.web.width : null,
                height: positive(entry.web.height) ? entry.web.height : null,
                role: entry.web.role === 'poster' ? 'poster' : 'image',
            },
        },
    };
}

export function sha256File(path) {
    return new Promise((done, failed) => {
        const hash = createHash('sha256');
        createReadStream(path)
            .on('error', failed)
            .on('data', chunk => hash.update(chunk))
            .on('end', () => done(hash.digest('hex')));
    });
}

async function isFile(path) {
    try {
        return (await stat(path)).isFile();
    } catch {
        return false;
    }
}

// Checks one asset's files. Returns the problems found, empty when it is good.
export async function verifyAsset(asset, mediaDir, { hash = true } = {}) {
    const problems = [];
    const original = resolveInside(mediaDir, asset.original);
    const web = resolveInside(mediaDir, asset.web.src);
    if (!original || !(await isFile(original))) {
        problems.push({ id: asset.id, reason: `original missing: ${asset.original}` });
    } else if (hash) {
        const actual = await sha256File(original);
        if (actual !== asset.sha256) {
            problems.push({ id: asset.id, reason: `sha256 mismatch on ${asset.original}` });
        }
    }
    if (!web || !(await isFile(web))) {
        problems.push({ id: asset.id, reason: `web copy missing: ${asset.web.src}` });
    }
    return problems;
}

const slotOf = asset => `slot ${asset.platform}:${asset.postId}#${asset.index}`;

// The whole import, minus the writing: parse, map every entry, verify every
// file. Only assets that pass everything go into the manifest; every one that
// does not is named in `problems`.
export async function buildManifest({ indexText, mediaDir, hash = true, concurrency = 4, now = new Date() }) {
    const { index, problems } = parseIndex(indexText);
    const mapped = [];
    const seen = new Set();
    for (const entry of index.assets) {
        const result = mapEntry(entry);
        if (!result.asset) {
            problems.push(result);
        } else if (seen.has(result.asset.id)) {
            problems.push({ id: result.asset.id, reason: 'duplicate id' });
        } else if (seen.has(slotOf(result.asset))) {
            problems.push({ id: result.asset.id, reason: `post ${result.asset.postId} already has a child at index ${result.asset.index}` });
        } else {
            seen.add(result.asset.id);
            seen.add(slotOf(result.asset));
            mapped.push(result.asset);
        }
    }

    const failed = new Set();
    let next = 0;
    const worker = async () => {
        while (next < mapped.length) {
            const asset = mapped[next++];
            const found = await verifyAsset(asset, mediaDir, { hash });
            if (found.length) {
                failed.add(asset.id);
                problems.push(...found);
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    const assets = mapped.filter(asset => !failed.has(asset.id));
    return {
        manifest: {
            schema: MANIFEST_SCHEMA,
            generated_at: now.toISOString(),
            source_dir: resolve(mediaDir).replaceAll('\\', '/'),
            source_generated_at: index.generated_at ?? null,
            hashed: hash,
            count: assets.length,
            assets,
        },
        summary: {
            listed: index.assets.length,
            imported: assets.length,
            dropped: index.assets.length - assets.length,
        },
        problems,
    };
}

function orientationOf(width, height) {
    if (!width || !height) return 'portrait';
    return width > height ? 'landscape' : 'portrait';
}

const encodeId = id => encodeURIComponent(id);

// One manifest asset as the client sees it. Local paths and hashes stay on the
// server; the client gets URLs on this site's own /api.
export function toClientItem(asset, { apiBase = '/api', relativeDate = () => '' } = {}) {
    return {
        id: asset.id,
        postId: asset.postId,
        index: asset.index,
        platform: asset.platform,
        kind: asset.kind,
        publishedAt: asset.publishedAt,
        date: relativeDate(asset.publishedAt),
        permalink: asset.permalink,
        duration: asset.duration,
        orientation: orientationOf(asset.width, asset.height),
        web: {
            url: `${apiBase}/media/web/${encodeId(asset.id)}`,
            width: asset.web.width,
            height: asset.web.height,
            role: asset.web.role,
        },
        original: {
            url: `${apiBase}/media/original/${encodeId(asset.id)}`,
            width: asset.width,
            height: asset.height,
            mime: asset.mime,
            bytes: asset.bytes,
            quality: asset.originalQuality,
        },
    };
}

// The server's handle on the library. The manifest is read once and kept; a
// missing manifest is remembered as "not configured" rather than retried on
// every request.
export function createMediaLibrary({ manifestFile, mediaDir = null }) {
    let loading = null;

    const load = () => {
        if (!loading) {
            loading = readFile(manifestFile, 'utf-8')
                .then(text => {
                    const manifest = JSON.parse(text);
                    if (manifest?.schema !== MANIFEST_SCHEMA || !Array.isArray(manifest.assets)) {
                        return { configured: false, reason: 'media library manifest has an unknown shape; run npm run media:import' };
                    }
                    const root = mediaDir || manifest.source_dir;
                    const byId = new Map(manifest.assets.map(asset => [asset.id, asset]));
                    return { configured: true, manifest, root, byId };
                })
                .catch(err => ({
                    configured: false,
                    reason: err.code === 'ENOENT'
                        ? 'Media library not imported. Run npm run media:import (CHERRY_MEDIA_DIR sets the folder).'
                        : `Media library manifest unreadable: ${err.message}`,
                }));
        }
        return loading;
    };

    // The absolute path for one asset's file, or null. Only ids the manifest
    // lists resolve, and only to a path inside the media folder.
    const resolveFile = async (id, variant) => {
        const library = await load();
        if (!library.configured) return null;
        const asset = library.byId.get(id);
        if (!asset) return null;
        const relative = variant === 'original' ? asset.original : asset.web.src;
        const path = resolveInside(library.root, relative);
        return path ? { asset, path } : null;
    };

    return { load, resolveFile };
}
