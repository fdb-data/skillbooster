import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
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
  isLoading: false,
  // 验证状态/动作已提到 store
  valBare: '', valSkill: '', valRunning: false, valAnalyzing: false,
  valControl: null, valCaseResults: {}, valSingleEntry: null,
  valRunningCaseId: null, valRunAll: null,
  valLoadResults: vi.fn(),
  valRunSingle: vi.fn(),
  valRunCase: vi.fn(),
  valRunAllCases: vi.fn(),
  valDeleteCaseResult: vi.fn(),
  valClearCaseResults: vi.fn(),
  // 验证回放
  replayCases: [],
  replayLoading: false,
  replayReport: null,
  replayError: null,
  loadReplayCases: vi.fn(),
  addReplayCase: vi.fn(),
  updateReplayCase: vi.fn(),
  deleteReplayCase: vi.fn(),
  runReplay: vi.fn(),
  clearReplayReport: vi.fn()
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

  it('should delegate single run to the store on button click', async () => {
    const user = userEvent.setup()
    render(<Validate />)
    const input = screen.getByPlaceholderText(/Enter a test instruction/)
    await user.type(input, 'How to test?')
    const btn = screen.getByText(/Run comparison/)
    await user.click(btn)
    await waitFor(() => {
      expect(mockStore.valRunSingle).toHaveBeenCalledWith('validate-scene', 'How to test?')
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

  it('should switch to replay tab and show case library', async () => {
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText(/案例库/)).toBeDefined()
    })
    expect(screen.getByText('+ 新增案例')).toBeDefined()
  })

  it('should open case editor when adding a replay case', async () => {
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText('+ 新增案例')).toBeDefined()
    })
    fireEvent.click(screen.getByText('+ 新增案例'))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('新增案例')).toBeDefined()
    })
  })

  it('should render replay case list when not empty', async () => {
    const cases = [{ id: 'case-1', instruction: 'Test case one', sortOrder: 0 }]
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      const store = { ...mockStore, replayCases: cases }
      if (typeof selector === 'function') return selector(store)
      return store
    })
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText('Test case one')).toBeDefined()
      expect(screen.getByText(/案例库（1）/)).toBeDefined()
    })
  })

  it('should open case editor with initial case on edit click', async () => {
    const cases = [{ id: 'case-1', instruction: 'Test case one', sortOrder: 0 }]
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      const store = { ...mockStore, replayCases: cases }
      if (typeof selector === 'function') return selector(store)
      return store
    })
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText('Test case one')).toBeDefined()
    })
    fireEvent.click(screen.getByText('编辑'))
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('编辑案例')).toBeDefined()
    })
  })

  it('should call deleteReplayCase and clear selection on delete click', async () => {
    const cases = [{ id: 'case-1', instruction: 'Test case one', sortOrder: 0 }]
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      const store = { ...mockStore, replayCases: cases }
      if (typeof selector === 'function') return selector(store)
      return store
    })
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText('Test case one')).toBeDefined()
    })
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    fireEvent.click(screen.getByText('删除'))
    await waitFor(() => {
      expect(mockStore.deleteReplayCase).toHaveBeenCalledWith('validate-scene', 'case-1')
    })
    expect(checkbox.checked).toBe(false)
  })

  it('should call runReplay with all cases when run all clicked', async () => {
    const cases = [
      { id: 'case-1', instruction: 'Test case one', sortOrder: 0 },
      { id: 'case-2', instruction: 'Test case two', sortOrder: 1 }
    ]
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      const store = { ...mockStore, replayCases: cases }
      if (typeof selector === 'function') return selector(store)
      return store
    })
    render(<Validate />)
    fireEvent.click(screen.getByText('验证回放'))
    await waitFor(() => {
      expect(screen.getByText('运行全部')).toBeDefined()
    })
    fireEvent.click(screen.getByText('运行全部'))
    await waitFor(() => {
      expect(mockStore.runReplay).toHaveBeenCalledWith('validate-scene', undefined)
    })
  })
})