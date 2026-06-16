import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Validate from '../../src/pages/Validate'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockScene = {
  id: 'validate-scene', name: 'Test Validate', status: 'active',
  canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] },
  references: [], conversation: [], createdAt: '', updatedAt: ''
}

const mockStore = {
  currentScene: mockScene,
  setCurrentPage: vi.fn(),
  isLoading: false
}

describe('Validate Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render A/B comparison headers', () => {
    render(<Validate />)
    expect(screen.getByText(/A · Without Skill/)).toBeDefined()
    expect(screen.getByText(/B · With this Skill/)).toBeDefined()
  })

  it('should render instruction input', () => {
    render(<Validate />)
    expect(screen.getByPlaceholderText(/Enter a test instruction/)).toBeDefined()
  })

  it('should render run button', () => {
    render(<Validate />)
    expect(screen.getByText(/Run comparison/)).toBeDefined()
  })

  it('should call validation:run on button click', async () => {
    const user = userEvent.setup()
    render(<Validate />)
    const input = screen.getByPlaceholderText(/Enter a test instruction/)
    await user.type(input, 'How to test?')
    const btn = screen.getByText(/Run comparison/)
    await user.click(btn)
    await waitFor(() => {
      expect(window.api.validation.run).toHaveBeenCalledWith('validate-scene', 'How to test?')
    })
  })

  it('should show back button', () => {
    // 返回按钮已改为 ArrowLeft SVG 图标
    const { container } = render(<Validate />)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('should display "Waiting to run" initially', () => {
    render(<Validate />)
    expect(screen.getAllByText(/Waiting to run/).length).toBe(2)
  })
})