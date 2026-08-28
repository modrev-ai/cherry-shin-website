import { useEffect, useRef, useState } from 'react'
import PlatformIcon from './PlatformIcon'
import { platformLabel, itemOrientation } from '../constants/platforms'
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

// The hero fills the first screen, so the opening cards sit just below the fold
// and are the next thing anyone sees. They load eagerly: a lazy image is only
// fetched once the browser judges it near the viewport, and that judgement needs
// a rendered, visible page - which is exactly what a preview or a background tab
// is not. Everything deeper stays lazy, which is where the saving is anyway.
const EAGER_CARDS = 2;

// A sample stands in for a platform that has no credentials yet. It is labelled
// as one, and carries no engagement counts or date, so nothing on the card
// asserts a number or a moment that is not real.
function MediaCard({ item, index }) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)
    const [isActive, setIsActive] = useState(false)
    const cardRef = useRef(null)

    const canPlayInline = Boolean(item.embedUrl)

    const orientation = itemOrientation(item)

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
            className={`media-card media-card--${item.platform} media-card--${orientation} ${loaded ? 'loaded' : ''} ${error ? 'error' : ''}`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="media-card-header">
                <PlatformIcon platform={item.platform} />
                {item.isSample
                    ? <span className="media-sample">Sample</span>
                    : item.date && <span className="media-date">{item.date}</span>}
            </div>

            <div className="media-thumbnail">
                {!loaded && !error && (
                    <div className="media-skeleton">
                        <div className="skeleton-pulse"></div>
                    </div>
                )}
                {/* Every card ever scrolled past stays mounted, so without this
                    each one fetches and decodes its thumbnail on mount - hundreds
                    of images for a reader who went deep into the feed.

                    lazy was tried once before and deadlocked: the image was
                    hidden until onLoad, so it was never near the viewport, so it
                    never loaded, so onLoad never fired. That gating is gone - the
                    image is always in the layout and the skeleton sits behind it -
                    and an image already in view loads immediately even when
                    marked lazy, so first paint is unaffected. */}
                <img
                    src={item.thumbnail}
                    alt={item.title}
                    loading={index < EAGER_CARDS ? 'eager' : 'lazy'}
                    decoding="async"
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
