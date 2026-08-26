import { useEffect } from 'react'
import PlatformIcon from './PlatformIcon'

function MediaModal({ item, onClose }) {
    useEffect(() => {
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handleEsc)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', handleEsc)
            document.body.style.overflow = ''
        }
    }, [onClose])

    if (!item) return null

    return (
        <div className="media-modal" onClick={onClose}>
            <div className="media-modal-backdrop"></div>
            <div className="media-modal-content" onClick={e => e.stopPropagation()}>
                <button className="media-modal-close" onClick={onClose}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                    </svg>
                </button>

                <div className="media-modal-header">
                    <PlatformIcon platform={item.platform} />
                    <span className="media-modal-date">{item.date}</span>
                    <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="media-modal-external"
                    >
                        View on {item.platform}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 19H5V5h14v14zm0-16H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5.04 5.08l-4.5 4.5-.78-.78 4.5-4.5.78.78zm-3.46 6.84H7.22v-1.5h3.28v1.5zm5.66-3.34l-4.5 4.5-.78-.78 4.5-4.5.78.78z" />
                        </svg>
                    </a>
                </div>

                <div className="media-modal-body">
                    {item.embedUrl ? (
                        <iframe
                            src={item.embedUrl}
                            className="media-modal-iframe"
                            allowFullScreen
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        ></iframe>
                    ) : (
                        <div className="media-modal-image-wrapper">
                            <img src={item.thumbnail} alt={item.title} />
                        </div>
                    )}
                </div>

                <div className="media-modal-footer">
                    <h3 className="media-modal-title">{item.title}</h3>
                    <div className="media-modal-stats">
                        {item.likes && (
                            <span className="stat">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                                </svg>
                                {formatNumber(item.likes)}
                            </span>
                        )}
                        {item.views && (
                            <span className="stat">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                                </svg>
                                {formatNumber(item.views)}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

export default MediaModal