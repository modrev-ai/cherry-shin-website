import { useState } from 'react'

function formatCount(num) {
    if (!num && num !== 0) return null
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
}

// A figure from the platform, not a control. There is no sign-in here, so a
// like or a comment can only happen on the platform the post came from -
// rendering these as buttons offered an interaction the site cannot perform and
// put an inert tab stop in front of every keyboard user. They read out as
// values instead, which is what they always were.
//
// Renders nothing when there is no count. A genuine zero still shows as "0":
// the distinction being drawn is between a real figure and no figure, not
// between a big number and a small one. Sample posts carry no counts at all.
function Stat({ value, label, children }) {
    const text = formatCount(value)
    if (text === null) return null
    // role="img" so the label is actually announced. aria-label on a bare div is
    // widely ignored, because an element with no role exposes no name.
    return (
        <div className="action-btn action-btn--stat" role="img" aria-label={`${value} ${label}`}>
            {children}
            <span className="action-count">{text}</span>
        </div>
    )
}

// Vertical rail beside the reel: the post's own figures, then the one thing a
// visitor can actually do with it.
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
            {/* Views stay gated on being above zero: unlike a like count, a bare
                "0 views" beside a playing video reads as a fault rather than a fact. */}
            {typeof item.views === 'number' && item.views > 0 && (
                <Stat value={item.views} label="views">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                    </svg>
                </Stat>
            )}

            <Stat value={item.likes} label="likes">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
            </Stat>

            <Stat value={item.comments} label="comments">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </Stat>

            <Stat value={item.shares} label="shares">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M17 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M7 23l-4-4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </Stat>

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
        </div>
    )
}

export default MediaActions
