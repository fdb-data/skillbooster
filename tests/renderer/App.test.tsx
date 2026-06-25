import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import App from '../../src/App'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockStore = {
  currentPage: 'home' as string,
  setCurrentPage: vi.fn(),
  scenes: [],
  currentScene: null,
  createScene: vi.fn(),
  selectScene: vi.fn(),
  deleteScene: vi.fn(),
  isLoading: false,
  loadLLMConfig: vi.fn(),
  llmConfig: null,
  loadLLMProviders: vi.fn(),
  saveLLMProviders: vi.fn(),
  llmProviders: [],
  guideInput: '',
  setGuideInput: vi.fn(),
  updateScene: vi.fn(),
  saveLLMConfig: vi.fn(),
  testConnection: vi.fn(),
  loadScenes: vi.fn(),
  loadCanvas: vi.fn(),
  initAgentEvents: vi.fn().mockReturnValue(() => {}),
  abortRun: vi.fn(),
  activeRunId: null,
  agentStatus: null,
  streamingText: null,
  liveSceneDraft: null,
  resolveAgentLLMConfig: vi.fn().mockResolvedValue({ provider: 'OpenAI', model: 'gpt-4' })
}

;(useSceneStore as any).getState = () => mockStore

describe('App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render Home page by default', () => {
    mockStore.currentPage = 'home'
    render(<App />)
    expect(screen.getByText(/Teach your expertise to AI/)).toBeDefined()
  })

  it('should render Guide page when currentPage is guide', () => {
    mockStore.currentPage = 'guide'
    render(<App />)
    expect(screen.getByText(/Scene properties/)).toBeDefined()
    mockStore.currentPage = 'home'
  })

  it('should render Settings page when currentPage is settings', () => {
    mockStore.currentPage = 'settings'
    render(<App />)
    expect(screen.getByText('Settings')).toBeDefined()
    mockStore.currentPage = 'home'
  })

  it('should render Validate page when currentPage is validate', () => {
    mockStore.currentPage = 'validate'
    render(<App />)
    expect(screen.getByText(/Validation · A\/B comparison/)).toBeDefined()
    mockStore.currentPage = 'home'
  })
})