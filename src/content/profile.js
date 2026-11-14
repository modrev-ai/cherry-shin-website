// Cherry's profile text, kept in one place so it can be written without
// touching the component.
//
// RULE: nothing here may be invented. Every value is either text the site
// already published, or null. A null slot renders nothing at all - the page
// never shows a stand-in sentence about a real person.
//
// SLOTS FOR JONG are marked `SLOT` below. Fill one by replacing null with the
// text, exactly as it should appear on the live site.

export const profile = {
    name: 'Cherry Shin',

    // Already live on cherrystudio.art before TH-756, carried over unchanged.
    // Its source was never recorded; confirm or replace it.
    tagline: 'Content Creator | Fashion & Lifestyle | Beauty Enthusiast',

    // SLOT (TH-756): a short "about" paragraph shown under the tagline. Plain
    // text, roughly two sentences, so the hero still fits a 375x667 phone.
    about: null,

    // SLOT (TH-756): the media-library id of the photo to use as her portrait
    // when the platforms send none, e.g. 'instagram:17888087073689927:0' (ids
    // are on the /gallery page's "Open original" links and in
    // server/generated/media-library.json). Null keeps the initials. Which
    // photo is her portrait is Cherry's or Jong's call, not a guess.
    portraitAssetId: null,
}
