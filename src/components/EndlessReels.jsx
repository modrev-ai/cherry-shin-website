import { useState, useEffect, useCallback, useRef } from 'react'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { fetchMixedMedia, BackendUnreachableError } from '../services/mediaApi'
import { itemOrientation } from '../constants/platforms'
import MediaCard from './MediaCard'

function EndlessReels({ showWide = true }) {
    const [mediaItems, setMediaItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [hasMore, setHasMore] = useState(true)
    const [error, setError] = useState(null)
    const pageRef = useRef(0)
    const loadingRef = useRef(false)

    const loadMoreMedia = useCallback(async () => {
        if (loadingRef.current || !hasMore) return

        loadingRef.current = true
        setLoading(true)
        try {
            const page = pageRef.current
            const newItems = await fetchMixedMedia(page)

            setError(null)
            if (newItems.length === 0) {
                setHasMore(false)
            } else {
                setMediaItems(prev => [...prev, ...newItems])
                pageRef.current = page + 1
            }
        } catch (err) {
            console.error('Failed to fetch media:', err)
            // Stop the scroll sentinel from re-triggering, which would otherwise
            // retry forever behind a spinner that looks like a slow load.
            setHasMore(false)
            setError(
                err instanceof BackendUnreachableError
                    ? "Couldn't reach the server."
                    : 'Something went wrong loading the feed.'
            )
        } finally {
            loadingRef.current = false
            setLoading(false)
        }
    }, [hasMore])

    const retry = useCallback(() => {
        setError(null)
        setHasMore(true)
        loadingRef.current = false
        // hasMore flipping back to true rebuilds loadMoreMedia, so call the
        // fetch directly rather than relying on the stale closure.
        setLoading(true)
        fetchMixedMedia(pageRef.current)
            .then(newItems => {
                setMediaItems(prev => [...prev, ...newItems])
                pageRef.current += 1
            })
            .catch(err => {
                setHasMore(false)
                setError(
                    err instanceof BackendUnreachableError
                        ? "Couldn't reach the server."
                        : 'Something went wrong loading the feed.'
                )
            })
            .finally(() => setLoading(false))
    }, [])

    useEffect(() => {
        loadMoreMedia()
    }, [loadMoreMedia])

    const loaderRef = useInfiniteScroll(loadMoreMedia, loading)

    // Filter at render rather than on fetch, so switching wide posts back on
    // brings them straight back without refetching.
    const visibleItems = showWide
        ? mediaItems
        : mediaItems.filter(item => itemOrientation(item) !== 'landscape')

    if (mediaItems.length === 0 && error) {
        return (
            <div className="reels-error">
                <h3>{error}</h3>
                <p>The feed couldn&apos;t be loaded. Check your connection and try again.</p>
                <button type="button" className="reels-retry" onClick={retry}>
                    Try again
                </button>
            </div>
        )
    }

    if (mediaItems.length === 0 && loading) {
        return (
            <div className="reels-loading">
                <div className="loading-spinner"></div>
                <p>Loading content...</p>
            </div>
        )
    }

    return (
        <div className="endless-reels">
            <div className="reels-header">
                <h2>Content Feed</h2>
                <p>Explore Cherry's latest posts across all platforms</p>
            </div>

            <div className="reels-grid">
                {visibleItems.map((item, index) => (
                    <MediaCard key={`${item.platform}-${item.id}-${item.cycleId}`} item={item} index={index} />
                ))}
            </div>

            {loading && (
                <div className="reels-loading-more">
                    <div className="loading-spinner"></div>
                </div>
            )}

            {!showWide && visibleItems.length === 0 && mediaItems.length > 0 && (
                <div className="reels-error">
                    <h3>Nothing to show</h3>
                    <p>Every post loaded so far is a wide video, and those are hidden.</p>
                </div>
            )}

            {error && mediaItems.length > 0 && (
                <div className="reels-error reels-error--inline">
                    <p>{error}</p>
                    <button type="button" className="reels-retry" onClick={retry}>
                        Try again
                    </button>
                </div>
            )}

            {!hasMore && !error && mediaItems.length > 0 && (
                <div className="no-more-content">
                    <p>You've reached the end!</p>
                </div>
            )}

            {/* Always-visible sentinel for infinite scroll trigger */}
            <div ref={loaderRef} style={{ height: '1px' }} />
        </div>
    )
}

export default EndlessReels