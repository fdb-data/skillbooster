import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../../src/pages/Home'
import { useSceneStore } from '../../src/store/sceneStore'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const mockStore = {
  scenes: [],
  createScene: vi.fn().mockResolvedValue({ id: 'new-scene', name: '未命名项目', status: 'active', canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] }, references: [], conversation: [], createdAt: '', updatedAt: '' }),
  importSkill: vi.fn().mockResolvedValue({ id: 'imported-scene', name: 'imported-skill', status: 'active', canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] }, references: [], scripts: [], assets: [], conversation: [], createdAt: '', updatedAt: '' }),
  draftFromDocs: vi.fn().mockResolvedValue(undefined),
  selectScene: vi.fn().mockResolvedValue(undefined),
  deleteScene: vi.fn(),
  setCurrentPage: vi.fn(),
  setGuideInput: vi.fn(),
  guideInput: '',
  isLoading: false
}

;(useSceneStore as any).getState = () => mockStore

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render hero text and input area', () => {
    render(<Home />)
    expect(screen.getByText(/Teach your expertise to AI/)).toBeDefined()
    expect(screen.getByPlaceholderText(/What experience do you want to extract/)).toBeDefined()
  })

  it('should render start button', () => {
    render(<Home />)
    const buttons = screen.getAllByText(/Start new project/)
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('should call createScene and navigate to guide on start', async () => {
    const user = userEvent.setup()
    render(<Home />)
    const input = screen.getByPlaceholderText(/What experience do you want to extract/)
    await user.type(input, 'Test experience')
    const startBtn = screen.getAllByText(/Start new project/)[0]
    await user.click(startBtn)
    expect(mockStore.createScene).toHaveBeenCalled()
  })

  it('should display project cards', () => {
    mockStore.scenes = [{
      id: 's1', name: 'Project 1', status: 'active',
      canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] },
      references: [], conversation: [], createdAt: '', updatedAt: ''
    }]
    render(<Home />)
    expect(screen.getByText('Project 1')).toBeDefined()
    mockStore.scenes = []
  })

  it('should show hero title', () => {
    render(<Home />)
    expect(screen.getByText(/Teach your expertise/)).toBeDefined()
  })

  it('should have file attach button', () => {
    // 附件按钮已改为 Paperclip SVG 图标
    const { container } = render(<Home />)
    expect(container.querySelector('button svg')).toBeTruthy()
  })

  it('should show drag hint text', () => {
    render(<Home />)
    expect(screen.getByText(/drop in a document/)).toBeDefined()
  })

  it('should render the import-skill entry', () => {
    render(<Home />)
    expect(screen.getByText(/Import Skill/)).toBeDefined()
    expect(screen.getByText(/Pick file \/ archive/)).toBeDefined()
    expect(screen.getByText(/Pick folder/)).toBeDefined()
  })

  it('shows the verbatim rewrite warning before importing and imports on confirm', async () => {
    const user = userEvent.setup()
    ;(window.api.skill.pickImportPath as any).mockResolvedValueOnce({ success: true, data: { path: '/some/skill' } })
    render(<Home />)

    await user.click(screen.getByText(/Pick folder/))
    // 弹窗显示原文警告
    await waitFor(() => expect(screen.getByText('将会按照 Skill Booster 的格式进行改写，请注意保留源技能')).toBeDefined())

    await user.click(screen.getByText(/Confirm/))
    await waitFor(() => expect(mockStore.importSkill).toHaveBeenCalledWith('/some/skill'))
    expect(mockStore.draftFromDocs).toHaveBeenCalledWith('imported-scene')
  })

  it('cancel dismisses the warning without importing', async () => {
    const user = userEvent.setup()
    ;(window.api.skill.pickImportPath as any).mockResolvedValueOnce({ success: true, data: { path: '/some/skill' } })
    render(<Home />)

    await user.click(screen.getByText(/Pick file \/ archive/))
    await waitFor(() => expect(screen.getByText('将会按照 Skill Booster 的格式进行改写，请注意保留源技能')).toBeDefined())

    await user.click(screen.getByText(/Cancel/))
    expect(mockStore.importSkill).not.toHaveBeenCalled()
  })
})