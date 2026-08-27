import { useState } from 'react'
import EndlessReels from './components/EndlessReels'
import HeroSection from './components/HeroSection'
import ReelNav from './components/ReelNav'

function App() {
  // Wide posts sit awkwardly in a feed built around vertical video, so they can
  // be switched off. State lives here because the control and the feed it
  // filters are siblings.
  const [showWide, setShowWide] = useState(true)

  return (
    <div className="app">
      <HeroSection />
      <EndlessReels showWide={showWide} />
      <ReelNav showWide={showWide} onToggleWide={() => setShowWide(current => !current)} />
    </div>
  )
}

export default App
