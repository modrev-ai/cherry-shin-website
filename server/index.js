import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { cached, getStats, BudgetExceededError } from './cache.js';
import { readLimit, readAfter } from './params.js';
import { classifyUpstream, describeUpstreamFailure } from './upstream.js';
import { diagnosticsEnabled, diagnosticsGuard } from './diagnostics.js';
import { itemFromOEmbed, collectPosts } from './tiktok.js';
import { isPlaceholderToken, instagramConfigured } from './credentials.js';
import { collectStats, summariseStats, isTotalBlackout, sumField } from './stats.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// True only when this file is the process entry point, which means a local
// development server. On Vercel the app is imported by api/index.js instead.
const isDirectRun = Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(__filename);

// Local only. The reasoning, and the two separate holes this closes, are in
// diagnostics.js beside the decision.
const DIAGNOSTICS_ENABLED = diagnosticsEnabled({
    entryPoint: process.argv[1],
    moduleFile: __filename,
    isServerless: Boolean(process.env.VERCEL),
});

const app = express();
const PORT = process.env.PORT || 3001;

// Instagram Graph API config
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

// No fallback on purpose, and the reason is in credentials.js beside the
// predicate that enforces it: a default id would mean a token set without an id
// quietly fetched a stranger's posts and presented them as Cherry's.
const IG_USER_ID = process.env.IG_USER_ID;

const isInstagramConfigured = () =>
    instagramConfigured({ token: IG_ACCESS_TOKEN, userId: IG_USER_ID });

// Token cache file
const TOKEN_CACHE_FILE = join(__dirname, 'token_cache.json');

// How long a fetched feed stays fresh. Upstream is called once per window
// regardless of how many visitors arrive in it.
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS) || 10 * 60 * 1000;

// YouTube Data API v3 - public channel data, so an API key is enough.
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const YT_API = process.env.YT_API_BASE || 'https://www.googleapis.com/youtube/v3';

// Like and comment summaries need a permission beyond pages_read_engagement:
// without it the whole request fails with code 10, not just those fields. Rather
// than dropping the counts for good, ask for them and fall back once if refused,
// so adding the scope later restores them with no code change.
const FB_FIELDS_BASE = [
    'id',
    'message',
    'created_time',
    'full_picture',
    'permalink_url',
    'attachments{media_type,media,unshimmed_url}',
    'shares',
];
const FB_FIELDS_WITH_COUNTS = [
    ...FB_FIELDS_BASE,
    'likes.summary(true).limit(0)',
    'comments.summary(true).limit(0)',
];

let fbEngagementAllowed = true;

// Facebook refuses to embed posts whose audio it judges to be someone else's,
// which is most reels with music. There is no API field for it, but the plugin
// page says so in its HTML, so probe it once per cache window and drop the
// embed for those posts rather than showing a broken player.
async function isEmbeddable(permalink) {
    if (!permalink) return false;
    try {
        const url = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(permalink)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) return false;
        const html = await response.text();
        return !/may contain content owned by someone else|can(&#039;|')t be embedded/i.test(html);
    } catch {
        // Unknown: assume not embeddable, so the card shows its thumbnail and
        // watch button instead of a player that may fail.
        return false;
    }
}

function mapFacebookPost(post) {
    const attachment = post.attachments?.data?.[0];
    const image = attachment?.media?.image;
    const isVideo = attachment?.media_type === 'video';
    const permalink = post.permalink_url || null;

    // Page posts embed through the plugin endpoints rather than a direct media
    // URL. Videos and ordinary posts use different ones.
    // Inline playback has no click behind it, so autoplay must be muted, the
    // same constraint the other platforms have.
    const embedUrl = permalink
        ? `https://www.facebook.com/plugins/${isVideo ? 'video' : 'post'}.php`
            + `?href=${encodeURIComponent(permalink)}&show_text=false`
            + (isVideo ? '&autoplay=true&mute=1' : '')
        : null;

    return {
        id: post.id,
        platform: 'facebook',
        title: (post.message || 'Facebook post').split('\n')[0],
        thumbnail: post.full_picture || null,
        embedUrl,
        date: relativeDate(post.created_time),
        likes: post.likes?.summary?.total_count ?? null,
        views: null,
        comments: post.comments?.summary?.total_count ?? null,
        shares: post.shares?.count ?? null,
        orientation: image?.width && image?.height && image.width > image.height
            ? 'landscape'
            : 'portrait',
        url: permalink,
    };
}

