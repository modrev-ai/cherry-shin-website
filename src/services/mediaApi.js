// Media API service - fetches mixed content from all social platforms.
//
// Sample content below is a placeholder for a platform that has no credentials
// yet. It deliberately carries no engagement counts and no dates: those were
// invented figures in the tens of thousands, published on a branded site beside
// real ones, which overstated the account's reach. A sample says only what it
// honestly can - a platform, a title, a picture - and the card labels it.

// Relative by default so the deployed site talks to its own origin. Set
// VITE_API_BASE at build time when the backend lives elsewhere. In dev, Vite
// proxies /api to the backend port (see vite.config.js).
export const API_BASE = import.meta.env.VITE_API_BASE || '/api';

const tiktokContent = [
    {
        id: 'tt1',
        platform: 'tiktok',
        isSample: true,
        title: 'Outfit of the Day ✨',
        thumbnail: 'https://picsum.photos/seed/cs1/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt3',
        platform: 'tiktok',
        isSample: true,
        title: 'GRWM for date night 💕',
        thumbnail: 'https://picsum.photos/seed/cs3/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt5',
        platform: 'tiktok',
        isSample: true,
        title: 'Korean street style inspo',
        thumbnail: 'https://picsum.photos/seed/cs5/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt7',
        platform: 'tiktok',
        isSample: true,
        title: 'Try-on haul from Zara',
        thumbnail: 'https://picsum.photos/seed/cs7/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt9',
        platform: 'tiktok',
        isSample: true,
        title: 'My morning routine 🌅',
        thumbnail: 'https://picsum.photos/seed/cs9/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt11',
        platform: 'tiktok',
        isSample: true,
        title: 'Bag essentials 🔑',
        thumbnail: 'https://picsum.photos/seed/cs11/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt13',
        platform: 'tiktok',
        isSample: true,
        title: 'Lipstick try-on 💄',
        thumbnail: 'https://picsum.photos/seed/cs13/400/700',
        embedUrl: null,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
];

const youtubeContent = [
    {
        id: 'yt2',
        platform: 'youtube',
        isSample: true,
        title: 'WHAT I WEAR IN A WEEK | VLOG',
        thumbnail: 'https://picsum.photos/seed/cy2/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt4',
        platform: 'youtube',
        isSample: true,
        title: 'GET READY WITH ME | First Date',
        thumbnail: 'https://picsum.photos/seed/cy4/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt6',
        platform: 'youtube',
        isSample: true,
        title: 'SEOUL VLOG | Coffee & Shopping',
        thumbnail: 'https://picsum.photos/seed/cy6/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt8',
        platform: 'youtube',
        isSample: true,
        title: 'MY SKINCARE ROUTINE 2024',
        thumbnail: 'https://picsum.photos/seed/cy8/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt10',
        platform: 'youtube',
        isSample: true,
        title: 'HAUL | Spring Collection 2024',
        thumbnail: 'https://picsum.photos/seed/cy10/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        url: 'https://www.youtube.com/@cherryshin'
    },
];

const instagramContent = [
    {
        id: 'ig1',
        platform: 'instagram',
        isSample: true,
        title: 'Golden hour vibes 🌅',
        thumbnail: 'https://picsum.photos/seed/ci1/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig3',
        platform: 'instagram',
        isSample: true,
        title: 'New hair who dis?',
        thumbnail: 'https://picsum.photos/seed/ci3/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig5',
        platform: 'instagram',
        isSample: true,
        title: 'Coffee date ☕',
        thumbnail: 'https://picsum.photos/seed/ci5/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig7',
        platform: 'instagram',
        isSample: true,
        title: 'Sunset in Myeongdong',
        thumbnail: 'https://picsum.photos/seed/ci7/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig9',
        platform: 'instagram',
        isSample: true,
        title: 'Weekend brunch goals 🥐',
        thumbnail: 'https://picsum.photos/seed/ci9/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig11',
        platform: 'instagram',
        isSample: true,
        title: 'Airport look ✈️',
        thumbnail: 'https://picsum.photos/seed/ci11/400/400',
        embedUrl: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
];

const facebookContent = [
    {
        id: 'fb1',
        platform: 'facebook',
        isSample: true,
        title: 'Behind the scenes at the Seoul shoot',
        thumbnail: 'https://picsum.photos/seed/csfb1/600/750',
        embedUrl: null,
        url: 'https://www.facebook.com/itscherryshin'
    },
    {
        id: 'fb2',
        platform: 'facebook',
        isSample: true,
        title: 'Thank you all for the support ❤️',
        thumbnail: 'https://picsum.photos/seed/csfb2/600/750',
        embedUrl: null,
        url: 'https://www.facebook.com/itscherryshin'
    },
    {
        id: 'fb3',
        platform: 'facebook',
        isSample: true,
        title: 'Live Q&A recap — skincare edition',
        thumbnail: 'https://picsum.photos/seed/csfb3/600/750',
        embedUrl: null,
        url: 'https://www.facebook.com/itscherryshin'
    },
    {
        id: 'fb4',
        platform: 'facebook',
        isSample: true,
        title: 'Spring lookbook album',
        thumbnail: 'https://picsum.photos/seed/csfb4/600/750',
        embedUrl: null,
        url: 'https://www.facebook.com/itscherryshin'
    },
];

const twitterContent = [
    {
        id: 'tw1',
        platform: 'twitter',
        isSample: true,
        title: 'currently accepting cafe recommendations in Seoul ☕',
        thumbnail: 'https://picsum.photos/seed/cstw1/800/450',
        embedUrl: null,
        url: 'https://x.com/itscherryshin'
    },
    {
        id: 'tw2',
        platform: 'twitter',
        isSample: true,
        title: 'new video is live — go watch it before I overthink it',
        thumbnail: 'https://picsum.photos/seed/cstw2/800/450',
        embedUrl: null,
        url: 'https://x.com/itscherryshin'
    },
    {
        id: 'tw3',
        platform: 'twitter',
        isSample: true,
        title: 'packing for Tokyo, taking outfit requests',
        thumbnail: 'https://picsum.photos/seed/cstw3/800/450',
        embedUrl: null,
        url: 'https://x.com/itscherryshin'
    },
    {
        id: 'tw4',
        platform: 'twitter',
        isSample: true,
        title: 'the lighting did most of the work here honestly',
        thumbnail: 'https://picsum.photos/seed/cstw4/800/450',
        embedUrl: null,
        url: 'https://x.com/itscherryshin'
    },
];

// Combine all content into a single pool
const allContent = [
    ...tiktokContent,
    ...youtubeContent,
    ...instagramContent,
    ...facebookContent,
    ...twitterContent,
];

// Small deterministic PRNG. Pagination slices a window out of an ordering, so
// that ordering has to stay put across the pages being sliced from it - with
// Math.random every page reshuffled and the offsets pointed into unrelated
// permutations, which repeated some posts and skipped others entirely.
function mulberry32(seed) {
    let a = seed >>> 0;
    return function random() {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffleArray(array, random = Math.random) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Round-robin across platforms so consecutive posts come from different sources:
// Instagram, then TikTok, then Facebook, and so on. Within a platform the order
// is shuffled, and the platform order rotates too, so the feed varies between
// cycles. Pass a seeded `random` to get the same ordering back for every page of
// one cycle; the default keeps callers that want a one-off shuffle.
function interleaveByPlatform(items, random = Math.random) {
    const byPlatform = new Map();
    for (const item of items) {
        if (!byPlatform.has(item.platform)) byPlatform.set(item.platform, []);
        byPlatform.get(item.platform).push(item);
    }

    const queues = shuffleArray([...byPlatform.values()], random)
        .map(queue => shuffleArray(queue, random));

    const ordered = [];
    let placed = true;
    while (placed) {
        placed = false;
        for (const queue of queues) {
            const next = queue.shift();
            if (next) {
                ordered.push(next);
                placed = true;
            }
        }
    }
    return ordered;
}

const ITEMS_PER_PAGE = 6;

// How many posts to pull from each platform. The same window is requested on
// every page, so the pool stays a fixed size and the cycle walk below can rely
// on its length.
//
// Measured against the live APIs before settling on 25: a cold fetch at 25 costs
// no more than at 12 (~3s, bounded by Facebook, which varies that much on its
// own regardless of size), while 50 roughly doubles the wait for the first
// visitor after a cold start. Quota is flat either way - videos.list takes up to
// 50 ids in a single call. Reaching the rest of the catalogue needs cursor
// pagination rather than a bigger window; the server already returns the tokens
// for it.
const PER_PLATFORM = 25;

// The ordering for one pass over the pool. Seeded by cycle, so every page of a
// cycle rebuilds the same sequence and pagination can walk it.
//
// Once the pool is exhausted the feed necessarily starts repeating - there is
// nothing else to show. What it must not do is repeat across the join, where
// the last post of one pass would land immediately before the first of the
// next and read as a stutter on two consecutive slides. Swapping the opening
// pair when that happens avoids it, and leaves the tail alone so the next
// cycle's comparison stays valid.
function orderingForCycle(pool, cycle) {
    const ordered = interleaveByPlatform(pool, mulberry32(cycle + 1));
    if (cycle === 0 || ordered.length < 3) return ordered;

    const previous = interleaveByPlatform(pool, mulberry32(cycle));
    if (ordered[0].id !== previous[previous.length - 1].id) return ordered;

    const swapped = [...ordered];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    return swapped;
}

// A platform contributes its real posts once it is configured, and samples only
// while it is not. Once it goes live its samples stop being served entirely,
// including on the days it happens to return nothing.
function withSamples({ items, configured }, samples) {
    if (configured) return items;
    return samples;
}

// Pulls one platform's feed from the backend. The server normalises every
// platform into the same item shape, so nothing needs remapping here. An
// unconfigured or unreachable endpoint yields an empty list and the caller
// falls back to mock content for that platform only.
// Raised when the backend itself cannot be reached, as opposed to a platform
// simply not being configured yet. The two need different handling: an
// unconfigured platform falls back to sample content, whereas an unreachable
// backend must surface as an error rather than quietly showing invented posts.
export class BackendUnreachableError extends Error {
    constructor(cause) {
        super('Backend unreachable');
        this.name = 'BackendUnreachableError';
        this.cause = cause;
    }
}

// Resolves to { items, configured }. The flag matters as much as the items: a
// platform that has no credentials falls back to samples, whereas one that is
// configured but whose upstream is failing contributes nothing. Replacing real
// posts with invented ones during an outage would be the worst of both.
async function fetchLive(path, label) {
    let response;
    try {
        response = await fetch(`${API_BASE}${path}`);
    } catch (err) {
        // fetch only rejects on a network-level failure
        throw new BackendUnreachableError(err);
    }

    if (!response.ok) {
        // A dead backend usually surfaces as a 5xx from whatever proxy sits in
        // front of it, not as a network error, so the status alone cannot tell
        // the two apart. Our own error responses are JSON with an `error` key;
        // a proxy's are not. Use that to distinguish "platform not configured"
        // from "nothing is answering behind the proxy".
        let body = null;
        try {
            body = await response.json();
        } catch {
            throw new BackendUnreachableError(new Error(`Bad gateway (${response.status})`));
        }

        if (!body || typeof body.error !== 'string') {
            throw new BackendUnreachableError(new Error(`Unexpected response (${response.status})`));
        }

        console.warn(`${label} unavailable (${response.status}): ${body.error}`);
        // The server flags a missing-credentials response explicitly. Anything
        // else - an upstream 502, say - means the platform is set up and simply
        // not answering right now.
        return { items: [], configured: body.configured !== false };
    }

    const data = await response.json();
    return { items: data.data || [], configured: true };
}

export async function fetchMixedMedia(page = 0) {
    try {
        const [instagram, youtube, tiktok, facebook] = await Promise.all([
            fetchLive(`/instagram/media?limit=${PER_PLATFORM}`, 'Instagram'),
            fetchLive(`/youtube/videos?limit=${PER_PLATFORM}`, 'YouTube'),
            fetchLive(`/tiktok/posts?limit=${PER_PLATFORM}`, 'TikTok'),
            fetchLive(`/facebook/posts?limit=${PER_PLATFORM}`, 'Facebook'),
        ]);

        // Live data where a platform is connected, samples only where it has no
        // credentials at all, so the feed stays whole while the remaining
        // platforms are still being set up. Note the test is `configured`, not
        // item count: a connected platform that returns nothing this minute
        // shows nothing, rather than reverting to invented posts under its own
        // name. X has no integration at all, so it is always sampled.
        const pool = [
            ...withSamples(tiktok, tiktokContent),
            ...withSamples(facebook, facebookContent),
            ...twitterContent,
            ...withSamples(youtube, youtubeContent),
            ...withSamples(instagram, instagramContent),
        ];

        // Simulate slight delay for smooth UX
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

        if (pool.length === 0) return [];

        // Endless scrolling walks the pool one page at a time, then starts a new
        // cycle in a different order. Seeding the shuffle from the cycle number
        // is what makes the walk coherent: every page of a cycle rebuilds the
        // same ordering, so page 2 genuinely continues where page 1 stopped
        // instead of slicing into an unrelated permutation.
        const pagesPerCycle = Math.ceil(pool.length / ITEMS_PER_PAGE);
        const cycle = Math.floor(page / pagesPerCycle);
        const ordered = orderingForCycle(pool, cycle);

        // The last page of a cycle is short rather than padded from the front,
        // which would show a post twice in the same pass. Slicing past the end
        // simply yields fewer items, and the next page opens the next cycle.
        const start = (page % pagesPerCycle) * ITEMS_PER_PAGE;

        // cycleId keeps React keys unique when a post comes round again.
        return ordered
            .slice(start, start + ITEMS_PER_PAGE)
            .map((item, offset) => ({ ...item, cycleId: `${page}-${start + offset}` }));
    } catch (error) {
        // A dead backend must reach the UI so it can offer a retry, rather than
        // being flattened into "no more content" or masked by sample posts.
        if (error instanceof BackendUnreachableError) throw error;
        console.error('fetchMixedMedia error:', error);
        return [];
    }
}

export async function fetchMediaByPlatform(platform, page = 0) {
    await new Promise(resolve => setTimeout(resolve, 600));

    const filtered = allContent.filter(item => item.platform === platform);
    const start = (page % Math.ceil(filtered.length / ITEMS_PER_PAGE)) * ITEMS_PER_PAGE;

    return filtered.slice(start, start + ITEMS_PER_PAGE);
}

export function getAllMedia() {
    return shuffleArray(allContent);
}