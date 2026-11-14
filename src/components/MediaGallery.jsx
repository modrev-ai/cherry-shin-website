import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PlatformIcon from './PlatformIcon'
import { platformLabel } from '../constants/platforms'
import {
    ALL,
    describeItem,
    describePost,
    facetCounts,
    filterItems,
    formatBytes,
    formatDuration,
    groupPosts,
    orderNewestFirst,
    requestMediaLibrary,
} from '../services/gallery'

// How many tiles render at first, and per "Show more". The library is several
// hundred posts and growing; rendering every tile at once is wasted work on a
// phone.
const PAGE = 48

const KIND_LABELS = { [ALL]: 'All', image: 'Photos', video: 'Videos' }

// Every photo and video from Cherry's accounts, newest first (TH-756). One tile
// per post: a carousel is one tile with its children, in order, behind it.
// Tiles show the web copy; opening one shows the original at its uploaded
// quality, with a link to the file itself and to the post on its platform.
function MediaGallery() {
    const [state, setState] = useState({ status: 'loading', items: [], reason: null })
    const [platform, setPlatform] = useState(ALL)
    const [kind, setKind] = useState(ALL)
    const [shown, setShown] = useState(PAGE)
    const [selected, setSelected] = useState(null)
    // Stable, so the viewer's focus-and-Escape effect runs once per opening.
    const close = useCallback(() => setSelected(null), [])

    useEffect(() => {
        let cancelled = false
        requestMediaLibrary().then(result => {
            if (cancelled) return
            setState({
                status: result.configured ? 'ready' : 'unconfigured',
                items: orderNewestFirst(groupPosts(result.items)),
                reason: result.reason,
            })
        })
        return () => { cancelled = true }
    }, [])

    const visible = useMemo(() => filterItems(state.items, { platform, kind }), [state.items, platform, kind])
    const counts = useMemo(() => facetCounts(state.items, { platform, kind }), [state.items, platform, kind])
    const platforms = Object.keys(facetCounts(state.items).platforms).sort()

    const choose = (setter) => (value) => {
        setter(value)
        setShown(PAGE)
    }

    return (
        <section className="gallery" aria-labelledby="gallery-title">
            <header className="gallery-header">
                <a className="gallery-back" href="/">&larr; Cherry Shin</a>
                <h1 id="gallery-title">Gallery</h1>
                <p>Photos and videos from Cherry&apos;s accounts, newest first. Open one to see it at its original quality.</p>
            </header>

            {state.status === 'loading' && (
                <div className="reels-loading">
                    <div className="loading-spinner"></div>
                    <p>Loading the gallery...</p>
                </div>
            )}

            {state.status === 'unconfigured' && (
                <div className="reels-error">
                    <h3>The gallery isn&apos;t available here yet</h3>
                    <p>This server has no media library. Locally, run <code>npm run media:import</code> and restart the API server.</p>
                </div>
            )}

            {state.status === 'ready' && (
                <>
                    <div className="gallery-filters">
                        <div className="gallery-filter" role="group" aria-label="Platform">
                            <FilterButton active={platform === ALL} onClick={() => choose(setPlatform)(ALL)} count={counts.platformTotal}>
                                All
                            </FilterButton>
                            {platforms.map(key => (
                                <FilterButton
                                    key={key}
                                    active={platform === key}
                                    onClick={() => choose(setPlatform)(key)}
                                    count={counts.platforms[key] || 0}
                                >
                                    {platformLabel(key)}
                                </FilterButton>
                            ))}
                        </div>
                        <div className="gallery-filter" role="group" aria-label="Type">
                            {[ALL, 'image', 'video'].map(key => (
                                <FilterButton
                                    key={key}
                                    active={kind === key}
                                    onClick={() => choose(setKind)(key)}
                                    count={key === ALL ? counts.kindTotal : counts.kinds[key]}
                                >
                                    {KIND_LABELS[key]}
                                </FilterButton>
                            ))}
                        </div>
                    </div>

                    {visible.length === 0 ? (
                        <div className="reels-error">
                            <h3>Nothing matches</h3>
                            <p>No posts fit both filters.</p>
                        </div>
                    ) : (
                        <ul className="gallery-grid">
                            {visible.slice(0, shown).map((item, index) => (
                                <li key={item.id}>
                                    <GalleryTile item={item} eager={index < 8} onOpen={() => setSelected(item)} />
                                </li>
                            ))}
                        </ul>
                    )}

                    {visible.length > shown && (
                        <div className="gallery-more">
                            <button type="button" className="reels-retry" onClick={() => setShown(n => n + PAGE)}>
                                Show more ({visible.length - shown} left)
                            </button>
                        </div>
                    )}
                </>
            )}

            {selected && <Lightbox key={selected.id} item={selected} onClose={close} />}
        </section>
    )
}

