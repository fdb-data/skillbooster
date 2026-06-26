import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import Canvas from '../../src/components/Canvas'
import { useSceneStore } from '../../src/store/sceneStore'
import type { ExperienceCard } from '../../src/contracts/ipc-types'

vi.mock('../../src/store/sceneStore', () => ({
  useSceneStore: vi.fn()
}))

const emptyCanvas: ExperienceCard = {
  flows: [],
  rules: [],
  insights: [],
  concepts: [],
  relations: []
}

const canvasWithEntries: ExperienceCard = {
  flows: [
    { id: 'f1', title: 'Step 1: Setup', content: 'Install dependencies', verified: true, source: 'ai', evidenceLevel: 'institutional', createdAt: '', updatedAt: '' },
    { id: 'f2', title: 'Step 2: Configure', content: 'Set up config file', verified: false, source: 'ai', evidenceLevel: 'sample', createdAt: '', updatedAt: '' }
  ],
  rules: [
    { id: 'r1', title: 'Always validate input', content: 'Check all inputs before processing', verified: true, source: 'ai', evidenceLevel: 'validated', createdAt: '', updatedAt: '' }
  ],
  insights: [
    { id: 'i1', title: 'Key insight', content: 'Performance matters', verified: false, source: 'user', evidenceLevel: 'exploratory', createdAt: '', updatedAt: '' }
  ],
  concepts: [],
  relations: []
}

const mockStore = {
  updateCanvas: vi.fn(),
  highlightedEntries: [] as string[]
}

describe('Canvas Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useSceneStore as any).mockImplementation((selector: any) => {
      if (typeof selector === 'function') return selector(mockStore)
      return mockStore
    })
  })

  it('should render Skill header', () => {
    render(<Canvas sceneId="test-scene" canvas={emptyCanvas} />)
    expect(screen.getByText(/【Skill】/)).toBeDefined()
  })

  it('should render section headers with entries', () => {
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getByText(/Flow/i)).toBeDefined()
    expect(screen.getByText(/Rule/i)).toBeDefined()
    expect(screen.getAllByText(/Insight/i).length).toBeGreaterThan(0)
  })

  it('should render entry titles', () => {
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getByText('Step 1: Setup')).toBeDefined()
    expect(screen.getByText('Step 2: Configure')).toBeDefined()
    expect(screen.getByText('Always validate input')).toBeDefined()
    expect(screen.getByText('Key insight')).toBeDefined()
  })

  it('should render add block buttons', () => {
    render(<Canvas sceneId="test-scene" canvas={emptyCanvas} />)
    const addButtons = screen.getAllByText(/Add block/i)
    expect(addButtons.length).toBe(3)
  })

  it('should render evidence dots', () => {
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getAllByText(/Unverified/i).length).toBeGreaterThan(0)
  })

  it('should show flow step numbers', () => {
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getByText('1.')).toBeDefined()
    expect(screen.getByText('2.')).toBeDefined()
  })

  it('should render entry content', () => {
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getByText('Install dependencies')).toBeDefined()
  })

  it('should add new entry on add button click', () => {
    render(<Canvas sceneId="test-scene" canvas={emptyCanvas} />)
    const addButtons = screen.getAllByText(/Add block/i)
    fireEvent.click(addButtons[0])
    expect(mockStore.updateCanvas).toHaveBeenCalled()
  })

  it('should highlight new entries', () => {
    mockStore.highlightedEntries = ['f1']
    render(<Canvas sceneId="test-scene" canvas={canvasWithEntries} />)
    expect(screen.getByText(/New/i)).toBeDefined()
    mockStore.highlightedEntries = []
  })
})