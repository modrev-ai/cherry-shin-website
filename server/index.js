import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Helper: save token cache
async function saveTokenCache(cache) {
    await writeFile(TOKEN_CACHE_FILE, JSON.stringify(cache, null, 2));
}

// Instagram Graph API base URL
const IG_API = 'https://graph.facebook.com/v18.0';

// Endpoint: get Instagram media
app.get('/api/instagram/media', async (req, res) => {
    try {
        const cache = await loadTokenCache();
        const token = cache.accessToken;
        const limit = req.query.limit || 12;

        if (isPlaceholderToken(token)) {
            return res.status(500).json({ error: 'No Instagram access token configured. Set IG_ACCESS_TOKEN in .env' });
        }

        const url = `${IG_API}/${IG_USER_ID}/media` +
            `?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink` +
            `&limit=${limit}` +
            `&access_token=${token}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            // Token might be expired - try to return cached results
            console.error('Instagram API error:', data.error.message);
            return res.status(500).json({
                error: 'Instagram API error',
                message: data.error.message,
                hint: 'Token may be expired. Visit https://developers.facebook.com/tools/explorer/ to refresh it.'
            });
        }

        // Transform Instagram response to our format
        const items = (data.data || []).map(item => ({
            id: item.id,
            platform: 'instagram',
            title: item.caption || 'Instagram Post',
            thumbnail: item.thumbnail_url || item.media_url,
            mediaUrl: item.media_url,
            mediaType: item.media_type, // PHOTO, VIDEO, CAROUSELAlbum
            embedUrl: item.permalink,
            date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '',
            likes: item.like_count || 0,
            views: null,
            comments: item.comments_count || 0,
            url: item.permalink,
        }));

        res.json({
            data: items,
            paging: data.paging || null,
        });
    } catch (error) {
        console.error('Error fetching Instagram media:', error);
        res.status(500).json({ error: 'Failed to fetch Instagram media' });
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
        const cache = await loadTokenCache();

        if (isPlaceholderToken(cache.accessToken)) {
            return res.status(500).json({ error: 'No Instagram access token configured. Set IG_ACCESS_TOKEN in .env' });
        }

        if (!cursor) {
            return res.status(400).json({ error: 'Cursor required' });
        }

        const url = `${IG_API}/${IG_USER_ID}/media` +
            `?fields=id,media_type,media_url,thumbnail_url,caption,timestamp,like_count,comments_count,permalink` +
            `&limit=12` +
            `&after=${cursor}` +
            `&access_token=${cache.accessToken}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            return res.status(500).json({ error: data.error.message });
        }

        const items = (data.data || []).map(item => ({
            id: item.id,
            platform: 'instagram',
            title: item.caption || 'Instagram Post',
            thumbnail: item.thumbnail_url || item.media_url,
            mediaUrl: item.media_url,
            mediaType: item.media_type,
            embedUrl: item.permalink,
            date: item.timestamp ? new Date(item.timestamp).toLocaleDateString() : '',
            likes: item.like_count || 0,
            views: null,
            comments: item.comments_count || 0,
            url: item.permalink,
        }));

        res.json({
            data: items,
            paging: data.paging || null,
        });
    } catch (error) {
        console.error('Error fetching next page:', error);
        res.status(500).json({ error: 'Failed to fetch next page' });
    }
});

app.listen(PORT, () => {
    console.log(`API Server running on http://localhost:${PORT}`);
    console.log(`Instagram token: ${isPlaceholderToken(IG_ACCESS_TOKEN) ? 'NOT CONFIGURED - set IG_ACCESS_TOKEN in .env' : 'Configured'}`);
});