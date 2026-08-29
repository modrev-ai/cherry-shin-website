// Run with: node server/test/tiktok.test.mjs
//
// TikTok is the platform still on sample content, waiting only for post URLs.
// So this suite exists before the feature is switched on, which is the point:
// when three real URLs are finally pasted in, a parsing bug should not cost a
// round-trip through the person who pasted them.
//
// Everything here runs against fixtures. The oEmbed response shape is fixed and
// documented, so none of it needs a real post to test.

import { itemFromOEmbed, collectPosts } from '../tiktok.js';

const fail = [];
const check = (name, ok, detail = '') => {
    if (!ok) fail.push(`${name}${detail ? ' — ' + detail : ''}`);
    console.log(`${ok ? ' PASS ' : ' FAIL '} ${name}${ok ? '' : '  ' + detail}`);
};

const URL_A = 'https://www.tiktok.com/@itscherryshin/video/7412345678901234567';

// A realistic payload, minus the html blob the feed cannot use.
const payload = (over = {}) => ({
    embed_product_id: '7412345678901234567',
    title: 'Outfit of the Day',
    thumbnail_url: 'https://p16.tiktokcdn.com/thumb.jpeg',
    thumbnail_width: 720,
    thumbnail_height: 1280,
    ...over,
});

// --- itemFromOEmbed -----------------------------------------------------------

{
    const item = itemFromOEmbed(payload(), URL_A);
    check('a normal payload yields an item', item !== null);
    check('the embed id becomes the card id', item.id === '7412345678901234567', item.id);
    check('the embed URL is the player view, not the widget',
        item.embedUrl === 'https://www.tiktok.com/embed/v2/7412345678901234567', item.embedUrl);
    check('the source URL is carried through', item.url === URL_A);
    check('the platform is tagged', item.platform === 'tiktok');
}

// The guarantee that matters most: oEmbed knows no counts and no date, so the
// card must assert neither rather than inventing a zero.
{
    const item = itemFromOEmbed(payload(), URL_A);
    check('engagement is left unset rather than invented',
        item.likes === null && item.views === null && item.comments === null,
        `likes ${item.likes}, views ${item.views}, comments ${item.comments}`);
    check('no publish date is claimed', item.date === '', `date ${JSON.stringify(item.date)}`);
}

// Unusable payloads are dropped, not thrown — the caller keeps the batch.
check('a payload with no embed id is refused',
    itemFromOEmbed(payload({ embed_product_id: undefined }), URL_A) === null);
check('an empty payload is refused',
    itemFromOEmbed({}, URL_A) === null);
check('a null payload is refused rather than throwing',
    itemFromOEmbed(null, URL_A) === null);

// Fallbacks
check('a missing title falls back rather than rendering blank',
    itemFromOEmbed(payload({ title: undefined }), URL_A).title === 'TikTok post');
check('a missing thumbnail is null, not undefined',
    itemFromOEmbed(payload({ thumbnail_url: undefined }), URL_A).thumbnail === null);

// Orientation drives whether the card fills the frame or gets a wide one.
check('a taller-than-wide thumbnail is portrait',
    itemFromOEmbed(payload({ thumbnail_width: 720, thumbnail_height: 1280 }), URL_A)
        .orientation === 'portrait');
check('a wider-than-tall thumbnail is landscape',
    itemFromOEmbed(payload({ thumbnail_width: 1920, thumbnail_height: 1080 }), URL_A)
        .orientation === 'landscape');
check('unknown dimensions default to portrait rather than letterboxing',
    itemFromOEmbed(payload({ thumbnail_width: undefined, thumbnail_height: undefined }), URL_A)
        .orientation === 'portrait');
check('a square thumbnail is portrait, not landscape',
    itemFromOEmbed(payload({ thumbnail_width: 800, thumbnail_height: 800 }), URL_A)
        .orientation === 'portrait');

// --- collectPosts -------------------------------------------------------------

const item = (id) => ({ id, platform: 'tiktok' });

{
    const { items, dropped } = await collectPosts(['a', 'b', 'c'], async (u) => item(u));
    check('every post resolving keeps every post', items.length === 3 && dropped === 0,
        `${items.length} items, ${dropped} dropped`);
}

// A deleted or private video resolves to null. It must cost one card.
{
    const { items, dropped } = await collectPosts(['a', 'b', 'c'],
        async (u) => (u === 'b' ? null : item(u)));
    // Asserted before anything reads a property, so a null slipping through is
    // reported as a failure rather than crashing the run on `null.id`. A suite
    // that dies still goes red, but it names nothing.
    check('nothing unresolvable survives into the batch', items.every(Boolean),
        `items ${JSON.stringify(items)}`);
    check('an unresolvable post costs one card, not the batch',
        items.length === 2 && dropped === 1
            && items.filter(Boolean).map(i => i.id).join() === 'a,c',
        `kept ${items.filter(Boolean).map(i => i.id).join()}, dropped ${dropped}`);
}

// A thrown error must not take the batch either — this is why allSettled.
{
    const { items, dropped } = await collectPosts(['a', 'b', 'c'],
        async (u) => { if (u === 'b') throw new Error('network'); return item(u); });
    check('a post that throws costs one card, not the batch',
        items.length === 2 && dropped === 1 && items.map(i => i.id).join() === 'a,c',
        `kept ${items.map(i => i.id).join()}, dropped ${dropped}`);
}

{
    const { items, dropped } = await collectPosts(['a', 'b'], async () => { throw new Error('x'); });
    check('every post failing yields an empty batch rather than an error',
        items.length === 0 && dropped === 2);
}

{
    const { items, dropped } = await collectPosts([], async () => item('x'));
    check('no configured URLs is not an error', items.length === 0 && dropped === 0);
}

console.log(fail.length ? `\n${fail.length} FAILING: ${fail.join('; ')}` : '\nall passing');
process.exit(fail.length ? 1 : 0);
