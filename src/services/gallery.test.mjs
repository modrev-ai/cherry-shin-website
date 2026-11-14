// Run with: node src/services/gallery.test.mjs
//
// The gallery's ordering and filters (TH-756), and the feed stand-ins built
// from the media library. No framework, matching the other suites.

import {
    ALL,
    describeItem,
    facetCounts,
    describePost,
    filterItems,
    formatDuration,
    groupPosts,
    orderNewestFirst,
    requestMediaLibrary,
    toFeedItem,
} from './gallery.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

// Single-child posts: postId is the id, index 0.
const item = (id, platform, kind, publishedAt, postId = id, index = 0) => ({
    id, platform, kind, publishedAt, postId, index,
    permalink: `https://example.test/${id}`,
    orientation: 'portrait',
    date: '2 days ago',
    web: { url: `/api/media/web/${id}`, width: 600, height: 800, role: kind === 'video' ? 'poster' : 'image' },
    original: { url: `/api/media/original/${id}`, width: 1080, height: 1350 },
});

const library = [
    item('ig-old', 'instagram', 'image', '2025-01-05T10:00:00.000Z'),
    item('fb-new', 'facebook', 'video', '2026-11-10T06:47:40.000Z'),
    item('ig-b', 'instagram', 'video', '2026-06-01T00:00:00.000Z'),
    item('ig-a', 'instagram', 'image', '2026-06-01T00:00:00.000Z'),
    item('bad-date', 'facebook', 'image', 'not a date'),
    item('fb-mid', 'facebook', 'image', '2026-08-15T12:00:00.000Z'),
];
const ids = list => list.map(i => i.id).join(',');

// 1. Newest first.
{
    const ordered = orderNewestFirst(library);
    check('newest first', ids(ordered) === 'fb-new,fb-mid,ig-a,ig-b,ig-old,bad-date', ids(ordered));
    check('same instant falls back to id, so the order is stable',
        ids(orderNewestFirst([...library].reverse())) === ids(ordered));
    check('an unreadable date goes last, not first', ordered[ordered.length - 1].id === 'bad-date');
    check('ordering does not mutate the input', library[0].id === 'ig-old');
}

// 2. Filters.
{
    const ordered = orderNewestFirst(library);
    check('all/all keeps everything', filterItems(ordered).length === library.length);
    check('platform filter', ids(filterItems(ordered, { platform: 'instagram' })) === 'ig-a,ig-b,ig-old');
    check('kind filter', ids(filterItems(ordered, { kind: 'video' })) === 'fb-new,ig-b');
    check('both filters at once', ids(filterItems(ordered, { platform: 'facebook', kind: 'image' })) === 'fb-mid,bad-date');
    check('filtering keeps newest-first order',
        ids(filterItems(ordered, { platform: 'facebook' })) === 'fb-new,fb-mid,bad-date');
    check('NEGATIVE: a platform with no posts gives nothing, not everything',
        filterItems(ordered, { platform: 'tiktok' }).length === 0);
}

// 3. Counts say what pressing a button would show.
{
    const all = facetCounts(library);
    check('platform counts', all.platforms.instagram === 3 && all.platforms.facebook === 3 && all.platformTotal === 6,
        JSON.stringify(all));
    check('kind counts', all.kinds.image === 4 && all.kinds.video === 2 && all.kindTotal === 6, JSON.stringify(all));
    const videos = facetCounts(library, { platform: ALL, kind: 'video' });
    check('platform counts respect the kind filter',
        videos.platforms.instagram === 1 && videos.platforms.facebook === 1, JSON.stringify(videos));
    const ig = facetCounts(library, { platform: 'instagram', kind: ALL });
    check('kind counts respect the platform filter', ig.kinds.image === 2 && ig.kinds.video === 1, JSON.stringify(ig));
}

// 4. Descriptions carry no caption text, only what the platform shows anyway.
{
    check('describeItem', describeItem(library[1]) === 'Facebook video, 10 Nov 2026', describeItem(library[1]));
    check('formatDuration', formatDuration(15.137) === '0:15' && formatDuration(75) === '1:15' && formatDuration(null) === null);
}

// 5. Library item as a feed stand-in: a real post, not a sample.
{
    const feed = toFeedItem(library[1]);
    check('a stand-in uses the web copy and the real permalink',
        feed.thumbnail === '/api/media/web/fb-new' && feed.url === 'https://example.test/fb-new' && feed.platform === 'facebook');
    check('a stand-in is not marked as a sample and claims no counts',
        !feed.isSample && feed.likes === null && feed.views === null && feed.embedUrl === null);
}

// 6. requestMediaLibrary never rejects: no library is a normal state.
{
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: false, error: 'not imported' }) });
    const off = await requestMediaLibrary();
    check('configured:false reads as not configured', off.configured === false && off.items.length === 0 && off.reason === 'not imported');

    globalThis.fetch = async () => { throw new TypeError('network down'); };
    const down = await requestMediaLibrary();
    check('a network failure reads as not configured, not a throw', down.configured === false);

    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ configured: true, data: library }) });
    const on = await requestMediaLibrary();
    check('a served library comes back whole', on.configured === true && on.items.length === library.length);
}

// 7. Carousels: children sharing a post id are one gallery item, in index
//    order, however the library lists them.
{
    const carousel = [
        item('ig:900:2', 'instagram', 'video', '2026-09-01T00:00:00.000Z', '900', 2),
        item('ig:900:0', 'instagram', 'image', '2026-09-01T00:00:00.000Z', '900', 0),
        item('ig:900:10', 'instagram', 'image', '2026-09-01T00:00:00.000Z', '900', 10),
        item('ig:900:1', 'instagram', 'image', '2026-09-01T00:00:00.000Z', '900', 1),
        // Same post id on another platform is a different post.
        item('fb:900:0', 'facebook', 'image', '2026-09-02T00:00:00.000Z', '900', 0),
    ];
    const posts = orderNewestFirst(groupPosts([...library, ...carousel]));
    check('a carousel is one item, not one per child',
        posts.length === library.length + 2, `${posts.length} posts`);
    const post = posts.find(p => p.id === 'instagram:900');
    check('its children are in index order (numeric, so 10 comes after 2)',
        post && post.children.map(c => c.index).join() === '0,1,2,10', post && post.children.map(c => c.index).join());
    check('its cover is child 0', post?.cover.id === 'ig:900:0');
    check('a post id shared across platforms stays two posts',
        posts.some(p => p.id === 'facebook:900') && posts.find(p => p.id === 'facebook:900').children.length === 1);
    check('posts are ordered newest first like single items',
        posts[0].id === 'facebook:fb-new' && posts.findIndex(p => p.id === 'facebook:900') < posts.findIndex(p => p.id === 'instagram:900'),
        ids(posts));
    check('a mixed carousel shows under Videos as well as Photos',
        filterItems(posts, { kind: 'video' }).some(p => p.id === 'instagram:900')
        && filterItems(posts, { kind: 'image' }).some(p => p.id === 'instagram:900'));
    check('NEGATIVE: a photo-only post does not show under Videos',
        !filterItems(posts, { kind: 'video' }).some(p => p.id === 'facebook:900'));
    const counts = facetCounts(posts);
    check('counts count posts, not files', counts.platforms.instagram === 4 && counts.platformTotal === 8, JSON.stringify(counts));
    check('describePost names a carousel by its size', describePost(post) === 'Instagram post of 4, 1 Sep 2026', describePost(post));
}

if (fail.length) {
    console.log(`\n${fail.length} failed`);
    process.exit(1);
}
console.log('\nall gallery checks passed');
