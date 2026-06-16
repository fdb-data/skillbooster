import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from '../../src/pages/Settings'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockStore = {
  loadLLMConfig: vi.fn(),
  saveLLMConfig: vi.fn().mockResolvedValue(undefined),
  testConnection: vi.fn().mockResolvedValue(true),
  llmConfig: { provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' },
  loadLLMProviders: vi.fn(),
  saveLLMProviders: vi.fn().mockResolvedValue(undefined),
  llmProviders: [],
  setCurrentPage: vi.fn()
}

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render settings title', () => {
    render(<Settings />)
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('should render three tabs', () => {
    render(<Settings />)
    expect(screen.getByText('LLM')).toBeDefined()
    expect(screen.getByText('Agents')).toBeDefined()
    expect(screen.getByText('General')).toBeDefined()
  })

  it('should show provider list in LLM tab', async () => {
    // 默认标签页已改为 general，需先切到 LLM
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('LLM'))
    expect(screen.getByText('Providers')).toBeDefined()
  })

  it('should switch to agents tab', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('Agents'))
    expect(screen.getByText('Guide agent')).toBeDefined()
    expect(screen.getByText('Extraction agent')).toBeDefined()
    expect(screen.getByText('Validation agent')).toBeDefined()
  })

  it('should show agent prompt file and view button', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('Agents'))
    expect(screen.getAllByText('View').length).toBeGreaterThan(0)
  })

  it('should show test button for agents', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('Agents'))
    expect(screen.getAllByText('Test one round').length).toBeGreaterThan(0)
  })

  it('should switch to general tab', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('General'))
    expect(screen.getByText('General settings')).toBeDefined()
  })

  it('should render back button', () => {
    // 返回按钮已改为 ArrowLeft SVG 图标
    const { container } = render(<Settings />)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('should show add provider button', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('LLM'))
    expect(screen.getByText('+ Add provider')).toBeDefined()
  })

  it('should show save and test buttons', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.click(screen.getByText('LLM'))
    expect(screen.getByText('Save')).toBeDefined()
    expect(screen.getByText('Test')).toBeDefined()
  })
})