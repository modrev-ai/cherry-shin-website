// Media API service - fetches mixed content from all social platforms
// Integrates with backend server for Instagram API, uses mock data for TikTok/YouTube

const API_BASE = 'http://localhost:3001/api';

const tiktokContent = [
    {
        id: 'tt1',
        platform: 'tiktok',
        title: 'Outfit of the Day ✨',
        thumbnail: 'https://picsum.photos/seed/cs1/400/700',
        embedUrl: null,
        date: '2 days ago',
        likes: 45200,
        views: 890000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt3',
        platform: 'tiktok',
        title: 'GRWM for date night 💕',
        thumbnail: 'https://picsum.photos/seed/cs3/400/700',
        embedUrl: null,
        date: '5 days ago',
        likes: 38100,
        views: 720000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt5',
        platform: 'tiktok',
        title: 'Korean street style inspo',
        thumbnail: 'https://picsum.photos/seed/cs5/400/700',
        embedUrl: null,
        date: '1 week ago',
        likes: 52300,
        views: 950000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt7',
        platform: 'tiktok',
        title: 'Try-on haul from Zara',
        thumbnail: 'https://picsum.photos/seed/cs7/400/700',
        embedUrl: null,
        date: '1 week ago',
        likes: 29800,
        views: 540000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt9',
        platform: 'tiktok',
        title: 'My morning routine 🌅',
        thumbnail: 'https://picsum.photos/seed/cs9/400/700',
        embedUrl: null,
        date: '2 weeks ago',
        likes: 61200,
        views: 1100000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt11',
        platform: 'tiktok',
        title: 'Bag essentials 🔑',
        thumbnail: 'https://picsum.photos/seed/cs11/400/700',
        embedUrl: null,
        date: '2 weeks ago',
        likes: 44800,
        views: 820000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
    {
        id: 'tt13',
        platform: 'tiktok',
        title: 'Lipstick try-on 💄',
        thumbnail: 'https://picsum.photos/seed/cs13/400/700',
        embedUrl: null,
        date: '3 weeks ago',
        likes: 37500,
        views: 680000,
        url: 'https://www.tiktok.com/@itscherryshin'
    },
];

const youtubeContent = [
    {
        id: 'yt2',
        platform: 'youtube',
        title: 'WHAT I WEAR IN A WEEK | VLOG',
        thumbnail: 'https://picsum.photos/seed/cy2/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        date: '3 days ago',
        likes: 28400,
        views: 456000,
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt4',
        platform: 'youtube',
        title: 'GET READY WITH ME | First Date',
        thumbnail: 'https://picsum.photos/seed/cy4/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        date: '1 week ago',
        likes: 31200,
        views: 523000,
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt6',
        platform: 'youtube',
        title: 'SEOUL VLOG | Coffee & Shopping',
        thumbnail: 'https://picsum.photos/seed/cy6/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        date: '2 weeks ago',
        likes: 42100,
        views: 678000,
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt8',
        platform: 'youtube',
        title: 'MY SKINCARE ROUTINE 2024',
        thumbnail: 'https://picsum.photos/seed/cy8/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        date: '3 weeks ago',
        likes: 35600,
        views: 589000,
        url: 'https://www.youtube.com/@cherryshin'
    },
    {
        id: 'yt10',
        platform: 'youtube',
        title: 'HAUL | Spring Collection 2024',
        thumbnail: 'https://picsum.photos/seed/cy10/400/225',
        embedUrl: 'https://www.youtube.com/embed/S9055cJQs6I',
        date: '1 month ago',
        likes: 27300,
        views: 412000,
        url: 'https://www.youtube.com/@cherryshin'
    },
];

const instagramContent = [
    {
        id: 'ig1',
        platform: 'instagram',
        title: 'Golden hour vibes 🌅',
        thumbnail: 'https://picsum.photos/seed/ci1/400/400',
        embedUrl: null,
        date: '1 day ago',
        likes: 89200,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig3',
        platform: 'instagram',
        title: 'New hair who dis?',
        thumbnail: 'https://picsum.photos/seed/ci3/400/400',
        embedUrl: null,
        date: '4 days ago',
        likes: 76500,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig5',
        platform: 'instagram',
        title: 'Coffee date ☕',
        thumbnail: 'https://picsum.photos/seed/ci5/400/400',
        embedUrl: null,
        date: '1 week ago',
        likes: 92100,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig7',
        platform: 'instagram',
        title: 'Sunset in Myeongdong',
        thumbnail: 'https://picsum.photos/seed/ci7/400/400',
        embedUrl: null,
        date: '2 weeks ago',
        likes: 68400,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig9',
        platform: 'instagram',
        title: 'Weekend brunch goals 🥐',
        thumbnail: 'https://picsum.photos/seed/ci9/400/400',
        embedUrl: null,
        date: '2 weeks ago',
        likes: 81700,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
    {
        id: 'ig11',
        platform: 'instagram',
        title: 'Airport look ✈️',
        thumbnail: 'https://picsum.photos/seed/ci11/400/400',
        embedUrl: null,
        date: '3 weeks ago',
        likes: 95300,
        views: null,
        url: 'https://www.instagram.com/itscherryshin/'
    },
];

// Combine all content into a single pool
const allContent = [...tiktokContent, ...youtubeContent, ...instagramContent];

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

const ITEMS_PER_PAGE = 6;

export async function fetchMixedMedia(page = 0) {
    try {
        // Fetch Instagram media from backend API
        let instagramItems = [];
        try {
            const response = await fetch(`${API_BASE}/instagram/media?limit=${ITEMS_PER_PAGE * 2}`);
            if (response.ok) {
                const data = await response.json();
                instagramItems = (data.data || []).map(item => ({
                    ...item,
                    platform: 'instagram',
                }));
            }
        } catch (err) {
            console.warn('Failed to fetch Instagram from API, using mock data:', err);
        }

        // Combine mock TikTok/YouTube with real or mock Instagram
        const mockContent = instagramItems.length > 0
            ? [...tiktokContent, ...youtubeContent, ...instagramItems]
            : allContent;

        // Simulate slight delay for smooth UX
        await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 300));

        // Endless scrolling: cycle through the content pool with fresh shuffle each page
        const shuffled = shuffleArray(mockContent);

        // If we've cycled through all items, start over with a new shuffle
        const start = (page % Math.ceil(mockContent.length / ITEMS_PER_PAGE)) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;

        // If we need more items than the pool, wrap around
        let result = [];
        for (let i = start; i < end; i++) {
            const idx = i % mockContent.length;
            // Add a unique suffix to prevent React key conflicts on repeat cycles
            const item = { ...shuffled[idx], cycleId: `${page}-${i}` };
            result.push(item);
        }

        return result;
    } catch (error) {
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