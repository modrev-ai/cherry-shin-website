// Shared platform metadata. Kept out of PlatformIcon.jsx so that file exports
// only a component, which is what React Fast Refresh requires.

export const platformColors = {
    tiktok: '#000000',
    youtube: '#FF0000',
    instagram: '#E4405F',
    twitter: '#FFFFFF',
    facebook: '#1877F2',
    twitch: '#9146FF',
}

export const platformNames = {
    tiktok: 'TikTok',
    youtube: 'YouTube',
    instagram: 'Instagram',
    twitter: 'X',
    facebook: 'Facebook',
    twitch: 'Twitch',
}

export function platformLabel(platform) {
    return platformNames[platform] || platform
}