// Graph APIs report another page by including `paging.next`, but the value to
// send back is `paging.cursors.after` - and `after` is present even on the last
// page, so testing it alone walks forever. Normalise both to the one shape the
// client understands: { next } holding the cursor to ask for, or null when the
// catalogue is finished.
function graphPaging(paging) {
    if (!paging?.next) return null;
    const after = paging.cursors?.after;
    return after ? { next: after } : null;
}

async function fetchFacebookPosts({ limit = 12, after = null } = {}) {
    const request = async (fields) => {
        const url = `${FB_API}/${FB_PAGE_ID}/posts`
            + `?fields=${fields.join(',')}`
            + `&limit=${limit}`
            + (after ? `&after=${encodeURIComponent(after)}` : '')
            + `&access_token=${FB_PAGE_ACCESS_TOKEN}`;
        const response = await fetch(url);
        return response.json();
    };

    let data = await request(fbEngagementAllowed ? FB_FIELDS_WITH_COUNTS : FB_FIELDS_BASE);

    // Code 10 is the permission refusal. Retry without the engagement summaries
    // rather than losing the whole feed over them.
    if (data.error?.code === 10 && fbEngagementAllowed) {
        console.warn('Facebook: like and comment counts need pages_read_user_content; continuing without them');
        fbEngagementAllowed = false;
        data = await request(FB_FIELDS_BASE);
    }

    if (data.error) {
        const err = new Error(data.error.message);
        err.isUpstream = true;
        err.status = response.status;
        throw err;
    }

    // A post with no image would render as an empty card in a media feed.
    const items = (data.data || []).map(mapFacebookPost).filter(item => item.thumbnail);

    const embeddable = await Promise.all(
        items.map(item => (item.embedUrl ? isEmbeddable(item.url) : Promise.resolve(false)))
    );
    items.forEach((item, i) => {
        if (!embeddable[i]) item.embedUrl = null;
    });

    const blocked = embeddable.filter(ok => !ok).length;
    if (blocked > 0) {
        console.warn(`Facebook: ${blocked} of ${items.length} posts cannot be embedded; showing stills`);
    }

    return { data: items, paging: graphPaging(data.paging) };
}

// Access tokens last about a day, so one is held in memory and refreshed a
// little early rather than on every request. On serverless this lives only for
// the life of an instance, which is fine: a cold start simply refreshes again.
let tiktokToken = null; // { value, expiresAt }

async function tiktokAccessToken() {
    if (tiktokToken && Date.now() < tiktokToken.expiresAt) return tiktokToken.value;

    const body = new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY,
        client_secret: TIKTOK_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: TIKTOK_REFRESH_TOKEN,
    });

    const response = await fetch(`${TIKTOK_API}/oauth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const data = await response.json();

    if (!data.access_token) {
        const err = new Error(data.error_description || data.error || 'TikTok token refresh failed');
        err.isUpstream = true;
        err.status = response.status;
        throw err;
    }

    // TikTok rotates the refresh token on use. The configured one stays valid
    // for its full year, so nothing breaks by ignoring the new one, but log it
    // once so it can be persisted deliberately rather than silently lost.
    if (data.refresh_token && data.refresh_token !== TIKTOK_REFRESH_TOKEN) {
        console.warn('TikTok returned a rotated refresh token; update TIKTOK_REFRESH_TOKEN when convenient');
    }

    const ttlMs = (Number(data.expires_in) || 86400) * 1000;
    tiktokToken = { value: data.access_token, expiresAt: Date.now() + ttlMs - 60_000 };
    return tiktokToken.value;
}

const TIKTOK_VIDEO_FIELDS = [
    'id', 'title', 'video_description', 'create_time', 'cover_image_url',
    'share_url', 'embed_link', 'duration', 'width', 'height',
    'like_count', 'comment_count', 'share_count', 'view_count',
].join(',');

function mapTikTokVideo(v) {
    const width = Number(v.width) || 0;
    const height = Number(v.height) || 0;
    return {
        id: String(v.id),
        platform: 'tiktok',
        title: captionTitle(v.title || v.video_description, 'TikTok post'),
        thumbnail: v.cover_image_url || null,
        embedLink: v.embed_link || null,
        embedUrl: v.embed_link || (v.id ? `https://www.tiktok.com/embed/v2/${v.id}` : null),
        date: relativeDate(v.create_time ? new Date(v.create_time * 1000).toISOString() : null),
        likes: Number(v.like_count) || 0,
        views: Number(v.view_count) || 0,
        comments: Number(v.comment_count) || 0,
        shares: Number(v.share_count) || 0,
        orientation: width && height && width > height ? 'landscape' : 'portrait',
        url: v.share_url || (v.id ? `https://www.tiktok.com/@/video/${v.id}` : null),
    };
}

