import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import ConceptTree from '../../src/components/ConceptTree'
import type { KnowledgeEntry } from '../../src/contracts/ipc-types'

const concepts: KnowledgeEntry[] = [
  { id: 'c1', title: 'React', content: 'UI library', verified: true, source: 'ai', createdAt: '', updatedAt: '' },
  { id: 'c2', title: 'Testing', content: 'Quality assurance', verified: true, source: 'ai', createdAt: '', updatedAt: '' },
  { id: 'c3', title: 'TypeScript', content: 'Typed JS', verified: false, source: 'user', createdAt: '', updatedAt: '' }
]

const relations: KnowledgeEntry[] = [
  { id: 'r1', title: 'React → Testing', content: 'React components need testing', verified: true, source: 'ai', createdAt: '', updatedAt: '' },
  { id: 'r2', title: 'React → TypeScript', content: 'React works well with TypeScript', verified: true, source: 'ai', createdAt: '', updatedAt: '' }
]

describe('ConceptTree Component', () => {
  it('should render concept titles', () => {
    render(<ConceptTree concepts={concepts} relations={relations} />)
    expect(screen.getAllByText('React').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Testing').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('TypeScript').length).toBeGreaterThanOrEqual(1)
  })

  it('should render relation entries as child items', () => {
    render(<ConceptTree concepts={concepts} relations={relations} />)
    expect(screen.getAllByText('React').length).toBeGreaterThanOrEqual(2)
  })

  it('should show empty state when no concepts', () => {
    render(<ConceptTree concepts={[]} relations={[]} />)
    expect(screen.getAllByText(/从对话与文档中自动提取/).length).toBeGreaterThan(0)
  })

  it('should render section header', () => {
    render(<ConceptTree concepts={concepts} relations={relations} />)
    expect(screen.getByText(/概念树/)).toBeDefined()
  })
})