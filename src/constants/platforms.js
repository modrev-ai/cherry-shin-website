// Shared platform metadata. Kept out of PlatformIcon.jsx so that file exports
// only a component, which is what React Fast Refresh requires.

export const platformColors = {
    tiktok: '#000000',
    youtube: '#FF0000',
    instagram: '#E4405F',
    facebook: '#1877F2',
    twitch: '#9146FF',
}

export const platformNames = {
    tiktok: 'TikTok',
    youtube: 'YouTube',
    instagram: 'Instagram',
    facebook: 'Facebook',
    twitch: 'Twitch',
}

export function platformLabel(platform) {
    return platformNames[platform] || platform
}

// Platforms whose posts are landscape by nature. YouTube is absent on purpose:
// it mixes Shorts and normal uploads, so the server reports each item's
// orientation and that takes precedence over any guess made here.
const landscapePlatforms = new Set(['youtube'])

export function itemOrientation(item) {
    if (item?.orientation) return item.orientation
    return landscapePlatforms.has(item?.platform) ? 'landscape' : 'portrait'
}
