import { useState, useEffect, useCallback, useRef } from 'react'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'
import { fetchMixedMedia } from '../services/mediaApi'
import MediaCard from './MediaCard'
import MediaModal from './MediaModal'

function EndlessReels() {
    const [mediaItems, setMediaItems] = useState([])
    const [loading, setLoading] = useState(true)
    const [hasMore, setHasMore] = useState(true)
    const [selectedItem, setSelectedItem] = useState(null)
    const pageRef = useRef(0)
    const loadingRef = useRef(false)

    const loadMoreMedia = useCallback(async () => {
        if (loadingRef.current || !hasMore) return

        loadingRef.current = true
        setLoading(true)
        try {
            const page = pageRef.current
            const newItems = await fetchMixedMedia(page)

            if (newItems.length === 0) {
                setHasMore(false)
            } else {
                setMediaItems(prev => [...prev, ...newItems])
                pageRef.current = page + 1
            }
        } catch (error) {
            console.error('Failed to fetch media:', error)
        } finally {
            loadingRef.current = false
            setLoading(false)
        }
    }, [hasMore])

    useEffect(() => {
        loadMoreMedia()
    }, [loadMoreMedia])

    const loaderRef = useInfiniteScroll(loadMoreMedia, loading)

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
                {mediaItems.map((item, index) => (
                    <MediaCard key={`${item.platform}-${item.id}-${item.cycleId}`} item={item} index={index} onClick={() => setSelectedItem(item)} />
                ))}
            </div>

            {loading && (
                <div className="reels-loading-more">
                    <div className="loading-spinner"></div>
                </div>
            )}

            {!hasMore && mediaItems.length > 0 && (
                <div className="no-more-content">
                    <p>You've reached the end!</p>
                </div>
            )}

            {/* Always-visible sentinel for infinite scroll trigger */}
            <div ref={loaderRef} style={{ height: '1px' }} />

            {selectedItem && (
                <MediaModal item={selectedItem} onClose={() => setSelectedItem(null)} />
            )}
        </div>
    )
}

export default EndlessReels