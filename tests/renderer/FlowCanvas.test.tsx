import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import FlowCanvas from '../../src/components/FlowCanvas'
import { useSceneStore } from '../../src/store/sceneStore'
import type { ExperienceCard } from '../../src/contracts/ipc-types'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockStore = {
  applyCanvasOp: vi.fn(),
  undoCanvas: vi.fn(),
  redoCanvas: vi.fn(),
  canUndo: false,
  canRedo: false,
  highlightedEntries: [] as string[],
  proposals: [] as Array<{ id: string; proposal: { id: string; type: string; title: string; content: string }; status: string }>,
  applyProposal: vi.fn(),
  rejectProposal: vi.fn()
}

const canvas: ExperienceCard = {
  flows: [{ id: 'f1', title: '第一步初审', content: '检查资质文件', verified: false, evidenceLevel: 'validated', createdAt: '', updatedAt: '' }],
  rules: [{ id: 'r1', title: '超50万会签', content: '超过50万的合同必须法务会签', verified: true, evidenceLevel: 'institutional', createdAt: '', updatedAt: '' }],
  insights: [],
  concepts: [],
  relations: [],
  layout: {
    positions: { f1: { x: 10, y: 10 } },
    edges: []
  }
}

describe('FlowCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as unknown as ReturnType<typeof vi.fn>).mockImplementation((selector: (s: typeof mockStore) => unknown) => selector(mockStore))
  })

  it('should render knowledge entries as nodes', () => {
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={canvas} /></div>)
    expect(screen.getByText('第一步初审')).toBeDefined()
    expect(screen.getByText('超50万会签')).toBeDefined()
  })

  it('should render the palette with three active block types', () => {
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={canvas} /></div>)
    // 元件栏改为左侧竖条，仅图标+类型名（无标题），Flow/Rule/Insight 仍在
    expect(screen.getAllByText('Flow').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rule').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Insight').length).toBeGreaterThan(0)
    // concept/relation 为企业级特性，当前版本不出现在元件栏
    expect(screen.queryByText('Concept')).toBeNull()
    expect(screen.queryByText('Relation')).toBeNull()
  })

  it('should show progress indicator with block count', () => {
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={canvas} /></div>)
    expect(screen.getByText('2 blocks')).toBeDefined()
  })

  it('should render without layout data (auto layout fallback)', () => {
    const noLayout: ExperienceCard = { ...canvas, layout: undefined }
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={noLayout} /></div>)
    expect(screen.getByText('第一步初审')).toBeDefined()
  })

  it('should render proposals as ghost blocks with accept/reject actions', () => {
    mockStore.proposals = [
      { id: 'p1', proposal: { id: 'p1', type: 'insight', title: '金额越大审批越长', content: '从案例归纳的模式' }, status: 'pending' }
    ]
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={canvas} /></div>)
    expect(screen.getByText('金额越大审批越长')).toBeDefined()
    expect(screen.getByText('✓ Accept')).toBeDefined()
    expect(screen.getByText('✕ Reject')).toBeDefined()
    mockStore.proposals = []
  })

  it('should call rejectProposal when reject is clicked', () => {
    mockStore.proposals = [
      { id: 'p2', proposal: { id: 'p2', type: 'rule', title: '某提议规则', content: '内容' }, status: 'pending' }
    ]
    render(<div style={{ width: 800, height: 600 }}><FlowCanvas sceneId="s1" canvas={canvas} /></div>)
    screen.getByText('✕ Reject').click()
    expect(mockStore.rejectProposal).toHaveBeenCalledWith('p2')
    mockStore.proposals = []
  })
})
