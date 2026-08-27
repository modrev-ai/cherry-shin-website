import { useEffect, useRef, useState } from 'react'
import PlatformIcon from './PlatformIcon'
import { platformLabel } from '../constants/platforms'
import MediaActions from './MediaActions'

// Inline playback starts without a click, so there is no user gesture to
// authorise sound and every browser will refuse an unmuted autoplay. Muted is
// the only way this can start on its own; the player's own controls and the
// watch button are how sound is reached.
function inlineSrc(embedUrl) {
    if (!embedUrl) return null
    const separator = embedUrl.includes('?') ? '&' : '?'
    const videoId = embedUrl.match(/\/embed\/([^?/]+)/)?.[1]
    // loop needs playlist set to the same id, otherwise it is ignored
    const loop = videoId ? `&loop=1&playlist=${videoId}` : ''
    return `${embedUrl}${separator}autoplay=1&mute=1&playsinline=1&rel=0&controls=1${loop}`
}

function MediaCard({ item, index }) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)
    const [isActive, setIsActive] = useState(false)
    const cardRef = useRef(null)

    const canPlayInline = Boolean(item.embedUrl)

    // Only the slide actually on screen mounts a player. Unmounting on exit
    // stops playback and keeps a long feed from accumulating live iframes.
    useEffect(() => {
        if (!canPlayInline) return

        const node = cardRef.current
        if (!node) return

        const observer = new IntersectionObserver(
            ([entry]) => setIsActive(entry.isIntersecting),
            // Full-screen slides mean only one can pass this threshold at a
            // time, so only one video is ever playing.
            { threshold: 0.6 }
        )

        observer.observe(node)
        return () => observer.disconnect()
    }, [canPlayInline])

    const delay = Math.min(index * 80, 800)

    return (
        <div
            ref={cardRef}
            className={`media-card media-card--${item.platform} ${loaded ? 'loaded' : ''} ${error ? 'error' : ''}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="media-card-header">
                <PlatformIcon platform={item.platform} />
                <span className="media-date">{item.date}</span>
            </div>

            <div className="media-thumbnail">
                {!loaded && !error && (
                    <div className="media-skeleton">
                        <div className="skeleton-pulse"></div>
                    </div>
                )}
                <img
                    src={item.thumbnail}
                    alt={item.title}
                    onLoad={() => setLoaded(true)}
                    onError={() => setError(true)}
                />
                {error && (
                    <div className="media-fallback">
                        <span>{item.platform} Content</span>
                    </div>
                )}
                {canPlayInline && isActive && (
                    <iframe
                        className="media-inline-player"
                        src={inlineSrc(item.embedUrl)}
                        title={item.title}
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                    />
                )}

                {/* Decorative only. Hidden once a player is on top of it. */}
                <div className="media-overlay" aria-hidden="true">
                    <div className="play-button">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </div>
            </div>

            <MediaActions item={item} />

            <div className="media-info">
                <h3 className="media-title">{item.title}</h3>
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="watch-button"
                    aria-label={`Watch "${item.title}" on ${platformLabel(item.platform)} (opens a new tab)`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                    Watch on {platformLabel(item.platform)}
                </a>
            </div>



        </div>
    )
}

export default MediaCard
