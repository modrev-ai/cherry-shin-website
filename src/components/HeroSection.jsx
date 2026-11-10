import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { API_BASE } from '../services/mediaApi'
import { NOT_MEASURED_LABEL, headlineFigures, platformRows } from '../services/heroFigures'
import { profile } from '../content/profile'
import { platformColors } from '../constants/platforms'

// How long the portrait waits for /api/stats before showing the initials
// instead. The stats are cached and usually answer at once; a cold upstream can
// take far longer (MRO-270), and the hero should not sit on an empty frame.
const AVATAR_WAIT_MS = 2500

// The profile reveal (MKB "cherrystudio.art - hero motion: scroll-driven
// profile reveal, references and constraints"). The middle tier the note
// recommends: CSS transitions driven by one class, no animation library and no
// canvas. The profile assembles over about two seconds when the hero is on
// screen, and reverses when it is scrolled away, so coming back plays it again.
//
// What it must never do, and how it doesn't:
//   - animate a figure past, or up to, a value nobody measured: figures move,
//     their digits never change (services/heroFigures.js has the rules);
//   - animate an empty portrait frame: the frame stays hidden until there is
//     a picture or the initials to show in it;
//   - move at all under prefers-reduced-motion: the CSS shows the finished
//     state, with no transition and no snapping;
//   - trap the hero as a mandatory snap stop taller than the screen: its
//     height is measured, and snapping is released when it does not fit.
function HeroSection() {
    // Null until /api/stats answers, and null for good if it never does - in
    // which case every figure stays the not-measured placeholder.
    const [stats, setStats] = useState(null)
    const [settled, setSettled] = useState(false)
    const [waitedOut, setWaitedOut] = useState(false)
    // Her actual profile picture, which arrives with the stats. The URL is a
    // short-lived CDN link, so it is used as it comes and never stored.
    const [avatarLoaded, setAvatarLoaded] = useState(false)
    const [avatarFailed, setAvatarFailed] = useState(false)
    const [revealed, setRevealed] = useState(false)
    const [breakdownOpen, setBreakdownOpen] = useState(false)
    const [overflows, setOverflows] = useState(false)
    const sectionRef = useRef(null)

    useEffect(() => {
        let cancelled = false

        fetch(`${API_BASE}/stats`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
                if (!cancelled && data) setStats(data)
            })
            .catch(err => console.warn('Failed to load audience stats:', err))
            .finally(() => {
                if (!cancelled) setSettled(true)
            })

        const timer = setTimeout(() => setWaitedOut(true), AVATAR_WAIT_MS)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [])

    // Plays the reveal while the hero is mostly on screen and reverses it once
    // it is mostly off. Without IntersectionObserver the finished state shows.
    useEffect(() => {
        const section = sectionRef.current
        if (!section || typeof IntersectionObserver === 'undefined') {
            setRevealed(true)
            return undefined
        }
        const observer = new IntersectionObserver(
            ([entry]) => setRevealed(entry.isIntersecting),
            { root: document.querySelector('.app'), threshold: 0.5 },
        )
        observer.observe(section)
        return () => observer.disconnect()
    }, [])

    // A mandatory snap stop taller than the viewport fights the user's scroll:
    // its lower part can be skipped past but not settled on. Measured on load,
    // on resize and whenever the hero's own content changes size (the
    // breakdown opening, the about text, the figures arriving).
    useLayoutEffect(() => {
        const section = sectionRef.current
        if (!section) return undefined
        const content = section.querySelector('.hero-content')
        const measure = () => {
            const viewport = window.innerHeight
            // The content box plus the section's own padding is what the hero
            // needs; the section's min-height alone would always read as fit.
            const style = window.getComputedStyle(section)
            const needed = (content?.offsetHeight || 0)
                + parseFloat(style.paddingTop || 0)
                + parseFloat(style.paddingBottom || 0)
            setOverflows(needed > viewport)
        }
        measure()
        window.addEventListener('resize', measure)
        let observer
        if (typeof ResizeObserver !== 'undefined' && content) {
            observer = new ResizeObserver(measure)
            observer.observe(content)
        }
        return () => {
            window.removeEventListener('resize', measure)
            observer?.disconnect()
        }
    }, [])

    // Advance one slide; the snap container then settles on the first post.
    const scrollToFeed = () => {
        const scroller = document.querySelector('.app')
        if (scroller) {
            scroller.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
        }
    }

    const avatar = stats?.avatar || null
    const showPhoto = Boolean(avatar) && !avatarFailed
    // Initials are the fallback, not the default: they stand in when the
    // platform is not connected, does not return a picture, the short-lived
    // CDN link has expired by the time the browser asks, or the stats are
    // slow. They are shown only once one of those is known, so the frame
    // never reveals empty.
    const showInitials = !showPhoto && (settled || waitedOut)
    const portraitReady = (showPhoto && avatarLoaded) || showInitials

    const figures = headlineFigures(stats?.totals ?? null)
    const rows = platformRows(stats)

    const sectionClass = [
        'hero-section',
        revealed ? 'is-revealed' : '',
        overflows ? 'hero-section--overflows' : '',
    ].filter(Boolean).join(' ')

    return (
        <section ref={sectionRef} className={sectionClass} aria-label="Profile">
            <div className="hero-content">
                <div
                    className={`hero-avatar reveal-item ${portraitReady ? 'is-ready' : ''}`}
                    style={{ '--reveal-order': 0 }}
                >
                    {showPhoto && (
                        <img
                            src={avatar}
                            alt={profile.name}
                            onLoad={() => setAvatarLoaded(true)}
                            onError={() => setAvatarFailed(true)}
                        />
                    )}
                    {showInitials && (
                        <div className="avatar-placeholder" role="img" aria-label={profile.name}>CS</div>
                    )}
                </div>

                <h1 className="hero-name reveal-item" style={{ '--reveal-order': 1 }}>
                    {profile.name}
                </h1>

                {profile.tagline && (
                    <p className="hero-bio reveal-item" style={{ '--reveal-order': 2 }}>
                        {profile.tagline}
                    </p>
                )}

                {profile.about && (
                    <p className="hero-about reveal-item" style={{ '--reveal-order': 3 }}>
                        {profile.about}
                    </p>
                )}

                <dl className="hero-stats">
                    {figures.map((entry, index) => (
                        <div
                            className={`stat-item reveal-item ${entry.measured ? '' : 'is-unmeasured'}`}
                            key={entry.key}
                            style={{ '--reveal-order': 4 + index }}
                        >
                            <dt className="stat-label">{entry.label}</dt>
                            <dd className="stat-number">
                                {entry.measured ? (
                                    entry.value
                                ) : (
                                    <span aria-label={NOT_MEASURED_LABEL} title={NOT_MEASURED_LABEL}>
                                        {entry.value}
                                    </span>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>

                {rows.length > 0 && (
                    <div className="hero-breakdown reveal-item" style={{ '--reveal-order': 7 }}>
                        <button
                            type="button"
                            className="breakdown-toggle"
                            aria-expanded={breakdownOpen}
                            aria-controls="hero-breakdown-list"
                            onClick={() => setBreakdownOpen(open => !open)}
                        >
                            {breakdownOpen ? 'Hide platforms' : 'By platform'}
                        </button>
                        {breakdownOpen && (
                            <ul className="breakdown-list" id="hero-breakdown-list">
                                {rows.map(row => (
                                    <li className={`breakdown-row breakdown-row--${row.state}`} key={row.platform}>
                                        <span className="breakdown-platform">
                                            <span
                                                className="breakdown-dot"
                                                style={{ '--dot-color': platformColors[row.platform] || '#666' }}
                                                aria-hidden="true"
                                            />
                                            {row.label}
                                        </span>
                                        {row.state === 'silent' ? (
                                            <span className="breakdown-silent">not reporting right now</span>
                                        ) : (
                                            <span className="breakdown-figures">
                                                {row.figures.map(f => (
                                                    <span key={f.key}>
                                                        <strong>{f.value}</strong> {f.label.toLowerCase()}
                                                    </span>
                                                ))}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
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
        </section>
    )
}

export default HeroSection
