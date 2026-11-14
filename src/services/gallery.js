// The media library on the client: fetching it, and the ordering and filters
// the gallery applies (TH-756). Pure functions apart from requestMediaLibrary,
// so node can test them without a browser.
//
// The server shape is in server/mediaLibrary.js (toClientItem).

import { platformLabel } from '../constants/platforms.js';

const API = import.meta.env?.VITE_API_BASE || '/api';

export const ALL = 'all';

// The public manifest npm run media:publish writes (scripts/mediaPublish.js):
// web copies on Vercel Blob, no originals. Served as a static file, so the
// hosted site needs no server code to read it.
export const PUBLIC_MANIFEST_URL = '/media-library.json';

// One public manifest asset as a gallery item. There is no original file on
// the hosted site: original.url is null and the viewer shows the web copy and
// links to the post (its permalink) instead.
export function fromPublicAsset(asset) {
    const width = asset.width || null;
    const height = asset.height || null;
    return {
        id: asset.id,
        postId: asset.post_id ?? asset.id,
        index: asset.index ?? 0,
        platform: asset.platform,
        kind: asset.kind,
        publishedAt: asset.published_at,
        date: '',
        permalink: asset.permalink || null,
        duration: null,
        orientation: width && height && width > height ? 'landscape' : 'portrait',
        web: {
            url: asset.web?.url || null,
            width: asset.web?.width ?? null,
            height: asset.web?.height ?? null,
            role: asset.web?.role === 'poster' ? 'poster' : 'image',
        },
        original: { url: null, hosted: false, width, height, mime: null, bytes: null, quality: null },
    };
}

async function requestPublicManifest(url, timeoutMs) {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    // A missing file on the host answers with the SPA's index.html, not a 404.
    const body = await response.json().catch(() => null);
    if (body?.schema !== 1 || !Array.isArray(body.assets)) return null;
    const items = body.assets.filter(asset => asset?.id && asset.web?.url).map(fromPublicAsset);
    return items.length ? items : null;
}

// One request, no caching: callers that want to reuse the answer keep it.
// Resolves to { configured, hosted, items, reason }; never rejects, because a
// missing library is a normal state rather than a fault.
//
// Which library: this server's own first (locally, after npm run media:import,
// with the originals from mkb-data). Where the server has none - the hosted
// site, which never has the originals - the public manifest of web copies on
// Vercel Blob, with hosted: true.
export async function requestMediaLibrary({ apiBase = API, publicManifestUrl = PUBLIC_MANIFEST_URL, timeoutMs = 8000 } = {}) {
    let reason;
    try {
        const response = await fetch(`${apiBase}/media/library`, {
            signal: AbortSignal.timeout(timeoutMs),
        });
        const body = await response.json();
        if (response.ok && body?.configured !== false && Array.isArray(body?.data)) {
            return { configured: true, hosted: false, items: body.data, reason: null };
        }
        reason = body?.error || `status ${response.status}`;
    } catch (err) {
        reason = err?.message || 'unreachable';
    }
    if (publicManifestUrl) {
        try {
            const items = await requestPublicManifest(publicManifestUrl, timeoutMs);
            if (items) return { configured: true, hosted: true, items, reason: null };
        } catch {
            // Fall through to the server's own reason, the more useful one.
        }
    }
    return { configured: false, hosted: false, items: [], reason };
}

const time = item => {
    const value = Date.parse(item?.publishedAt);
    return Number.isNaN(value) ? null : value;
};

// Newest first. Two posts at the same instant (a carousel's images share one)
// fall back to the id, so the order is the same on every render. Anything with
// an unreadable date goes last rather than first.
export function orderNewestFirst(items) {
    return [...items].sort((a, b) => {
        const ta = time(a);
        const tb = time(b);
        if (ta !== tb) {
            if (ta === null) return 1;
            if (tb === null) return -1;
            return tb - ta;
        }
        return String(a.id).localeCompare(String(b.id));
    });
}

