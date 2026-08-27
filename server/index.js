import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { cached, getStats } from './cache.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Instagram Graph API config
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

// The shipped .env template uses a placeholder value. Treat it as unset so we
// report "not configured" instead of sending a bogus token to the Graph API.
const isPlaceholderToken = (t) => !t || /^your_.*_here$/.test(t.trim());
// No fallback on purpose. This used to default to a hardcoded account id left
// over from the original code, which meant that setting a token without also
// setting the id would have quietly fetched a stranger's posts and presented
// them as Cherry's, rather than failing.
const IG_USER_ID = process.env.IG_USER_ID;

// Instagram needs both halves: a token alone identifies who is asking, not
// whose media to read.
const isInstagramConfigured = () =>
    !isPlaceholderToken(IG_ACCESS_TOKEN) && !isPlaceholderToken(IG_USER_ID);

// Token cache file
const TOKEN_CACHE_FILE = join(__dirname, 'token_cache.json');

// How long a fetched feed stays fresh. Upstream is called once per window
// regardless of how many visitors arrive in it.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000;

// YouTube Data API v3 - public channel data, so an API key is enough.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';

// TikTok's Display API needs OAuth and app review, and only works with the
// developer's own account until it passes. The public oEmbed endpoint needs
// neither, but it resolves one post at a time, so the posts to mirror are
// listed explicitly rather than discovered.
const TIKTOK_OEMBED = process.env.TIKTOK_OEMBED_BASE || 'https://www.tiktok.com/oembed';
const TIKTOK_POST_URLS = (process.env.TIKTOK_POST_URLS || '')
    .split(/[\s,]+/)
    .map(url => url.trim())
    .filter(url => url.startsWith('http'));

app.use(cors());
app.use(express.json());

// Helper: load cached token
async function loadTokenCache() {
    try {
        const data = await readFile(TOKEN_CACHE_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return { accessToken: IG_ACCESS_TOKEN, expiresAt: 0 };
    }
}

// Instagram Graph API base URL
// Overridable so the cache layer can be exercised against a stub upstream, and
// so the Graph API version can be bumped without a code change.
const IG_API = process.env.IG_API_BASE || 'https://graph.facebook.com/v18.0';

const IG_FIELDS = 'id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink';

function mapInstagramItem(item) {
    return {
        id: item.id,
        platform: 'instagram',
        title: item.caption || 'Instagram Post',
        thumbnail: item.thumbnail_url || item.media_url,
        mediaUrl: item.media_url,
        mediaType: item.media_type, // PHOTO, VIDEO, CAROUSEL_ALBUM
        // A bare permalink will not load in an iframe; Instagram's public
        // embed view will.
        embedUrl: item.permalink ? `${item.permalink.replace(/\/$/, '')}/embed/` : null,
        date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '',
        likes: item.like_count || 0,
        views: null,
        comments: item.comments_count || 0,
        url: item.permalink,
    };
}

// Calls the Graph API and throws on an API-level error, so the cache can decide
// whether to fall back to an older copy.
async function fetchInstagramMedia(token, { limit = 12, after = null } = {}) {
    const url = `${IG_API}/${IG_USER_ID}/media`
        + `?fields=${IG_FIELDS}`
        + `&limit=${limit}`
        + (after ? `&after=${encodeURIComponent(after)}` : '')
        + `&access_token=${token}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        const err = new Error(data.error.message);
        err.isUpstream = true;
        throw err;
    }

    return {
        data: (data.data || []).map(mapInstagramItem),
        paging: data.paging || null,
    };
}

// Feed-style relative date, matching how the rest of the feed reads.
function relativeDate(iso) {
    if (!iso) return '';
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const days = Math.floor((Date.now() - then) / 86400000);
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 7) return `${days} days ago`;
    if (days < 14) return '1 week ago';
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    if (days < 60) return '1 month ago';
    if (days < 365) return `${Math.floor(days / 30)} months ago`;
    return `${Math.floor(days / 365)} year${days < 730 ? '' : 's'} ago`;
}

async function ytGet(path, params) {
    const url = `${YT_API}/${path}?` + new URLSearchParams({ ...params, key: YOUTUBE_API_KEY });
    const response = await fetch(url);
    const data = await response.json();
    if (data.error) {
        const err = new Error(data.error.message);
        err.isUpstream = true;
        throw err;
    }
    return data;
}

// A channel's uploads live in a playlist whose id is the channel id with the
// UC prefix swapped for UU. playlistItems.list costs 1 quota unit; search.list
// would cost 100, which is why it is avoided here.
function uploadsPlaylistId(channelId) {
    return channelId.replace(/^UC/, 'UU');
}

// The API exposes no aspect ratio: player.embedHtml reports 480x270 for every
// video, and duration is ambiguous since Shorts may run to three minutes.
// Requesting the /shorts/ URL is definitive - YouTube serves it for a Short and
// redirects to /watch for anything else. It costs no API quota, and the feed
// cache means it runs once per refresh rather than per visitor.
async function isShort(videoId) {
    try {
        const response = await fetch(`https://www.youtube.com/shorts/${videoId}`, {
            method: 'HEAD',
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
        });
        return response.status === 200;
    } catch {
        // Unknown: fall back to landscape, which is the safe default because a
        // portrait video letterboxed is untidy, whereas a landscape video
        // cropped to portrait loses most of the frame.
        return false;
    }
}

