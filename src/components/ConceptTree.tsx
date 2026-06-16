import React, { useState } from 'react'
import type { KnowledgeEntry } from '../contracts/ipc-types'

const ConceptTree: React.FC<{ concepts: KnowledgeEntry[]; relations: KnowledgeEntry[] }> = ({ concepts, relations }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(concepts.slice(0, 3).map(c => c.id)))

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const getChildren = (parentId: string) => {
    return relations
      .filter(r => r.content.includes(parentId) || r.title.includes(concepts.find(c => c.id === parentId)?.title || ''))
      .map(r => concepts.find(c => r.content.includes(c.title) && c.id !== parentId))
      .filter(Boolean) as KnowledgeEntry[]
  }

  return (
    <div>
      <h4 style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)', marginBottom: 8 }}>概念树</h4>
      {concepts.length === 0 ? (
        <p style={{ fontSize: 9, color: 'var(--tri)' }}>从对话与文档中自动提取</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {concepts.map(concept => {
            const isExpanded = expanded.has(concept.id)
            const children = getChildren(concept.id)
            return (
              <div key={concept.id}>
                <div
                  onClick={() => toggle(concept.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '3px 4px',
                    borderRadius: 4, cursor: 'pointer', fontSize: 10,
                    color: isExpanded ? 'var(--ink)' : 'var(--sub)',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--canvas)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 8 }}>{children.length > 0 ? (isExpanded ? '▾' : '▸') : '·'}</span>
                  <span>{concept.title}</span>
                </div>
                {isExpanded && children.length > 0 && (
                  <div style={{ marginLeft: 16 }}>
                    {children.map(child => (
                      <div key={child.id} style={{ padding: '2px 4px', fontSize: 10, color: 'var(--sub)' }}>
                        {child.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p style={{ fontSize: 8, color: 'var(--tri)', marginTop: 8 }}>从对话与文档中自动提取，点击可改</p>
    </div>
  )
}

export default ConceptTree