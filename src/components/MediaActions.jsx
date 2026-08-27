import { useState } from 'react'

function formatCount(num) {
    if (!num && num !== 0) return null
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

// Vertical rail beside the reel: engagement counts first, then the actions that
// have no count of their own.
function MediaActions({ item }) {
    const [copied, setCopied] = useState(false)
    const stop = (event) => event.stopPropagation()

    // The watch button in the caption is the only thing that navigates away, so
    // share copies the link instead of opening the post elsewhere.
    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(item.url)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
        } catch (err) {
            console.warn('Clipboard unavailable:', err)
        }
    }

    return (
        <div className="media-actions" onClick={stop}>
            <button type="button" className="action-btn" aria-label="Like">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span className="action-count">{formatCount(item.likes)}</span>
            </button>

            <button type="button" className="action-btn" aria-label="Comments">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="action-count">{formatCount(item.comments)}</span>
            </button>

            <button type="button" className="action-btn" aria-label="Share">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 23l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="action-count">{formatCount(item.shares)}</span>
            </button>

            <button
                type="button"
                className="action-btn"
                onClick={copyLink}
                aria-label={copied ? 'Link copied' : 'Copy link to this post'}
            >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M22 2L11 13" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {copied && <span className="action-count">Copied</span>}
            </button>

            <button type="button" className="action-btn" aria-label="Save">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <button type="button" className="action-btn action-btn--more" aria-label="More options">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                </svg>
            </button>
        </div>
    )
}

export default MediaActions