async function fetchYouTubeVideos({ limit = 12 } = {}) {
    const playlist = await ytGet('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId(YOUTUBE_CHANNEL_ID),
        maxResults: String(Math.min(limit, 50)),
    });

    const ids = (playlist.items || [])
        .map(item => item.contentDetails?.videoId)
        .filter(Boolean);

    // Second call (1 more unit) so the action rail has real view/like counts,
    // which playlistItems does not return.
    let statsById = {};
    if (ids.length) {
        const stats = await ytGet('videos', {
            part: 'statistics',
            id: ids.join(','),
        });
        statsById = Object.fromEntries((stats.items || []).map(v => [v.id, v.statistics || {}]));
    }

    const shortFlags = Object.fromEntries(
        await Promise.all(ids.map(async id => [id, await isShort(id)]))
    );

    const items = (playlist.items || []).map(item => {
        const snippet = item.snippet || {};
        const videoId = item.contentDetails?.videoId;
        const thumbs = snippet.thumbnails || {};
        const best = thumbs.maxres || thumbs.standard || thumbs.high || thumbs.medium || thumbs.default;
        const stat = statsById[videoId] || {};

        return {
            id: videoId,
            platform: 'youtube',
            title: snippet.title || 'YouTube video',
            thumbnail: best?.url || null,
            embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}` : null,
            date: relativeDate(snippet.publishedAt),
            likes: Number(stat.likeCount) || 0,
            views: Number(stat.viewCount) || 0,
            comments: Number(stat.commentCount) || 0,
            orientation: shortFlags[videoId] ? 'portrait' : 'landscape',
            url: videoId
                ? (shortFlags[videoId]
                    ? `https://www.youtube.com/shorts/${videoId}`
                    : `https://www.youtube.com/watch?v=${videoId}`)
                : null,
        };
    }).filter(item => item.id && item.thumbnail);

    return { data: items, paging: playlist.nextPageToken ? { next: playlist.nextPageToken } : null };
}

