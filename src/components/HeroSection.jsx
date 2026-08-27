import { useEffect, useState } from 'react'
import { API_BASE } from '../services/mediaApi'

function formatCompact(num) {
    if (typeof num !== 'number') return null
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toLocaleString()
}

function HeroSection() {
    // Real audience numbers, aggregated server-side across whatever platforms
    // are connected. Nothing is rendered until they load, so the hero never
    // shows a figure that isn't backed by a live source.
    const [stats, setStats] = useState(null)

    useEffect(() => {
        let cancelled = false

        fetch(`${API_BASE}/stats`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!cancelled && data?.totals) setStats(data.totals)
            })
            .catch(err => console.warn('Failed to load audience stats:', err))

        return () => { cancelled = true }
    }, [])

    // Advance one slide; the snap container then settles on the first post.
    const scrollToFeed = () => {
        const scroller = document.querySelector('.app')
        if (scroller) {
            scroller.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
        }
    }

    const entries = stats
        ? [
            { key: 'followers', label: 'Followers', value: formatCompact(stats.followers) },
            { key: 'posts', label: 'Posts', value: formatCompact(stats.posts) },
            { key: 'views', label: 'Views', value: formatCompact(stats.views) },
        ].filter(entry => entry.value !== null)
        : []

    return (
        <div className="hero-section">
            <div className="hero-content">
                <div className="hero-avatar">
                    <div className="avatar-placeholder">CS</div>
                </div>
                <h1 className="hero-name">Cherry Shin</h1>
                <p className="hero-bio">
                    Content Creator | Fashion &amp; Lifestyle | Beauty Enthusiast
                </p>
                {entries.length > 0 && (
                    <div className="hero-stats">
                        {entries.map(entry => (
                            <div className="stat-item" key={entry.key}>
                                <span className="stat-number">{entry.value}</span>
                                <span className="stat-label">{entry.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <button
                type="button"
                className="scroll-cue"
                onClick={scrollToFeed}
                aria-label="Scroll to the content feed"
            >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                        d="M6 9l6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </button>
        </div>
    )
}

export default HeroSection
