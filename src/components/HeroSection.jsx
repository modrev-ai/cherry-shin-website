function HeroSection() {
    // Advance one slide; the snap container then settles on the first post.
    const scrollToFeed = () => {
        const scroller = document.querySelector('.app')
        if (scroller) {
            scroller.scrollBy({ top: window.innerHeight, behavior: 'smooth' })
        }
    }

    return (
        <div className="hero-section">
            <div className="hero-content">
                <div className="hero-avatar">
                    <div className="avatar-placeholder">CS</div>
                </div>
                <h1 className="hero-name">Cherry Shin</h1>
                <p className="hero-bio">
                    Content Creator | Fashion & Lifestyle | Beauty Enthusiast
                </p>
                <div className="hero-stats">
                    <div className="stat-item">
                        <span className="stat-number">500K+</span>
                        <span className="stat-label">Followers</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-number">50+</span>
                        <span className="stat-label">Countries</span>
                    </div>
                    <div className="stat-item">
                        <span className="stat-number">1M+</span>
                        <span className="stat-label">Likes</span>
                    </div>
                </div>
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