function FilterButton({ active, onClick, count, children }) {
    return (
        <button type="button" className="breakdown-toggle gallery-filter-btn" aria-pressed={active} onClick={onClick}>
            {children} <span className="gallery-count">{count}</span>
        </button>
    )
}

function GalleryTile({ item: post, eager, onOpen }) {
    const item = post.cover
    const label = describePost(post)
    const count = post.children.length
    const duration = count === 1 && item.kind === 'video' ? formatDuration(item.duration) : null
    return (
        <button type="button" className={`gallery-tile gallery-tile--${item.kind}`} onClick={onOpen} aria-label={`Open ${label}`}>
            <img
                src={item.web.url}
                alt=""
                width={item.web.width || undefined}
                height={item.web.height || undefined}
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
            />
            <span className="gallery-tile-badges" aria-hidden="true">
                <PlatformIcon platform={item.platform} />
                {count > 1 && (
                    <span className="gallery-video-badge gallery-carousel-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="7" y="7" width="13" height="13" rx="2" /><path d="M4 16V5a1 1 0 0 1 1-1h11" /></svg>
                        {count}
                    </span>
                )}
                {count === 1 && item.kind === 'video' && (
                    <span className="gallery-video-badge">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        {duration}
                    </span>
                )}
            </span>
        </button>
    )
}

// The full-size view. Images load the original file itself, not the web copy;
// videos play the original with the web poster shown until they start.
function Lightbox({ item: post, onClose }) {
    const closeRef = useRef(null)
    const [position, setPosition] = useState(0)
    const count = post.children.length
    const item = post.children[Math.min(position, count - 1)]
    const label = describeItem(item)
    const step = useCallback(delta => setPosition(p => (p + delta + count) % count), [count])
    const size = item.original.width && item.original.height
        ? `${item.original.width}×${item.original.height}`
        : null
    const bytes = formatBytes(item.original.bytes)

    useEffect(() => {
        const previous = document.activeElement
        closeRef.current?.focus()
        const onKey = event => {
            if (event.key === 'Escape') onClose()
            else if (event.key === 'ArrowRight' && count > 1) step(1)
            else if (event.key === 'ArrowLeft' && count > 1) step(-1)
        }
        window.addEventListener('keydown', onKey)
        return () => {
            window.removeEventListener('keydown', onKey)
            if (previous && typeof previous.focus === 'function') previous.focus()
        }
    }, [onClose, step, count])

    return (
        <div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={describePost(post)} onClick={onClose}>
            <div className="gallery-lightbox-inner" onClick={event => event.stopPropagation()}>
                <button ref={closeRef} type="button" className="gallery-lightbox-close" onClick={onClose} aria-label="Close">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>

                <div className="gallery-lightbox-media">
                    {item.kind === 'video' ? (
                        <video
                            key={item.id}
                            src={item.original.url}
                            poster={item.web.url}
                            controls
                            playsInline
                            preload="metadata"
                        />
                    ) : (
                        <img key={item.id} src={item.original.url} alt={label} />
                    )}
                </div>

                {count > 1 && (
                    <div className="gallery-lightbox-steps">
                        <button type="button" className="breakdown-toggle" onClick={() => step(-1)} aria-label="Previous in this post">&larr;</button>
                        <span aria-live="polite">{position + 1} of {count}</span>
                        <button type="button" className="breakdown-toggle" onClick={() => step(1)} aria-label="Next in this post">&rarr;</button>
                    </div>
                )}

                <div className="gallery-lightbox-info">
                    <span className="gallery-lightbox-title">
                        <PlatformIcon platform={item.platform} /> {label}
                    </span>
                    <span className="gallery-lightbox-meta">
                        Original{size ? ` · ${size}` : ''}{bytes ? ` · ${bytes}` : ''}
                    </span>
                    <span className="gallery-lightbox-links">
                        <a href={item.original.url} target="_blank" rel="noopener noreferrer">Open original</a>
                        {item.permalink && (
                            <a href={item.permalink} target="_blank" rel="noopener noreferrer">
                                View on {platformLabel(item.platform)}
                            </a>
                        )}
                    </span>
                </div>
            </div>
        </div>
    )
}

export default MediaGallery
