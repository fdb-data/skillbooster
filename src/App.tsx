import React, { useEffect } from 'react'
import Home from './pages/Home'
import Guide from './pages/Guide'
import Workbench from './pages/Workbench'
import Validate from './pages/Validate'
import Settings from './pages/Settings'
import { useSceneStore } from './store/sceneStore'

const App: React.FC = () => {
  const currentPage = useSceneStore(s => s.currentPage)
  const error = useSceneStore(s => s.error)
  const clearError = useSceneStore(s => s.clearError)
  const loadScenes = useSceneStore(s => s.loadScenes)
  const initAgentEvents = useSceneStore(s => s.initAgentEvents)

  useEffect(() => { loadScenes() }, [loadScenes])

  useEffect(() => {
    const unsubscribe = initAgentEvents()
    return unsubscribe
  }, [initAgentEvents])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000)
      return () => clearTimeout(timer)
    }
  }, [error, clearError])

  const renderPage = () => {
    switch (currentPage) {
      case 'home': return <Home />
      case 'guide': return <Guide />
      case 'workbench': return <Workbench />
      case 'validate': return <Validate />
      case 'settings': return <Settings />
      default: return <Home />
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {error && (
        <div style={{
          padding: '6px 20px', background: '#fee2e2', color: '#dc2626',
          fontSize: 12, cursor: 'pointer', textAlign: 'center'
        }} onClick={clearError}>
          {error}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {renderPage()}
      </div>
    </div>
  )
}

export default App
