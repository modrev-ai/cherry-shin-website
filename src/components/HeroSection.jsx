function HeroSection() {
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
        </div>
    )
}

export default HeroSection