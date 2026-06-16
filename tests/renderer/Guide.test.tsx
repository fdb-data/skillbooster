import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Guide from '../../src/pages/Guide'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockScene = {
  id: 'guide-scene', name: 'Test Guide', status: 'active',
  canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] },
  references: [], conversation: [], createdAt: '', updatedAt: ''
}

const mockStore = {
  currentScene: mockScene,
  setCurrentPage: vi.fn(),
  updateScene: vi.fn(),
  isLoading: false,
  guideInput: '',
  setGuideInput: vi.fn()
}

describe('Guide Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render project name', () => {
    render(<Guide />)
    expect(screen.getByText(/Untitled project/)).toBeDefined()
  })

  it('should render input area', () => {
    render(<Guide />)
    expect(screen.getByPlaceholderText(/Tell me/)).toBeDefined()
  })

  it('should render file attach button', () => {
    // 附件按钮已改为 Paperclip SVG 图标，是输入栏里的第一个按钮
    render(<Guide />)
    const input = screen.getByPlaceholderText(/Tell me/)
    expect(input.parentElement?.querySelector('button')).toBeTruthy()
  })

  it('should render back button', () => {
    // 返回按钮已改为 ArrowLeft SVG 图标
    const { container } = render(<Guide />)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('should allow typing in input', async () => {
    const user = userEvent.setup()
    render(<Guide />)
    const input = screen.getByPlaceholderText(/Tell me/)
    await user.type(input, 'Hello')
    expect((input as HTMLInputElement).value).toContain('Hello')
  })

  it('should call guide:runTurn on send', async () => {
    const user = userEvent.setup()
    render(<Guide />)
    const input = screen.getByPlaceholderText(/Tell me/)
    await user.type(input, 'Test input')
    // 发送按钮已改为 Send SVG 图标（输入栏里的 btn-primary）
    const sendBtn = input.parentElement?.querySelector('button.btn-primary') as HTMLElement
    await user.click(sendBtn)
    await waitFor(() => {
      expect(window.api.guide.runTurn).toHaveBeenCalled()
    })
  })

  it('should render input and send button', () => {
    render(<Guide />)
    const input = screen.getByPlaceholderText(/Tell me/)
    expect(input).toBeDefined()
    expect(input.parentElement?.querySelector('button.btn-primary')).toBeTruthy()
  })
})