async function fetchTikTokVideos({ limit = 12 } = {}) {
    const token = await tiktokAccessToken();
    const response = await fetch(`${TIKTOK_API}/video/list/?fields=${TIKTOK_VIDEO_FIELDS}`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ max_count: Math.min(limit, 20) }),
    });
    const data = await response.json();

    if (data.error && data.error.code && data.error.code !== 'ok') {
        const err = new Error(data.error.message || data.error.code);
        err.isUpstream = true;
        err.status = response.status;
        throw err;
    }

    const videos = data.data?.videos || [];
    return {
        data: videos.map(mapTikTokVideo).filter(item => item.thumbnail),
        paging: data.data?.has_more ? { cursor: data.data.cursor } : null,
    };
}

// TikTok's Display API needs OAuth and app review, and only works with the
// developer's own account until it passes. The public oEmbed endpoint needs
// neither, but it resolves one post at a time, so the posts to mirror are
// listed explicitly rather than discovered.
// Facebook Pages use the same Graph API host as Instagram, but a Page access
// token rather than a user one. Kept separate so either can be pointed at a
// stub independently.
const FB_API = process.env.FB_API_BASE || 'https://graph.facebook.com/v18.0';
const FB_PAGE_ID = process.env.FB_PAGE_ID;
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

const isFacebookConfigured = () =>
    !isPlaceholderToken(FB_PAGE_ACCESS_TOKEN) && !isPlaceholderToken(FB_PAGE_ID);

// Display API: lists the account's videos with engagement counts, the same
// shape of integration as YouTube and Meta. Needs a TikTok for Developers app
// and one OAuth authorisation by the account owner; oEmbed below stays as the
// fallback for when none of that is configured.
const TIKTOK_API = process.env.TIKTOK_API_BASE || 'https://open.tiktokapis.com/v2';
const TIKTOK_CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const TIKTOK_CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;
const TIKTOK_REFRESH_TOKEN = process.env.TIKTOK_REFRESH_TOKEN;

const isTikTokApiConfigured = () =>
    !isPlaceholderToken(TIKTOK_CLIENT_KEY)
    && !isPlaceholderToken(TIKTOK_CLIENT_SECRET)
    && !isPlaceholderToken(TIKTOK_REFRESH_TOKEN);

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

// A line carries content if it holds a letter, a number, or an emoji. Emoji
// count: captions here are frequently nothing but emoji, and testing for
// letters alone discarded them as empty and replaced real captions with a
// generic string. Punctuation and format characters match none of these, so
// the dot-only and zero-width lines creators use to push hashtags down a
// caption are still skipped, which is what this test is for.
const CAPTION_CONTENT = /[\p{L}\p{N}\p{Extended_Pictographic}]/u;

