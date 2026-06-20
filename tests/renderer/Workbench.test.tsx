import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Workbench from '../../src/pages/Workbench'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

vi.mock('../../src/components/ReferencePanel', () => ({
  default: () => <div data-testid="reference-panel">References</div>
}))

vi.mock('../../src/components/FileAttachmentPanel', () => ({
  default: ({ kind }: { kind: string }) => <div data-testid={`attachment-panel-${kind}`}>{kind}</div>
}))

vi.mock('../../src/components/Conversation', () => ({
  default: () => <div data-testid="conversation">Conversation</div>
}))

vi.mock('../../src/components/FlowCanvas', () => ({
  default: () => <div data-testid="canvas">Canvas</div>
}))

const mockScene = {
  id: 'wb-scene', name: 'Test Workbench', status: 'active',
  canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] },
  references: [], scripts: [], assets: [], conversation: [], createdAt: '', updatedAt: ''
}

const mockStore = {
  currentScene: mockScene,
  setCurrentPage: vi.fn(),
  isLoading: false
}

describe('Workbench Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render scene name', () => {
    render(<Workbench />)
    expect(screen.getByText('Test Workbench')).toBeDefined()
  })

  it('should render validate button', () => {
    render(<Workbench />)
    expect(screen.getByText('Validation')).toBeDefined()
  })

  it('should render export button', () => {
    render(<Workbench />)
    expect(screen.getByText('Export / Deploy')).toBeDefined()
  })

  it('should render back button', () => {
    // 返回按钮已改为 ArrowLeft SVG 图标
    const { container } = render(<Workbench />)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('should render conversation + canvas with collapsible resources', () => {
    render(<Workbench />)
    // 双主栏：对话 + 画布常驻
    expect(screen.getByTestId('canvas')).toBeDefined()
    expect(screen.getByTestId('conversation')).toBeDefined()
    // 资源面板默认收起为竖条，点击展开浮层后才渲染
    expect(screen.queryByTestId('reference-panel')).toBeNull()
    fireEvent.click(screen.getByText('References'))
    expect(screen.getByTestId('reference-panel')).toBeDefined()
  })

  it('should navigate to validate on validate button click', async () => {
    render(<Workbench />)
    fireEvent.click(screen.getByText('Validation'))
    expect(mockStore.setCurrentPage).toHaveBeenCalledWith('validate')
  })

  it('should call export on export button click', async () => {
    render(<Workbench />)
    fireEvent.click(screen.getByText('Export / Deploy'))
    await waitFor(() => {
      expect(window.api.export.healthCheck).toHaveBeenCalledWith('wb-scene')
    })
  })

  it('should show empty state when no scene', () => {
    (useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector({ ...mockStore, currentScene: null })
      return { ...mockStore, currentScene: null }
    })
    render(<Workbench />)
    expect(screen.getByText(/Please select a project/)).toBeDefined()
  })
})