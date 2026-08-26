import { useEffect, useRef } from "react";

/**
 * Hook that triggers a callback when the user scrolls near the bottom of the viewport.
 * @param {Function} fetchData - Function to call when near bottom
 * @param {boolean} isLoading - Whether a fetch is currently in progress
 */
export function useInfiniteScroll(fetchData, isLoading) {
    const loaderRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const target = entries[0];
                if (target.isIntersecting && !isLoading) {
                    fetchData();
                }
            },
            // Full-screen snap slides mean the sentinel past the last post can never
            // be rested on, so extend the root downwards to load well before it.
            { threshold: 0, rootMargin: '0px 0px 150% 0px' }
        );

        const currentRef = loaderRef.current;
        if (currentRef) {
            observer.observe(currentRef);
        }

        return () => {
            observer.disconnect();
        };
    }, [fetchData, isLoading]);

    return loaderRef;
}
