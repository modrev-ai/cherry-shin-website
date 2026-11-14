// Publishing the media library's web copies to Vercel Blob (TH-756), so the
// live site's /gallery works. Jong's answer to question 8438, "Web copies
// online": only the web copies (webp images and video posters) go up. The
// originals stay on this machine, and on the live site the viewer links to the
// post on its platform instead of the original file.
//
// The CLI is scripts/publish-media.mjs (npm run media:publish). This module is
// the part that decides things, with the Blob calls passed in so the tests can
// stand in for them.
//
// WHAT IS PUBLIC. The public manifest is built from an allowlist (PUBLIC_FIELDS
// below), never by copying an asset and deleting fields: a field a later import
// adds - a caption, a local path - stays private unless someone adds it here.

import { createHash } from 'crypto';
import { extname } from 'path';

export const PUBLIC_SCHEMA = 1;
export const BLOB_PREFIX = 'media/web';
// Content-addressed, so a blob never changes under its name.
export const CACHE_MAX_AGE = 60 * 60 * 24 * 365;

const CONTENT_TYPES = {
    '.webp': 'image/webp',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.avif': 'image/avif',
};

export const contentTypeOf = src => CONTENT_TYPES[extname(src).toLowerCase()] || null;

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// One web copy's blob name: its id, made path-safe, and the first 16 hex of the
// copy's own sha256. The same file always gets the same name, which is what
// makes a re-run skip it; a changed copy gets a new name rather than replacing
// a file a cached page may still show.
export function blobPathname(id, hash, src) {
    const slug = String(id).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
    const ext = extname(src).toLowerCase() || '.bin';
    return `${BLOB_PREFIX}/${slug}-${hash.slice(0, 16)}${ext}`;
}

// The only fields that leave this machine, per asset. No original path, no
// original hash, no byte count of the original, no caption.
export function toPublicAsset(asset, webUrl) {
    return {
        id: asset.id,
        platform: asset.platform,
        kind: asset.kind,
        width: asset.width,
        height: asset.height,
        published_at: asset.publishedAt,
        post_id: asset.postId,
        index: asset.index,
        permalink: typeof asset.permalink === 'string' && asset.permalink.startsWith('https://')
            ? asset.permalink
            : null,
        web: {
            url: webUrl,
            width: asset.web?.width ?? null,
            height: asset.web?.height ?? null,
            role: asset.web?.role === 'poster' ? 'poster' : 'image',
        },
    };
}

export function buildPublicManifest(entries, { now = new Date() } = {}) {
    const assets = entries.map(({ asset, url }) => toPublicAsset(asset, url));
    return {
        schema: PUBLIC_SCHEMA,
        generated_at: now.toISOString(),
        count: assets.length,
        assets,
    };
}

// True when head() says the blob is not there. Anything else - no store, a
// bad token, the service down - is a real failure and is thrown on.
const isNotFound = err => err?.name === 'BlobNotFoundError' || err?.constructor?.name === 'BlobNotFoundError';

// Plans and, unless dryRun, performs the upload.
//
//   assets     the import manifest's assets
//   readWeb    async (asset) => Buffer of its web copy
//   blob       { head(pathname), put(pathname, body, options) } - @vercel/blob's,
//              or a stand-in. Never touched when dryRun.
//
// Returns { summary, entries }; entries pair each asset with its blob URL
// (null on a dry run) for buildPublicManifest. Assets whose web copy cannot be
// read are counted and named, not uploaded, and left out of the manifest.
export async function publishAssets({ assets, readWeb, blob = null, dryRun = false, concurrency = 4, log = () => {} }) {
    if (!dryRun && (!blob || typeof blob.put !== 'function' || typeof blob.head !== 'function')) {
        throw new Error('publishAssets needs blob.head and blob.put unless dryRun');
    }
    const summary = { assets: assets.length, images: 0, posters: 0, bytes: 0, uploaded: 0, skipped: 0, uploadedBytes: 0, failed: [] };
    const entries = new Array(assets.length).fill(null);

    let next = 0;
    const worker = async () => {
        while (next < assets.length) {
            const position = next++;
            const asset = assets[position];
            let bytes;
            try {
                bytes = await readWeb(asset);
            } catch (err) {
                summary.failed.push({ id: asset.id, reason: `web copy unreadable: ${err.message}` });
                continue;
            }
            const contentType = contentTypeOf(asset.web.src);
            if (!contentType) {
                summary.failed.push({ id: asset.id, reason: `unknown web copy type ${extname(asset.web.src)}` });
                continue;
            }
            summary.bytes += bytes.length;
            if (asset.web.role === 'poster') summary.posters += 1;
            else summary.images += 1;

            const pathname = blobPathname(asset.id, sha256(bytes), asset.web.src);
            if (dryRun) {
                entries[position] = { asset, pathname, url: null };
                continue;
            }

            let url = null;
            try {
                url = (await blob.head(pathname)).url;
            } catch (err) {
                if (!isNotFound(err)) throw err;
            }
            if (url) {
                summary.skipped += 1;
            } else {
                const result = await blob.put(pathname, bytes, {
                    access: 'public',
                    addRandomSuffix: false,
                    contentType,
                    cacheControlMaxAge: CACHE_MAX_AGE,
                });
                url = result.url;
                summary.uploaded += 1;
                summary.uploadedBytes += bytes.length;
                log(`  uploaded ${pathname}`);
            }
            entries[position] = { asset, pathname, url };
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

    return { summary, entries: entries.filter(Boolean) };
}
