import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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
const IG_USER_ID = process.env.IG_USER_ID || '17841405309284898';

// Token cache file
const TOKEN_CACHE_FILE = join(__dirname, 'token_cache.json');

// How long a fetched feed stays fresh. Upstream is called once per window
// regardless of how many visitors arrive in it.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000;

// YouTube Data API v3 - public channel data, so an API key is enough.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';

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
        embedUrl: item.permalink,
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
            url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
        };
    }).filter(item => item.id && item.thumbnail);

    return { data: items, paging: playlist.nextPageToken ? { next: playlist.nextPageToken } : null };
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

        if (isPlaceholderToken(token)) {
            return res.status(500).json({ error: 'No Instagram access token configured. Set IG_ACCESS_TOKEN in .env' });
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

        if (isPlaceholderToken(tokenCache.accessToken)) {
            return res.status(500).json({ error: 'No Instagram access token configured. Set IG_ACCESS_TOKEN in .env' });
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

// Endpoint: cache visibility, for checking that upstream calls stay flat
// as traffic grows.
app.get('/api/cache/stats', (req, res) => {
    res.json({ ttlMs: CACHE_TTL_MS, ...getStats() });
});

app.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
    console.log(`Instagram token: ${isPlaceholderToken(IG_ACCESS_TOKEN) ? 'NOT CONFIGURED - set IG_ACCESS_TOKEN in .env' : 'Configured'}`);
    console.log(`YouTube API key: ${isPlaceholderToken(YOUTUBE_API_KEY) ? 'NOT CONFIGURED - set YOUTUBE_API_KEY in .env' : 'Configured'}`);
});