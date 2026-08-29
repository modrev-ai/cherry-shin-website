// The two parts of the TikTok oEmbed path worth testing, separated from the
// fetch so they can be.
//
// oEmbed is the credential-free route: give it a post URL, get back a title,
// a thumbnail and an embed id. It resolves one post at a time and cannot list a
// profile, so the posts to mirror are named explicitly in TIKTOK_POST_URLS —
// which is why this is curated rather than mirrored, and why a new post does
// not appear until its URL is added.

// oEmbed carries no engagement figures and no publish date, so those fields are
// left unset rather than invented. A card that shows nothing is honest; a card
// showing a zero it made up is not.
//
// Returns null rather than throwing when the payload is unusable, because the
// caller drops a null and keeps the rest of the batch.
export function itemFromOEmbed(data, postUrl) {
    const videoId = data?.embed_product_id;
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
        // Unknown dimensions fall to portrait, which is the shape almost every
        // TikTok is and the one the feed is built around. Guessing landscape
        // would letterbox a full-screen card.
        orientation: width && height && width > height ? 'landscape' : 'portrait',
        url: postUrl,
    };
}

// A post that fails to resolve is dropped instead of failing the whole feed: a
// deleted or private video should cost one card, not all of them. `allSettled`
// rather than `all` is the whole point — one rejection must not take the batch.
//
// `fetchOne` is injected so this can be tested without the network.
export async function collectPosts(urls, fetchOne) {
    const settled = await Promise.allSettled(urls.map(fetchOne));
    const items = settled
        .filter(result => result.status === 'fulfilled' && result.value)
        .map(result => result.value);

    return { items, dropped: urls.length - items.length };
}
