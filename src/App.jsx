import { useEffect, useState } from 'react'
import EndlessReels from './components/EndlessReels'
import HeroSection from './components/HeroSection'
import ReelNav from './components/ReelNav'

const SHOW_WIDE_KEY = 'cherrystudio:showWide'

// Storage can throw rather than simply being empty: Safari's private mode and
// browsers set to block site data both raise on access. A preference is not
// worth breaking the page over, so every read and write is guarded and falls
// back to the default.
function readShowWide() {
  try {
    const stored = window.localStorage.getItem(SHOW_WIDE_KEY)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

function App() {
  // Wide posts sit awkwardly in a feed built around vertical video, so they can
  // be switched off. State lives here because the control and the feed it
  // filters are siblings.
  const [showWide, setShowWide] = useState(readShowWide)

  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_WIDE_KEY, String(showWide))
    } catch {
      // Preference simply will not persist; the session still works.
    }
  }, [showWide])

  return (
    <div className="app">
      <HeroSection />
      <EndlessReels showWide={showWide} />
      <ReelNav showWide={showWide} onToggleWide={() => setShowWide(current => !current)} />
    </div>
  )
}

export default App
