import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Conversation from '../../src/components/Conversation'
import { useSceneStore } from '../../src/store/sceneStore'
import type { ConversationMessage } from '../../src/contracts/ipc-types'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const messages: ConversationMessage[] = [
  { id: 'm1', sceneId: 's1', role: 'user', content: 'Hello AI', createdAt: '' },
  { id: 'm2', sceneId: 's1', role: 'assistant', content: 'Hello! How can I help?', createdAt: '' },
  { id: 'm3', sceneId: 's1', role: 'user', content: 'Tell me about testing', createdAt: '' },
  { id: 'm4', sceneId: 's1', role: 'assistant', content: 'Testing is important for quality.', createdAt: '' }
]

const mockStore = {
  isLoading: false,
  runTurn: vi.fn().mockResolvedValue(undefined),
  proposals: [],
  streamingText: null,
  agentStatus: null,
  activeRunId: null,
  abortRun: vi.fn()
}

describe('Conversation Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render conversation messages', () => {
    render(<Conversation sceneId="s1" conversation={messages} />)
    expect(screen.getByText('Hello AI')).toBeDefined()
    expect(screen.getByText('Hello! How can I help?')).toBeDefined()
    expect(screen.getByText('Tell me about testing')).toBeDefined()
    expect(screen.getByText('Testing is important for quality.')).toBeDefined()
  })

  it('should render input area', () => {
    render(<Conversation sceneId="s1" conversation={messages} />)
    expect(screen.getByPlaceholderText(/Tell me/)).toBeDefined()
  })

  it('should render send button', () => {
    // 发送按钮已改为 Send SVG 图标（btn-primary）
    const { container } = render(<Conversation sceneId="s1" conversation={messages} />)
    expect(container.querySelector('button.btn-primary')).toBeTruthy()
  })

  it('should call runTurn on send', async () => {
    const user = userEvent.setup()
    const { container } = render(<Conversation sceneId="s1" conversation={messages} />)
    const input = screen.getByPlaceholderText(/Tell me/)
    await user.type(input, 'New message')
    const sendBtn = container.querySelector('button.btn-primary') as HTMLElement
    await user.click(sendBtn)
    expect(mockStore.runTurn).toHaveBeenCalledWith('s1', 'New message')
  })

  it('should show empty state when no messages', () => {
    render(<Conversation sceneId="s1" conversation={[]} />)
    expect(screen.getByText(/start extracting/)).toBeDefined()
  })
})