// Carousels: the library lists one asset per file, and a post's children share
// its postId with `index` giving their order. The gallery shows one tile per
// post, its children in index order behind it. A single photo or video is a
// post with one child. Posts come back in no particular order; sort them with
// orderNewestFirst.
export function groupPosts(items) {
    const posts = new Map();
    for (const item of items) {
        const key = `${item.platform}:${item.postId ?? item.id}`;
        if (!posts.has(key)) posts.set(key, []);
        posts.get(key).push(item);
    }
    return [...posts.entries()].map(([id, children]) => {
        children.sort((a, b) => (a.index ?? 0) - (b.index ?? 0) || String(a.id).localeCompare(String(b.id)));
        const cover = children[0];
        const times = children.map(c => Date.parse(c.publishedAt)).filter(t => !Number.isNaN(t));
        return {
            id,
            platform: cover.platform,
            publishedAt: times.length ? new Date(Math.max(...times)).toISOString() : cover.publishedAt,
            date: cover.date,
            permalink: children.find(c => c.permalink)?.permalink || null,
            orientation: cover.orientation,
            cover,
            children,
        };
    });
}

// A post matches a kind when any of its children is that kind, so a carousel
// mixing photos and a video shows under both.
export function hasKind(entry, kind) {
    if (kind === ALL) return true;
    return entry.children ? entry.children.some(child => child.kind === kind) : entry.kind === kind;
}

export function filterItems(items, { platform = ALL, kind = ALL } = {}) {
    return items.filter(item =>
        (platform === ALL || item.platform === platform) && hasKind(item, kind));
}

// Counts for the filter buttons. Each platform count respects the kind filter
// and each kind count respects the platform filter, so a number always says
// what pressing that button would show.
export function facetCounts(items, { platform = ALL, kind = ALL } = {}) {
    const platforms = {};
    const kinds = { image: 0, video: 0 };
    let platformTotal = 0;
    let kindTotal = 0;
    for (const item of items) {
        if (hasKind(item, kind)) {
            platforms[item.platform] = (platforms[item.platform] || 0) + 1;
            platformTotal += 1;
        }
        if (platform === ALL || item.platform === platform) {
            for (const key of Object.keys(kinds)) if (hasKind(item, key)) kinds[key] += 1;
            kindTotal += 1;
        }
    }
    return { platforms, platformTotal, kinds, kindTotal };
}

// Spelled out by hand: toLocaleDateString's short months differ between ICU
// versions ('Sep' or 'Sept'), so the same post would read differently by browser.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDay(ms) {
    const d = new Date(ms);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// "Instagram video, 12 Nov 2026". The posts' own captions are deliberately not
// in the library, so this is the whole description a tile or the viewer gives.
export function describeItem(item) {
    const what = item.kind === 'video' ? 'video' : 'photo';
    const value = time(item);
    const when = value === null
        ? ''
        : `, ${formatDay(value)}`;
    return `${platformLabel(item.platform)} ${what}${when}`;
}

// "Instagram post, 5 items" for a carousel; a single child describes itself.
export function describePost(post) {
    if (!post.children || post.children.length === 1) return describeItem(post.cover || post.children?.[0] || post);
    const value = time(post);
    const when = value === null
        ? ''
        : `, ${formatDay(value)}`;
    return `${platformLabel(post.platform)} post of ${post.children.length}${when}`;
}

export function formatDuration(seconds) {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return null;
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) return null;
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// A library asset as a feed card, for the feed's stand-ins: a platform with no
// credentials used to show invented sample posts with stock pictures; with the
// library present it shows her real posts instead. No title text from the post
// exists, so the card is titled by what it is.
export function toFeedItem(item) {
    return {
        id: item.id,
        platform: item.platform,
        title: describeItem(item),
        thumbnail: item.web?.url || null,
        embedUrl: null,
        url: item.permalink || null,
        date: item.date || '',
        publishedAt: item.publishedAt || null,
        orientation: item.orientation,
        likes: null,
        views: null,
        comments: null,
        shares: null,
    };
}
