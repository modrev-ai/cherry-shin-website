// Fixed controls for moving between slides without a scroll gesture. The snap
// container settles on the neighbouring slide once scrolled by one viewport.
function ReelNav({ showWide, onToggleWide }) {
    const getScroller = () => document.querySelector('.app')

    const step = (direction) => {
        const scroller = getScroller()
        if (!scroller) return
        scroller.scrollBy({ top: direction * window.innerHeight, behavior: 'smooth' })
    }

    const toTop = () => {
        const scroller = getScroller()
        if (!scroller) return
        scroller.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <div className="reel-nav">
            <button
                type="button"
                className="nav-btn"
                onClick={() => step(-1)}
                aria-label="Previous post"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <button
                type="button"
                className="nav-btn"
                onClick={() => step(1)}
                aria-label="Next post"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>

            <button
                type="button"
                className={`nav-btn nav-btn--wide ${showWide ? 'is-on' : 'is-off'}`}
                onClick={onToggleWide}
                aria-pressed={showWide}
                aria-label={showWide ? 'Hide wide videos' : 'Show wide videos'}
                title={showWide ? 'Hide wide videos' : 'Show wide videos'}
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                    {!showWide && (
                        <path d="M4 20L20 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    )}
                </svg>
            </button>

            <button
                type="button"
                className="nav-btn nav-btn--home"
                onClick={toTop}
                aria-label="Back to top"
            >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 10.5L12 3l9 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
        </div>
    )
}

export default ReelNav
