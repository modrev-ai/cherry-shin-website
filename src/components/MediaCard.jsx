import { useState } from 'react'
import PlatformIcon from './PlatformIcon'
import MediaActions from './MediaActions'

function MediaCard({ item, index, onClick }) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)

    const delay = Math.min(index * 80, 800)

    return (
        <div
            className={`media-card media-card--${item.platform} ${loaded ? 'loaded' : ''} ${error ? 'error' : ''}`}
            style={{ animationDelay: `${delay}ms` }}
            onClick={onClick}
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
                    style={{ display: loaded || error ? 'block' : 'none' }}
                    loading="lazy"
                />
                {error && (
                    <div className="media-fallback">
                        <span>{item.platform} Content</span>
                    </div>
                )}
                <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="media-overlay"
                >
                    <div className="play-button">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                        </svg>
                    </div>
                </a>
            </div>

            <MediaActions item={item} />

            <div className="media-info">
                <h3 className="media-title">{item.title}</h3>
            </div>

        </div>
    )
}

export default MediaCard