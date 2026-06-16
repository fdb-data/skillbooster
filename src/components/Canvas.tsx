import React, { useState, useEffect, useRef } from 'react'
import { useSceneStore } from '../store/sceneStore'
import type { ExperienceCard, KnowledgeEntry } from '../contracts/ipc-types'
import { generateId } from '../utils/uuid'

const evidenceColors: Record<string, string> = {
  institutional: '#2E9E6B', validated: '#3B82F6', sample: '#E0A93B', exploratory: '#E05D5D'
}

const sectionBorderColors: Record<string, string> = {
  flows: '#3B82F6', rules: '#2563EB', insights: '#E08A2B'
}

const sectionTitles: Record<string, string> = {
  flows: '流程 · 怎么做',
  rules: '规则 · 怎么判 / 怎么防',
  insights: '洞察 · 怎么看'
}

const Canvas: React.FC<{ sceneId: string; canvas: ExperienceCard }> = ({ sceneId, canvas }) => {
  const updateCanvas = useSceneStore(s => s.updateCanvas)
  const highlightedEntries = useSceneStore(s => s.highlightedEntries)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [fadedIds, setFadedIds] = useState<Set<string>>(new Set())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const sections: Array<{ key: 'flows' | 'rules' | 'insights'; entries: KnowledgeEntry[] }> = [
    { key: 'flows', entries: canvas.flows },
    { key: 'rules', entries: canvas.rules },
    { key: 'insights', entries: canvas.insights }
  ]

  const totalEntries = canvas.flows.length + canvas.rules.length + canvas.insights.length
  const filledDots = Math.min(5, Math.ceil(totalEntries / 3))

  useEffect(() => {
    const timers = timersRef.current
    const allEntries = [...canvas.flows, ...canvas.rules, ...canvas.insights]
    allEntries.forEach(entry => {
      if (highlightedEntries.includes(entry.id) && !timers.has(entry.id)) {
        const timer = setTimeout(() => {
          setFadedIds(prev => new Set(prev).add(entry.id))
          timers.delete(entry.id)
        }, 3000)
        timers.set(entry.id, timer)
      }
    })
    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [highlightedEntries, canvas.flows, canvas.rules, canvas.insights])

  const handleAdd = (sectionKey: 'flows' | 'rules' | 'insights') => {
    const entry: KnowledgeEntry = {
      id: generateId(), title: '新条目', content: '', verified: false, source: 'user',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    }
    updateCanvas(sceneId, { ...canvas, [sectionKey]: [...canvas[sectionKey], entry] })
    setEditingId(entry.id)
    setEditTitle(entry.title)
    setEditContent(entry.content)
  }

  const handleEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id)
    setEditTitle(entry.title)
    setEditContent(entry.content)
  }

  const handleSave = (sectionKey: 'flows' | 'rules' | 'insights') => {
    if (!editingId) return
    const newEntries = canvas[sectionKey].map(e =>
      e.id === editingId ? { ...e, title: editTitle, content: editContent, updatedAt: new Date().toISOString() } : e
    )
    updateCanvas(sceneId, { ...canvas, [sectionKey]: newEntries })
    setEditingId(null)
  }

  const handleDelete = (sectionKey: 'flows' | 'rules' | 'insights', id: string) => {
    updateCanvas(sceneId, { ...canvas, [sectionKey]: canvas[sectionKey].filter(e => e.id !== id) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{
        background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 10,
        padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10
      }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>【Skill】{sceneId}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i <= filledDots ? 'var(--accent)' : 'var(--line)'
            }} />
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', paddingLeft: 12 }}>
        <div style={{
          position: 'absolute', left: 4, top: 0, bottom: 0, width: 2,
          background: 'var(--accent-edge)'
        }} />

        {sections.map(section => {
          const borderColor = sectionBorderColors[section.key]
          return (
            <div key={section.key} style={{ marginBottom: 16, position: 'relative' }}>
              <div style={{
                position: 'absolute', left: -12, top: 0, bottom: 0, width: 2,
                background: borderColor
              }} />
              <h4 style={{
                fontSize: 11, fontWeight: 600, color: 'var(--ink)', marginBottom: 8,
                paddingLeft: 8, borderLeft: `4px solid ${borderColor}`
              }}>
                {sectionTitles[section.key]} ({section.entries.length})
              </h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 12 }}>
                {section.entries.map((entry, idx) => {
                  const isNew = highlightedEntries.includes(entry.id)
                  const isEditing = editingId === entry.id
                  return (
                    <div key={entry.id}
                      className={isNew && !fadedIds.has(entry.id) ? 'block-new' : isNew && fadedIds.has(entry.id) ? 'block-new-fade faded' : ''}
                      style={{
                        borderLeft: `4px solid ${borderColor}`,
                        background: isNew && !fadedIds.has(entry.id) ? '#FBFAFF' : '#fff',
                        border: isNew && !fadedIds.has(entry.id) ? undefined : '1px solid var(--line)',
                        borderLeftWidth: 4, borderLeftColor: borderColor,
                        borderRadius: 8, padding: '8px 10px',
                        position: 'relative'
                      }}>
                      {isEditing ? (
                        <div>
                          <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                            style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 11, marginBottom: 4, boxSizing: 'border-box', outline: 'none' }} />
                          <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
                            style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 10, minHeight: 36, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            <button onClick={() => handleSave(section.key)} className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>保存</button>
                            <button onClick={() => setEditingId(null)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {section.key === 'flows' && <span style={{ fontSize: 9, color: 'var(--tri)', fontWeight: 600 }}>{idx + 1}.</span>}
                            {entry.evidenceLevel && (
                              <div style={{ width: 7, height: 7, borderRadius: '50%', background: evidenceColors[entry.evidenceLevel] || 'var(--tri)', flexShrink: 0 }} />
                            )}
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{entry.title}</span>
                            {isNew && <span style={{ fontSize: 8, padding: '0 4px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 3 }}>刚长出</span>}
                            {!entry.verified && !isNew && <span style={{ fontSize: 8, padding: '0 4px', background: '#FFF6E6', color: '#C8862A', borderRadius: 3 }}>待验证</span>}
                          </div>
                          {entry.content && <p style={{ margin: '3px 0 0', fontSize: 10, color: 'var(--sub)', lineHeight: 1.5 }}>{entry.content}</p>}
                          <div className="block-actions" style={{ display: 'flex', gap: 2, marginTop: 4, opacity: 0, transition: 'opacity 0.2s' }}>
                            <button onClick={() => handleEdit(entry)} style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10 }}>✎</button>
                            <button onClick={() => handleDelete(section.key, entry.id)} style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10 }}>🗑</button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div style={{ paddingLeft: 12, marginTop: 4 }}>
                <button onClick={() => handleAdd(section.key)} className="btn-ghost" style={{ padding: '4px 10px', fontSize: 9 }}>
                  + 添加积木
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Canvas
