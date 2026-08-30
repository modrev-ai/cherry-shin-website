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
//
// import.meta.env is injected by Vite and is undefined anywhere else, so the
// optional chaining is what lets a plain `node` process import this file at
// all - without it the module throws on load and none of it can be tested.
export const API_BASE = import.meta.env?.VITE_API_BASE || '/api';

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

// How many posts to pull from each platform per batch. The walk asks for the
// next batch only when the reader gets close to the end of what is loaded.
//
// Measured against the live APIs before settling on 25: a cold batch at 25 costs
// no more than at 12 (~3s, bounded by Facebook, which varies that much on its
// own regardless of size), while 50 roughly doubles the wait for the first
// visitor after a cold start. Quota is flat either way - videos.list takes up to
// 50 ids in a single call.
const PER_PLATFORM = 25;

// Consecutive failed batches before a platform is dropped from the walk.
const MAX_PLATFORM_FAILURES = 3;

// How long to wait for one platform before giving up on it for this batch.
//
// The four platforms are fetched together, so without a bound the first page
// waits for the slowest: a cold Facebook was measured at 20s, because it probes
// embeddability once per post and there is no API field that reports it. The
// other three answer in 1-3s, so a reader was watching a spinner for twenty
// seconds to get posts that had been ready for seventeen.
//
// Nothing is lost by cutting it off. The abort is client-side only - the server
// finishes the work and caches it - so the platform simply joins on the next
// extension, by which point its batch is already warm.
const PLATFORM_TIMEOUT_MS = 6000;

// Each live platform, with the sample content that stands in for it while it has
// no credentials. X was dropped rather than left as a permanently sampled tile
// (MRO-242), so nothing is injected outside this list any more.
const PLATFORMS = [
    { key: 'instagram', label: 'Instagram', path: '/instagram/media', samples: instagramContent },
    { key: 'youtube', label: 'YouTube', path: '/youtube/videos', samples: youtubeContent },
    { key: 'tiktok', label: 'TikTok', path: '/tiktok/posts', samples: tiktokContent },
    { key: 'facebook', label: 'Facebook', path: '/facebook/posts', samples: facebookContent },
];

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

// Resolves to { ok, items, configured, next }. The flags matter as much as the
// items: a platform that has no credentials falls back to samples, whereas one
// that is configured but whose upstream is failing contributes nothing.
// Replacing real posts with invented ones during an outage would be the worst
// of both. `next` is the cursor to ask for after this batch, absent once the
// platform has nothing more; the server normalises every platform to that one
// shape.
//
// `ok` separates "answered, and there is nothing more" from "did not answer".
// Both used to arrive as a missing cursor, and since a missing cursor is how
// the walk records exhaustion, a single failed batch retired the platform for
// the rest of the session.

// A timeout aborts the exchange; which call rejects depends on how far it had
// got, so the name is the only reliable signal.
const isAbort = (err) => err?.name === 'TimeoutError' || err?.name === 'AbortError';

async function fetchLive(path, label) {
    try {
        const response = await fetch(`${API_BASE}${path}`, {
            signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS),
        });

        if (!response.ok) {
            // A dead backend usually surfaces as a 5xx from whatever proxy sits
            // in front of it, not as a network error, so the status alone cannot
            // tell the two apart. Our own error responses are JSON with an
            // `error` key; a proxy's are not. Use that to distinguish "platform
            // not configured" from "nothing is answering behind the proxy".
            let body = null;
            try {
                body = await response.json();
            } catch (err) {
                if (isAbort(err)) throw err;
                throw new BackendUnreachableError(new Error(`Bad gateway (${response.status})`));
            }

            if (!body || typeof body.error !== 'string') {
                throw new BackendUnreachableError(new Error(`Unexpected response (${response.status})`));
            }

            console.warn(`${label} unavailable (${response.status}): ${body.error}`);
            // The server flags a missing-credentials response explicitly.
            // Anything else - an upstream 502, say - means the platform is set
            // up and simply not answering right now.
            return { ok: false, items: [], configured: body.configured !== false, next: null };
        }

        const data = await response.json();

        // A platform with no credentials is a valid answer, not a failure, so it
        // arrives as a plain 200 carrying the flag (MRO-355). The flag has to be
        // read here as well as on the error path above. A 200 that is not read
        // for it lands as "configured, healthy, zero items", which takes neither
        // the outage branch nor the samples branch - the platform would drop out
        // of the feed silently, with nothing anywhere saying why.
        //
        // Reading it on both paths also means this is correct against a server
        // that still answers 500, which is what makes the two safe to deploy in
        // either order.
        if (data?.configured === false) {
            return { ok: false, items: [], configured: false, next: null };
        }

        return { ok: true, items: data.data || [], configured: true, next: data.paging?.next || null };
    } catch (err) {
        // The timeout can land anywhere in the exchange, not only on the fetch
        // itself - aborting while the body is still being read rejects the
        // json() call instead. Catching it around the whole exchange is what
        // makes that safe; catching only the fetch let an AbortError escape and
        // empty the entire feed, because the caller reads any unrecognised
        // error as "no more content".
        if (isAbort(err)) {
            console.warn(`${label} exceeded ${PLATFORM_TIMEOUT_MS}ms; it will be retried`);
            return { ok: false, items: [], configured: true, next: null };
        }
        if (err instanceof BackendUnreachableError) throw err;
        // fetch otherwise rejects only on a network-level failure
        throw new BackendUnreachableError(err);
    }
}