// oEmbed carries no engagement figures and no publish date, so those fields are
// left unset rather than invented. A post that fails to resolve is dropped
// instead of failing the whole feed: a deleted or private video should cost one
// card, not all of them.
async function fetchTikTokPost(postUrl) {
    const response = await fetch(`${TIKTOK_OEMBED}?url=${encodeURIComponent(postUrl)}`, {
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    const data = await response.json();
    const videoId = data.embed_product_id;
    if (!videoId) return null;

    // The html oEmbed returns is a blockquote plus TikTok's widget script, which
    // will not work inside the feed's iframe player. The embed view will.
    const width = Number(data.thumbnail_width) || 0;
    const height = Number(data.thumbnail_height) || 0;

    return {
        id: videoId,
        platform: 'tiktok',
        title: data.title || 'TikTok post',
        thumbnail: data.thumbnail_url || null,
        embedUrl: `https://www.tiktok.com/embed/v2/${videoId}`,
        date: '',
        likes: null,
        views: null,
        comments: null,
        orientation: width && height && width > height ? 'landscape' : 'portrait',
        url: postUrl,
    };
}

async function fetchTikTokPosts({ limit = 12 } = {}) {
    const wanted = TIKTOK_POST_URLS.slice(0, limit);
    const settled = await Promise.allSettled(wanted.map(fetchTikTokPost));

    const items = settled
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

    const dropped = wanted.length - items.length;
    if (dropped > 0) {
        console.warn(`TikTok: ${dropped} of ${wanted.length} posts could not be resolved`);
    }

    return { data: items, paging: null };
}

// Aggregate audience stats across whatever platforms are configured. Each
// platform contributes only if its credentials are present, so this fills out
// as more are connected rather than needing a rewrite each time.
async function fetchAudienceStats() {
    const platforms = {};

    if (!isPlaceholderToken(YOUTUBE_API_KEY) && !isPlaceholderToken(YOUTUBE_CHANNEL_ID)) {
        const data = await ytGet('channels', {
            part: 'statistics',
            id: YOUTUBE_CHANNEL_ID,
        });
        const stat = data.items?.[0]?.statistics;
        if (stat) {
            platforms.youtube = {
                // YouTube hides exact counts for some channels; treat that as unknown
                // rather than reporting zero followers.
                followers: stat.hiddenSubscriberCount ? null : Number(stat.subscriberCount) || 0,
                posts: Number(stat.videoCount) || 0,
                views: Number(stat.viewCount) || 0,
            };
        }
    }

    if (isInstagramConfigured()) {
        const url = `${IG_API}/${IG_USER_ID}?fields=followers_count,media_count&access_token=${IG_ACCESS_TOKEN}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!data.error) {
            platforms.instagram = {
                followers: Number(data.followers_count) || 0,
                posts: Number(data.media_count) || 0,
                views: null,
            };
        }
    }

    const sum = (field) => {
        const values = Object.values(platforms)
            .map(p => p[field])
            .filter(v => typeof v === 'number');
        return values.length ? values.reduce((a, b) => a + b, 0) : null;
    };

    return {
        totals: {
            followers: sum('followers'),
            posts: sum('posts'),
            views: sum('views'),
        },
        platforms,
        connected: Object.keys(platforms),
    };
}

// Tell the caller (and any CDN in front) how the response was served.
function sendCached(res, result) {
    const label = { store: 'HIT', upstream: 'MISS', stale: 'STALE' };
    res.set('X-Cache', label[result.source] || 'MISS');
    res.set('Age', String(Math.floor(result.ageMs / 1000)));
    res.set('Cache-Control', `public, max-age=${Math.floor(CACHE_TTL_MS / 1000)}`);
    if (result.state === 'stale') {
        res.set('Warning', '110 - Response is stale');
    }
    return res.json(result.value);
}

// Endpoint: get Instagram media
app.get('/api/instagram/media', async (req, res) => {
    try {
        const tokenCache = await loadTokenCache();
        const token = tokenCache.accessToken;
        const limit = Number(req.query.limit) || 12;

        if (isPlaceholderToken(token) || isPlaceholderToken(IG_USER_ID)) {
            return res.status(500).json({ error: 'Instagram not configured. Set IG_ACCESS_TOKEN and IG_USER_ID in .env' });
        }

        // Keyed by limit so different page sizes do not clobber each other.
        const result = await cached(
            `ig:media:${limit}`,
            () => fetchInstagramMedia(token, { limit }),
            { ttlMs: CACHE_TTL_MS }
        );

        return sendCached(res, result);
    } catch (error) {
        console.error('Error fetching Instagram media:', error.message);
        return res.status(502).json({
            error: 'Instagram API error',
            message: error.message,
            hint: 'Token may be expired. Visit https://developers.facebook.com/tools/explorer/ to refresh it.'
        });
    }
});

// Endpoint: refresh token info
app.get('/api/instagram/status', async (req, res) => {
    try {
        const cache = await loadTokenCache();

        if (!cache.accessToken) {
            return res.json({ configured: false });
        }

        // Verify token is valid by making a simple API call
        const url = `${IG_API}/me?access_token=${cache.accessToken}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return res.json({ configured: true, valid: false, error: data.error.message });
        }

        return res.json({ configured: true, valid: true, user: data });
    } catch (error) {
        console.error('Error checking Instagram status:', error);
        res.status(500).json({ error: 'Failed to check Instagram status' });
    }
});

