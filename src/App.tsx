import React, { useEffect } from 'react'
import Home from './pages/Home'
import Guide from './pages/Guide'
import Workbench from './pages/Workbench'
import Validate from './pages/Validate'
import Settings from './pages/Settings'
import AppShell from './components/AppShell'
import { useSceneStore } from './store/sceneStore'

const App: React.FC = () => {
  const currentPage = useSceneStore(s => s.currentPage)
  const loadScenes = useSceneStore(s => s.loadScenes)
  const initAgentEvents = useSceneStore(s => s.initAgentEvents)
  const initSecurityEvents = useSceneStore(s => s.initSecurityEvents)

  useEffect(() => { loadScenes() }, [loadScenes])

  useEffect(() => {
    const unsubscribe = initAgentEvents()
    return unsubscribe
  }, [initAgentEvents])

  useEffect(() => {
    const unsubscribe = initSecurityEvents()
    return unsubscribe
  }, [initSecurityEvents])

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
    <AppShell>
      {renderPage()}
    </AppShell>
  )
}

export default App
