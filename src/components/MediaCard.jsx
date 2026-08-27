import { useState } from 'react'
import PlatformIcon from './PlatformIcon'
import { platformLabel } from '../constants/platforms'
import MediaActions from './MediaActions'

function MediaCard({ item, index, onClick }) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)

    const delay = Math.min(index * 80, 800)

    return (
        <div
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
                {/* Purely decorative: the thumbnail opens the modal via the
                    card's own handler. Nothing here navigates off the site. */}
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
                {item.embedUrl ? (
                    <button
                        type="button"
                        className="watch-button"
                        onClick={onClick}
                        aria-label={`Play "${item.title}"`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch on {platformLabel(item.platform)}
                    </button>
                ) : (
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="watch-button"
                        aria-label={`Watch "${item.title}" on ${platformLabel(item.platform)}`}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                        Watch on {platformLabel(item.platform)}
                    </a>
                )}
            </div>

        </div>
    )
}

export default MediaCard