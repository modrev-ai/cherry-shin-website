import { useState } from 'react'
import PlatformIcon from './PlatformIcon'

function MediaCard({ item, index, onClick }) {
    const [loaded, setLoaded] = useState(false)
    const [error, setError] = useState(false)

    const delay = Math.min(index * 80, 800)

    return (
        <div
            className={`media-card ${loaded ? 'loaded' : ''} ${error ? 'error' : ''}`}
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

            <div className="media-info">
                <h3 className="media-title">{item.title}</h3>
                <div className="media-stats">
                    {item.likes && (
                        <span className="stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                            </svg>
                            {formatNumber(item.likes)}
                        </span>
                    )}
                    {item.views && (
                        <span className="stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                            </svg>
                            {formatNumber(item.views)}
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

function formatNumber(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M'
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K'
    }
    return num.toString()
}

export default MediaCard