import { useState, useCallback } from 'react'
import { fetchMixedMedia } from '../services/mediaApi'

function useMediaFeed() {
    const [items, setItems] = useState([])
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [hasMore, setHasMore] = useState(true)

    const loadMore = useCallback(async () => {
        if (loading) return

        setLoading(true)
        try {
            const newItems = await fetchMixedMedia(page)
            if (newItems.length === 0) {
                setHasMore(false)
            } else {
                setItems(prev => [...prev, ...newItems])
                setPage(prev => prev + 1)
            }
        } catch (error) {
            console.error('Failed to load media:', error)
        } finally {
            setLoading(false)
        }
    }, [page, loading])

    return { items, loadMore, loading, hasMore }
}

export default useMediaFeed