// The feed is a stream that is extended on demand, not a fixed pool sliced by
// modulo arithmetic. Page N is served from stream[6N..6N+5]; when the stream is
// too short it is extended, first by fetching the next batch from every platform
// that still has a cursor, and only once the catalogue is exhausted by appending
// another ordering of everything collected.
//
// Cursors are opaque and cannot be jumped to, so the position in the walk has to
// be remembered here rather than derived from the page number.
const feed = {
    stream: [],          // items in serving order
    pool: [],            // everything collected, reordered for cycling at the end
    cursors: {},         // platform key -> cursor to ask for next; null once done
    sampled: new Set(),  // platforms whose sample content has been added
    failures: {},        // platform key -> consecutive failed batches
    pages: new Map(),    // page -> items, so a repeated call never re-walks
    cycles: 0,
};

// Extensions are serialised. StrictMode double-invokes effects and a retry can
// land while a fetch is in flight; without this two callers could both extend
// and append the same batch twice.
let queue = Promise.resolve();

// Never put the same post on two consecutive slides. Once the catalogue runs out
// the feed has to repeat - there is nothing else to show - but a post landing
// directly after itself reads as a stutter rather than a loop.
function appendToStream(items) {
    if (!items.length) return;
    const last = feed.stream[feed.stream.length - 1];
    const next = [...items];
    if (last && next[0].id === last.id && next.length > 1) {
        [next[0], next[1]] = [next[1], next[0]];
    }
    feed.stream.push(...next);
}

// Returns false only when there is nothing left to add at all, which stops the
// caller looping forever on an empty feed.
async function extendStream() {
    const active = PLATFORMS.filter(platform => feed.cursors[platform.key] !== null);

    if (active.length) {
        const results = await Promise.all(active.map(async platform => {
            const cursor = feed.cursors[platform.key];
            const query = `?limit=${PER_PLATFORM}` + (cursor ? `&after=${encodeURIComponent(cursor)}` : '');
            return { platform, ...await fetchLive(platform.path + query, platform.label) };
        }));

        const batch = [];
        for (const { platform, ok, items, configured, next } of results) {
            if (configured && !ok) {
                // Answered with an error rather than with posts. Leave the
                // cursor alone so the next extension asks for this same batch
                // again - the server's cache backs off for 30s, so a retry
                // fails fast rather than hammering a broken upstream. Give up
                // after a few tries so a genuinely dead platform is not asked
                // on every extension for the rest of the session.
                const failures = (feed.failures[platform.key] || 0) + 1;
                feed.failures[platform.key] = failures;
                if (failures >= MAX_PLATFORM_FAILURES) {
                    console.warn(`${platform.label} gave up after ${failures} failed batches`);
                    feed.cursors[platform.key] = null;
                }
                continue;
            }

            feed.failures[platform.key] = 0;

            if (!configured) {
                // No credentials at all: stand in with samples, once, and stop
                // asking. A platform that is configured but answered with
                // nothing is different - it contributes nothing rather than
                // reverting to invented posts under its own name.
                if (!feed.sampled.has(platform.key)) {
                    feed.sampled.add(platform.key);
                    batch.push(...platform.samples);
                }
                feed.cursors[platform.key] = null;
                continue;
            }
            batch.push(...items);
            // No cursor back means the catalogue is finished. TikTok oEmbed
            // never sends one, so it retires after its first batch.
            feed.cursors[platform.key] = next || null;
        }

        if (batch.length) {
            const ordered = interleaveByPlatform(batch);
            feed.pool.push(...ordered);
            appendToStream(ordered);
            return true;
        }
    }

    // Everything is exhausted, so start the catalogue again in a fresh order.
    if (feed.pool.length) {
        feed.cycles += 1;
        appendToStream(interleaveByPlatform(feed.pool, mulberry32(feed.cycles)));
        return true;
    }

    return false;
}

async function servePage(page) {
    // May have been filled by another caller while this one waited its turn.
    if (feed.pages.has(page)) return feed.pages.get(page);

    const needed = (page + 1) * ITEMS_PER_PAGE;
    while (feed.stream.length < needed) {
        if (!await extendStream()) break;
    }

    // Nothing at all - not one live item and not one sample. An unconfigured
    // platform still contributes samples, so an empty stream means every
    // CONFIGURED platform failed. That is an outage, and it must reach the UI
    // as an error: returning [] here would render as "you have reached the end".
    if (feed.stream.length === 0) {
        throw new BackendUnreachableError(new Error('no platform returned anything'));
    }

    const start = page * ITEMS_PER_PAGE;
    // cycleId keeps React keys unique when a post comes round again.
    const items = feed.stream
        .slice(start, start + ITEMS_PER_PAGE)
        .map((item, offset) => ({ ...item, cycleId: `${page}-${start + offset}` }));

    feed.pages.set(page, items);
    return items;
}

export async function fetchMixedMedia(page = 0) {
    const served = feed.pages.get(page);
    if (served) return served;

    const run = queue.then(() => servePage(page));
    // Keep the queue alive after a failure so the next page is not blocked by it.
    queue = run.catch(() => {});

    // Every failure reaches the UI so it can offer a retry. Returning an empty
    // page instead would be read as the end of the feed, which stops the scroll
    // sentinel and finishes the session - a timeout bug that returned one
    // blanked the whole site rather than costing one platform.
    //
    // That invariant used to hold by accident: X had no integration, so its
    // samples were pushed unconditionally and the pool was never empty. Dropping
    // X (MRO-242) removed that prop, so servePage now asserts it directly.
    return run;
}