// Captions run to many lines. A card shows one, so take the first that says
// something, preferring a line that survives having its hashtags and mentions
// stripped. A caption made only of hashtags falls to the second pass and is
// shown as it stands, which beats replacing it with the generic fallback.
// Split on the newline character itself; trim() takes care of any carriage
// return.
function captionTitle(caption, fallback) {
    const lines = (caption || '')
        .split(String.fromCharCode(10))
        .map(part => part.trim());

    const worded = lines.find(part => CAPTION_CONTENT.test(part.replace(/[#@]\S+/gu, '')));
    return worded || lines.find(part => CAPTION_CONTENT.test(part)) || fallback;
}

function mapInstagramItem(item) {
    return {
        id: item.id,
        platform: 'instagram',
        title: captionTitle(item.caption, 'Instagram post'),
        thumbnail: item.thumbnail_url || item.media_url,
        mediaUrl: item.media_url,
        mediaType: item.media_type, // PHOTO, VIDEO, CAROUSEL_ALBUM
        // Deliberately not embedded. Reels return no media_url, so a native
        // player is impossible, and every Instagram embed variant renders the
        // full post chrome - avatar, username, Follow button - which crowds out
        // the video in a feed built around it. Cropping that away would also
        // strip the attribution the embed exists to carry. The card shows the
        // still and its watch button instead, the same treatment given to a
        // Facebook post that refuses to embed.
        embedUrl: null,
        date: relativeDate(item.timestamp),
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
        err.status = response.status;
        throw err;
    }

    return {
        data: (data.data || []).map(mapInstagramItem),
        paging: graphPaging(data.paging),
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

async function ytGet(path, params, { signal } = {}) {
    const url = `${YT_API}/${path}?` + new URLSearchParams({ ...params, key: YOUTUBE_API_KEY });
    const response = await fetch(url, signal ? { signal } : undefined);
    const data = await response.json();
    if (data.error) {
        const err = new Error(data.error.message);
        err.isUpstream = true;
        err.status = response.status;
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

async function fetchYouTubeVideos({ limit = 12, after = null } = {}) {
    const playlist = await ytGet('playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId(YOUTUBE_CHANNEL_ID),
        maxResults: String(Math.min(limit, 50)),
        ...(after ? { pageToken: after } : {}),
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

// The fetch. Everything worth testing about the response lives in tiktok.js;
// this is the I/O around it, which is why it is the part with no unit test.
async function fetchTikTokPost(postUrl) {
    const response = await fetch(`${TIKTOK_OEMBED}?url=${encodeURIComponent(postUrl)}`, {
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;

    return itemFromOEmbed(await response.json(), postUrl);
}

async function fetchTikTokPosts({ limit = 12 } = {}) {
    const wanted = TIKTOK_POST_URLS.slice(0, limit);
    const { items, dropped } = await collectPosts(wanted, fetchTikTokPost);

    if (dropped > 0) {
        console.warn(`TikTok: ${dropped} of ${wanted.length} posts could not be resolved`);
    }

    return { data: items, paging: null };
}

// Aggregate audience stats across whatever platforms are configured. Each
// platform contributes only if its credentials are present, so this fills out
// as more are connected rather than needing a rewrite each time.
//
// Every platform is also collected in isolation. One unreachable API used to
// propagate out of here and answer 502 for the endpoint as a whole, so the
// hero dropped every number it had - including the ones that arrived perfectly
// well - and showed nothing at all. A partial answer is a real answer.
const STATS_TIMEOUT_MS = 8000;

async function youtubeStats() {
    const data = await ytGet(
        'channels',
        { part: 'statistics', id: YOUTUBE_CHANNEL_ID },
        { signal: AbortSignal.timeout(STATS_TIMEOUT_MS) },
    );
    const stat = data.items?.[0]?.statistics;
    if (!stat) return null;
    return {
        // YouTube hides exact counts for some channels; treat that as unknown
        // rather than reporting zero followers.
        followers: stat.hiddenSubscriberCount ? null : Number(stat.subscriberCount) || 0,
        posts: Number(stat.videoCount) || 0,
        views: Number(stat.viewCount) || 0,
    };
}

async function instagramStats() {
    const url = `${IG_API}/${IG_USER_ID}`
        + `?fields=followers_count,media_count,profile_picture_url`
        + `&access_token=${IG_ACCESS_TOKEN}`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(STATS_TIMEOUT_MS) })).json();
    if (data.error) return null;
    return {
        followers: Number(data.followers_count) || 0,
        posts: Number(data.media_count) || 0,
        views: null,
        // Passed straight through, never stored: these CDN links are
        // short-lived, so the copy that matters is the one fetched with this
        // response.
        avatar: data.profile_picture_url || null,
    };
}

async function facebookStats() {
    const url = `${FB_API}/${FB_PAGE_ID}?fields=followers_count,fan_count&access_token=${FB_PAGE_ACCESS_TOKEN}`;
    const data = await (await fetch(url, { signal: AbortSignal.timeout(STATS_TIMEOUT_MS) })).json();
    if (data.error) return null;
    return {
        followers: Number(data.followers_count ?? data.fan_count) || 0,
        posts: null,
        views: null,
    };
}

async function tiktokStats() {
    const token = await tiktokAccessToken();
    const response = await fetch(
        `${TIKTOK_API}/user/info/?fields=follower_count,video_count,likes_count`,
        { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(STATS_TIMEOUT_MS) },
    );
    const user = (await response.json()).data?.user;
    if (!user) return null;
    return {
        followers: Number(user.follower_count) || 0,
        posts: Number(user.video_count) || 0,
        views: null,
    };
}

// Returns null when the platform is not set up, so it is never counted as an
// attempt; `failed` marks one that was asked and could not answer, which is
// what separates a partial outage from a total one.
async function fetchAudienceStats() {
    const collected = await Promise.all([
        collectStats(
            'youtube',
            !isPlaceholderToken(YOUTUBE_API_KEY) && !isPlaceholderToken(YOUTUBE_CHANNEL_ID),
            youtubeStats,
        ),
        collectStats('instagram', isInstagramConfigured(), instagramStats),
        collectStats('facebook', isFacebookConfigured(), facebookStats),
        collectStats('tiktok', isTikTokApiConfigured(), tiktokStats),
    ]);

    const { platforms, asked, failed } = summariseStats(collected);

    // The isolation, the blackout rule and the null-not-zero rule all live in
    // stats.js beside the incidents that produced them.
    if (isTotalBlackout({ asked, failed })) {
        const error = new Error('Every configured platform failed to report stats');
        error.isUpstream = true;
        throw error;
    }

    const sum = (field) => sumField(platforms, field);

    return {
        totals: {
            followers: sum('followers'),
            posts: sum('posts'),
            views: sum('views'),
        },
        // The account being mirrored is the Instagram one, so its picture is
        // the one people recognise from the profile the link sits on. Null
        // when that platform is absent or did not return it, and the hero
        // falls back to initials.
        avatar: platforms.instagram?.avatar || null,
        platforms,
        connected: Object.keys(platforms),
    };
}

// Tell the caller (and any CDN in front) how the response was served.
// Our own throttle, not the platform's. 503 with Retry-After says "ask again
// later" rather than blaming an upstream that is perfectly healthy, and the
// feed already treats a configured-but-unavailable platform correctly: it
// contributes nothing to this batch and is retried on the next one.
function sendBudgetSpent(res, label) {
    res.set('Retry-After', String(Math.floor(CACHE_TTL_MS / 1000)));
    return res.status(503).json({
        configured: true,
        error: `${label} is throttled to protect its API quota; try again shortly`,
    });
}

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
        const limit = readLimit(req.query.limit);
        const cursor = readAfter(req.query.after);
        if (!cursor.ok) return res.status(400).json({ error: 'Invalid cursor' });
        const after = cursor.value;

        if (isPlaceholderToken(token) || isPlaceholderToken(IG_USER_ID)) {
            return res.status(500).json({ configured: false, error: 'Instagram not configured. Set IG_ACCESS_TOKEN and IG_USER_ID in .env' });
        }

        // Keyed by limit and cursor so different page sizes and different points
        // in the walk do not clobber each other.
        const result = await cached(
            `ig:media:${limit}:${after || 'first'}`,
            () => fetchInstagramMedia(token, { limit, after }),
            { ttlMs: CACHE_TTL_MS, budget: 'instagram' }
        );

        return sendCached(res, result);
    } catch (error) {
        if (error instanceof BudgetExceededError) return sendBudgetSpent(res, 'Instagram');
        const { status, kind } = classifyUpstream(error);
        console.error(`Error fetching Instagram media (${kind}):`, error.message);
        return res.status(status).json(describeUpstreamFailure('Instagram', kind, error.message));
    }
});

// Both diagnostics are gated here rather than inside each handler, so a route
// added to this list cannot forget the check. Registered before them, because
// express runs matching handlers in registration order.
app.get(['/api/cache/stats', '/api/instagram/status'], diagnosticsGuard(DIAGNOSTICS_ENABLED));

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

// Endpoint: get YouTube uploads
app.get('/api/youtube/videos', async (req, res) => {
    try {
        const limit = readLimit(req.query.limit);
        const cursor = readAfter(req.query.after);
        if (!cursor.ok) return res.status(400).json({ error: 'Invalid cursor' });
        const after = cursor.value;

        if (isPlaceholderToken(YOUTUBE_API_KEY) || isPlaceholderToken(YOUTUBE_CHANNEL_ID)) {
            return res.status(500).json({ configured: false, error: 'YouTube not configured. Set YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID in .env' });
        }

        const result = await cached(
            `yt:videos:${limit}:${after || 'first'}`,
            () => fetchYouTubeVideos({ limit, after }),
            { ttlMs: CACHE_TTL_MS, budget: 'youtube' }
        );

        return sendCached(res, result);
    } catch (error) {
        if (error instanceof BudgetExceededError) return sendBudgetSpent(res, 'YouTube');
        console.error('Error fetching YouTube videos:', error.message);
        const { status, kind } = classifyUpstream(error);
        return res.status(status).json(describeUpstreamFailure('YouTube', kind, error.message));
    }
});

// Endpoint: get Facebook Page posts
app.get('/api/facebook/posts', async (req, res) => {
    try {
        const limit = readLimit(req.query.limit);
        const cursor = readAfter(req.query.after);
        if (!cursor.ok) return res.status(400).json({ error: 'Invalid cursor' });
        const after = cursor.value;

        if (!isFacebookConfigured()) {
            return res.status(500).json({ configured: false, error: 'Facebook not configured. Set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN in .env' });
        }

        const result = await cached(
            `fb:posts:${limit}:${after || 'first'}`,
            () => fetchFacebookPosts({ limit, after }),
            { ttlMs: CACHE_TTL_MS, budget: 'facebook' }
        );

        return sendCached(res, result);
    } catch (error) {
        if (error instanceof BudgetExceededError) return sendBudgetSpent(res, 'Facebook');
        console.error('Error fetching Facebook posts:', error.message);
        const { status, kind } = classifyUpstream(error);
        return res.status(status).json(describeUpstreamFailure('Facebook', kind, error.message));
    }
});

// Endpoint: get TikTok posts
app.get('/api/tiktok/posts', async (req, res) => {
    try {
        const limit = readLimit(req.query.limit);

        // The Display API lists the account's videos and carries engagement
        // counts, so it wins when configured. oEmbed needs no credentials but
        // only resolves the post URLs it is given.
        const useApi = isTikTokApiConfigured();

        if (!useApi && TIKTOK_POST_URLS.length === 0) {
            return res.status(500).json({
                configured: false,
                error: 'TikTok not configured. Set TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET and '
                    + 'TIKTOK_REFRESH_TOKEN for the Display API, or TIKTOK_POST_URLS for oEmbed.',
            });
        }

        const result = await cached(
            useApi ? `tiktok:api:${limit}` : `tiktok:oembed:${limit}`,
            () => (useApi ? fetchTikTokVideos({ limit }) : fetchTikTokPosts({ limit })),
            { ttlMs: CACHE_TTL_MS, budget: 'tiktok' }
        );

        res.set('X-TikTok-Source', useApi ? 'display-api' : 'oembed');
        return sendCached(res, result);
    } catch (error) {
        if (error instanceof BudgetExceededError) return sendBudgetSpent(res, 'TikTok');
        console.error('Error fetching TikTok posts:', error.message);
        return res.status(502).json({ error: 'TikTok error', message: error.message });
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
if (isDirectRun) {
    app.listen(PORT, () => {
        console.log(`API Server running on http://localhost:${PORT}`);
        console.log(`Instagram: ${isInstagramConfigured() ? 'Configured' : 'NOT CONFIGURED - set IG_ACCESS_TOKEN and IG_USER_ID in .env'}`);
        console.log(`YouTube API key: ${isPlaceholderToken(YOUTUBE_API_KEY) ? 'NOT CONFIGURED - set YOUTUBE_API_KEY in .env' : 'Configured'}`);
    console.log(`TikTok: ${isTikTokApiConfigured()
        ? 'Display API configured'
        : TIKTOK_POST_URLS.length
            ? `oEmbed, ${TIKTOK_POST_URLS.length} post(s) configured`
            : 'NOT CONFIGURED - set the Display API keys or TIKTOK_POST_URLS in .env'}`);
    console.log(`Facebook: ${isFacebookConfigured() ? 'Configured' : 'NOT CONFIGURED - set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN in .env'}`);
    });
}

export default app;