// Endpoint: get next page of results
app.get('/api/instagram/media/next', async (req, res) => {
    try {
        const { cursor } = req.query;
        const tokenCache = await loadTokenCache();

        if (isPlaceholderToken(tokenCache.accessToken) || isPlaceholderToken(IG_USER_ID)) {
            return res.status(500).json({ error: 'Instagram not configured. Set IG_ACCESS_TOKEN and IG_USER_ID in .env' });
        }

        if (!cursor) {
            return res.status(400).json({ error: 'Cursor required' });
        }

        const result = await cached(
            `ig:media:next:${cursor}`,
            () => fetchInstagramMedia(tokenCache.accessToken, { limit: 12, after: cursor }),
            { ttlMs: CACHE_TTL_MS }
        );

        return sendCached(res, result);
    } catch (error) {
        console.error('Error fetching next page:', error.message);
        return res.status(502).json({ error: error.message });
    }
});

// Endpoint: get YouTube uploads
app.get('/api/youtube/videos', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 12;

        if (isPlaceholderToken(YOUTUBE_API_KEY) || isPlaceholderToken(YOUTUBE_CHANNEL_ID)) {
            return res.status(500).json({ error: 'YouTube not configured. Set YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID in .env' });
        }

        const result = await cached(
            `yt:videos:${limit}`,
            () => fetchYouTubeVideos({ limit }),
            { ttlMs: CACHE_TTL_MS }
        );

        return sendCached(res, result);
    } catch (error) {
        console.error('Error fetching YouTube videos:', error.message);
        return res.status(502).json({ error: 'YouTube API error', message: error.message });
    }
});

// Endpoint: get TikTok posts
app.get('/api/tiktok/posts', async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 12;

        if (TIKTOK_POST_URLS.length === 0) {
            return res.status(500).json({ error: 'TikTok not configured. Set TIKTOK_POST_URLS in .env' });
        }

        const result = await cached(
            `tiktok:posts:${limit}`,
            () => fetchTikTokPosts({ limit }),
            { ttlMs: CACHE_TTL_MS }
        );

        return sendCached(res, result);
    } catch (error) {
        console.error('Error fetching TikTok posts:', error.message);
        return res.status(502).json({ error: 'TikTok oEmbed error', message: error.message });
    }
});

// Endpoint: audience stats for the hero
app.get('/api/stats', async (req, res) => {
    try {
        const result = await cached('stats:audience', fetchAudienceStats, { ttlMs: CACHE_TTL_MS });
        return sendCached(res, result);
    } catch (error) {
        console.error('Error fetching audience stats:', error.message);
        return res.status(502).json({ error: 'Failed to fetch stats', message: error.message });
    }
});

// Endpoint: cache visibility, for checking that upstream calls stay flat
// as traffic grows.
app.get('/api/cache/stats', (req, res) => {
    res.json({ ttlMs: CACHE_TTL_MS, ...getStats() });
});

// Serverless platforms import the app and invoke it per request; only a direct
// `node server/index.js` should bind a port. Keeping one implementation means
// local dev and production cannot drift apart.
const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (isDirectRun) {
    app.listen(PORT, () => {
        console.log(`API Server running on http://localhost:${PORT}`);
        console.log(`Instagram: ${isInstagramConfigured() ? 'Configured' : 'NOT CONFIGURED - set IG_ACCESS_TOKEN and IG_USER_ID in .env'}`);
        console.log(`YouTube API key: ${isPlaceholderToken(YOUTUBE_API_KEY) ? 'NOT CONFIGURED - set YOUTUBE_API_KEY in .env' : 'Configured'}`);
    console.log(`TikTok: ${TIKTOK_POST_URLS.length ? `${TIKTOK_POST_URLS.length} post(s) configured` : 'NOT CONFIGURED - set TIKTOK_POST_URLS in .env'}`);
    });
}

export default app;