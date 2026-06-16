import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Panel,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position
} from '@xyflow/react'
import type { Node, Edge, Connection, NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { ExperienceCard, KnowledgeEntry, KnowledgeType, KnowledgeKey, CanvasEdge, Proposal, CanvasPosition, FlowStep } from '../contracts/ipc-types'
import { generateId } from '../utils/uuid'

/** 流程节点：把 entry 解析成结构化步骤。优先用 steps，旧数据按 content 行拆分（标题：说明） */
function deriveSteps(entry: KnowledgeEntry): FlowStep[] {
  if (entry.steps && entry.steps.length > 0) return entry.steps
  const text = entry.content?.trim()
  if (!text) return []
  return text.split('\n').map(l => l.trim()).filter(Boolean).map(line => {
    const sep = line.search(/[：:]/)
    if (sep >= 0) return { title: line.slice(0, sep).trim(), desc: line.slice(sep + 1).trim() }
    return { title: line, desc: '' }
  })
}

/** 步骤 → content 纯文本，供导出/agent/验证继续读 content */
function stepsToContent(steps: FlowStep[]): string {
  return steps.map(s => s.desc ? `${s.title}：${s.desc}` : s.title).join('\n')
}

const TYPE_CONFIG: Record<KnowledgeType, { labelKey: string; color: string; hintKey: string }> = {
  flow: { labelKey: 'canvas.typeFlowLabel', color: '#3B82F6', hintKey: 'canvas.typeFlowHint' },
  rule: { labelKey: 'canvas.typeRuleLabel', color: '#2563EB', hintKey: 'canvas.typeRuleHint' },
  insight: { labelKey: 'canvas.typeInsightLabel', color: '#E08A2B', hintKey: 'canvas.typeInsightHint' },
  concept: { labelKey: 'canvas.typeConceptLabel', color: '#8B5CF6', hintKey: 'canvas.typeConceptHint' },
  relation: { labelKey: 'canvas.typeRelationLabel', color: '#10B981', hintKey: 'canvas.typeRelationHint' }
}

// 渲染兼容全部类型（旧数据可能含 concept/relation）
const KNOWLEDGE_TYPES: KnowledgeType[] = ['flow', 'rule', 'insight', 'concept', 'relation']
// 元件栏只开放当前版本启用的类型（concept/relation 为企业级特性，暂不开放）
const PALETTE_TYPES: KnowledgeType[] = ['flow', 'rule', 'insight']

const EVIDENCE_OPTIONS: Array<{ value: NonNullable<KnowledgeEntry['evidenceLevel']>; labelKey: string; color: string }> = [
  { value: 'institutional', labelKey: 'canvas.evidenceInstitutional', color: '#2E9E6B' },
  { value: 'validated', labelKey: 'canvas.evidenceValidated', color: '#3B82F6' },
  { value: 'sample', labelKey: 'canvas.evidenceSample', color: '#E0A93B' },
  { value: 'exploratory', labelKey: 'canvas.evidenceExploratory', color: '#E05D5D' }
]

const evidenceColor = (level?: string): string =>
  EVIDENCE_OPTIONS.find(o => o.value === level)?.color ?? 'var(--tri)'

interface KnowledgeNodeData {
  entry: KnowledgeEntry
  ktype: KnowledgeType
  highlighted: boolean
  editing: boolean
  onStartEdit: (id: string) => void
  onSave: (id: string, patch: { title: string; content: string; evidenceLevel: KnowledgeEntry['evidenceLevel'] }) => void
  onSaveSteps: (id: string, steps: FlowStep[]) => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  [key: string]: unknown
}

type KnowledgeFlowNode = Node<KnowledgeNodeData, 'knowledge'>

/** 展开态步骤列表：增删改 + 上下移；任一结构变化即通过 onChange 回写（content 同步在外层） */
const FlowSteps: React.FC<{ steps: FlowStep[]; color: string; onChange: (steps: FlowStep[]) => void }> = ({ steps, color, onChange }) => {
  const { t } = useTranslation()
  const [editIndex, setEditIndex] = useState<number | null>(null) // === steps.length 表示新增
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDesc, setDraftDesc] = useState('')

  const beginEdit = (i: number) => { setEditIndex(i); setDraftTitle(steps[i].title); setDraftDesc(steps[i].desc) }
  const beginAdd = () => { setEditIndex(steps.length); setDraftTitle(''); setDraftDesc('') }
  const cancel = () => setEditIndex(null)
  const commit = () => {
    if (editIndex === null) return
    const title = draftTitle.trim()
    if (!title) { setEditIndex(null); return }
    const step: FlowStep = { title, desc: draftDesc.trim() }
    const next = editIndex === steps.length ? [...steps, step] : steps.map((s, i) => i === editIndex ? step : s)
    onChange(next); setEditIndex(null)
  }
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = steps.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  const editRow = (n: number) => (
    <div className="nodrag" style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
      <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>{n}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <input value={draftTitle} autoFocus onChange={e => setDraftTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
          placeholder={t('canvas.stepTitlePlaceholder')}
          style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 11, marginBottom: 3, boxSizing: 'border-box', outline: 'none' }} />
        <input value={draftDesc} onChange={e => setDraftDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
          placeholder={t('canvas.stepDescPlaceholder')}
          style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 10, boxSizing: 'border-box', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
          <button onClick={commit} className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>{t('common.save')}</button>
          <button onClick={cancel} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'relative', marginTop: 4 }}>
      {steps.length > 1 && <div style={{ position: 'absolute', left: 7, top: 10, bottom: 16, width: 2, background: `${color}33` }} />}
      {steps.map((s, i) => editIndex === i ? (
        <React.Fragment key={i}>{editRow(i + 1)}</React.Fragment>
      ) : (
        <div key={i} onMouseEnter={() => setHoverIndex(i)} onMouseLeave={() => setHoverIndex(null)}
          style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '3px 0', position: 'relative' }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', background: color, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, zIndex: 1 }}>{i + 1}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{s.title}</div>
            {s.desc && <div style={{ fontSize: 9, color: 'var(--tri)', lineHeight: 1.4, marginTop: 1 }}>{s.desc}</div>}
          </div>
          {hoverIndex === i && (
            <div className="nodrag" style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
              <button title={t('canvas.moveStepUp')} disabled={i === 0} onClick={() => move(i, -1)}
                style={{ background: 'none', border: 'none', color: i === 0 ? 'var(--line)' : 'var(--tri)', cursor: i === 0 ? 'default' : 'pointer', fontSize: 10, padding: 0 }}>↑</button>
              <button title={t('canvas.moveStepDown')} disabled={i === steps.length - 1} onClick={() => move(i, 1)}
                style={{ background: 'none', border: 'none', color: i === steps.length - 1 ? 'var(--line)' : 'var(--tri)', cursor: i === steps.length - 1 ? 'default' : 'pointer', fontSize: 10, padding: 0 }}>↓</button>
              <button onClick={() => beginEdit(i)} style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10, padding: 0 }}>✎</button>
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10, padding: 0 }}>🗑</button>
            </div>
          )}
        </div>
      ))}
      {editIndex === steps.length && editRow(steps.length + 1)}
      {editIndex !== steps.length && (
        <button className="nodrag" onClick={beginAdd}
          style={{ background: 'none', border: '1px dashed var(--line)', borderRadius: 12, color: 'var(--tri)', cursor: 'pointer', fontSize: 9, padding: '2px 10px', marginTop: 6, marginLeft: 24 }}>
          {t('canvas.addStep')}
        </button>
      )}
    </div>
  )
}

const KnowledgeNode: React.FC<NodeProps<KnowledgeFlowNode>> = ({ data }) => {
  const { t } = useTranslation()
  const { entry, ktype, highlighted, editing } = data
  const config = TYPE_CONFIG[ktype]
  const [title, setTitle] = useState(entry.title)
  const [content, setContent] = useState(entry.content)
  const [evidence, setEvidence] = useState<KnowledgeEntry['evidenceLevel']>(entry.evidenceLevel)
  const [expanded, setExpanded] = useState(false) // 展开态仅 UI 状态，不入经验卡
  const isFlow = ktype === 'flow'
  const flowSteps = isFlow ? deriveSteps(entry) : []

  useEffect(() => {
    if (editing) {
      setTitle(entry.title)
      setContent(entry.content)
      setEvidence(entry.evidenceLevel)
    }
  }, [editing, entry.title, entry.content, entry.evidenceLevel])

  return (
    <div
      className={highlighted ? 'block-new' : ''}
      style={{
        width: 240, background: highlighted ? '#FBFAFF' : '#fff',
        border: '1px solid var(--line)', borderLeft: `4px solid ${config.color}`,
        borderRadius: 8, padding: '8px 10px', fontSize: 11
      }}>
      <Handle type="target" position={Position.Top} style={{ background: config.color, width: 7, height: 7 }} />
      {editing ? (
        <div className="nodrag">
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            placeholder={t('canvas.titlePlaceholder')}
            style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 11, marginBottom: 4, boxSizing: 'border-box', outline: 'none' }} />
          {/* 流程节点内容由步骤拼接，content 不在此直接编辑 */}
          {!isFlow && (
            <textarea value={content} onChange={e => setContent(e.target.value)}
              placeholder={t('canvas.contentPlaceholder')}
              style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 10, minHeight: 48, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
          )}
          <div style={{ display: 'flex', gap: 3, margin: '4px 0', flexWrap: 'wrap' }}>
            {EVIDENCE_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setEvidence(o.value)}
                style={{
                  fontSize: 8, padding: '2px 6px', borderRadius: 999, cursor: 'pointer',
                  border: `1px solid ${evidence === o.value ? o.color : 'var(--line)'}`,
                  background: evidence === o.value ? o.color : '#fff',
                  color: evidence === o.value ? '#fff' : 'var(--sub)'
                }}>{t(o.labelKey)}</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => data.onSave(entry.id, { title, content, evidenceLevel: evidence })}
              className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>{t('common.save')}</button>
            <button onClick={() => data.onCancelEdit()} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8, padding: '0 5px', background: `${config.color}1A`, color: config.color, borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>{t(config.labelKey)}</span>
            {entry.evidenceLevel && (
              <div title={entry.evidenceLevel} style={{ width: 7, height: 7, borderRadius: '50%', background: evidenceColor(entry.evidenceLevel), flexShrink: 0 }} />
            )}
            <span style={{ fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
          </div>
          {isFlow ? (
            expanded ? (
              <div>
                <button className="nodrag" onClick={() => setExpanded(false)}
                  style={{ width: '100%', textAlign: 'center', background: '#F4F8FF', border: '1px solid #D6E4FB', borderRadius: 6, color: config.color, cursor: 'pointer', fontSize: 10, fontWeight: 600, padding: '4px 0', margin: '6px 0 2px' }}>
                  ▴ {t('canvas.collapseSteps')}
                </button>
                {flowSteps.length === 0 && (
                  <div style={{ fontSize: 9, color: 'var(--tri)', textAlign: 'center', margin: '4px 0' }}>{t('canvas.noSteps')}</div>
                )}
                <FlowSteps steps={flowSteps} color={config.color} onChange={s => data.onSaveSteps(entry.id, s)} />
              </div>
            ) : (
              <div>
                {flowSteps.length > 0 && (
                  <p style={{ margin: '4px 0 0', fontSize: 10, color: 'var(--sub)', lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {flowSteps.map(s => s.title).join('，')}
                  </p>
                )}
                <button className="nodrag" onClick={() => setExpanded(true)}
                  style={{ width: '100%', textAlign: 'center', background: '#F4F8FF', border: '1px solid #D6E4FB', borderRadius: 6, color: config.color, cursor: 'pointer', fontSize: 10, fontWeight: 600, padding: '4px 0', marginTop: 6 }}>
                  ▾ {flowSteps.length > 0 ? t('canvas.expandSteps', { count: flowSteps.length }) : t('canvas.expandStepsEmpty')}
                </button>
              </div>
            )
          ) : (
            entry.content && (
              <p style={{
                margin: '4px 0 0', fontSize: 10, color: 'var(--sub)', lineHeight: 1.5,
                display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
              }}>{entry.content}</p>
            )
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5 }}>
            {highlighted && <span style={{ fontSize: 8, padding: '0 4px', background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 3 }}>{t('canvas.justGrown')}</span>}
            {!entry.verified && !highlighted && <span style={{ fontSize: 8, padding: '0 4px', background: '#FFF6E6', color: '#C8862A', borderRadius: 3 }}>{t('canvas.toVerify')}</span>}
            <span style={{ flex: 1 }} />
            <button className="nodrag" onClick={() => data.onStartEdit(entry.id)}
              style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10, padding: 0 }}>✎</button>
            <button className="nodrag" onClick={() => data.onDelete(entry.id)}
              style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', fontSize: 10, padding: 0 }}>🗑</button>
          </div>
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ background: config.color, width: 7, height: 7 }} />
    </div>
  )
}

interface GhostNodeData {
  proposal: Proposal
  ktype: KnowledgeType
  onAccept: (proposalId: string, override?: { title: string; content: string }) => void
  onReject: (proposalId: string) => void
  [key: string]: unknown
}

type GhostFlowNode = Node<GhostNodeData, 'ghost'>

/** 幽灵积木：agent 的提议，半透明虚线呈现，原地采纳/拒绝/改 */
const GhostNode: React.FC<NodeProps<GhostFlowNode>> = ({ data }) => {
  const { t } = useTranslation()
  const { proposal, ktype } = data
  const config = TYPE_CONFIG[ktype]
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(proposal.title)
  const [content, setContent] = useState(proposal.content)

  return (
    <div
      className="ghost-block"
      style={{
        width: 240, background: 'rgba(255,255,255,0.82)',
        border: `1.5px dashed ${config.color}`, borderRadius: 8, padding: '8px 10px', fontSize: 11
      }}>
      {editing ? (
        <div className="nodrag">
          <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
            style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 11, marginBottom: 4, boxSizing: 'border-box', outline: 'none' }} />
          <textarea value={content} onChange={e => setContent(e.target.value)}
            style={{ width: '100%', padding: 3, border: '1px solid var(--accent-edge)', borderRadius: 4, fontSize: 10, minHeight: 48, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button onClick={() => data.onAccept(proposal.id, { title, content })}
              className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>{t('canvas.acceptEdited')}</button>
            <button onClick={() => setEditing(false)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>{t('common.cancel')}</button>
          </div>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 8, padding: '0 5px', background: `${config.color}1A`, color: config.color, borderRadius: 3, fontWeight: 600, flexShrink: 0 }}>{t(config.labelKey)}·{t('canvas.proposalSuffix')}</span>
            <span style={{ fontWeight: 600, color: 'var(--sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proposal.title}</span>
          </div>
          {proposal.content && (
            <p style={{
              margin: '4px 0 0', fontSize: 10, color: 'var(--tri)', lineHeight: 1.5,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden'
            }}>{proposal.content}</p>
          )}
          <div className="nodrag" style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            <button onClick={() => data.onAccept(proposal.id)}
              className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>{t('canvas.accept')}</button>
            <button onClick={() => setEditing(true)}
              className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>{t('canvas.edit')}</button>
            <button onClick={() => data.onReject(proposal.id)}
              className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9, color: '#E05D5D' }}>{t('canvas.reject')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

type AppNode = KnowledgeFlowNode | GhostFlowNode

const nodeTypes = { knowledge: KnowledgeNode, ghost: GhostNode }

/** 无布局数据的条目按类型分列自动排布 */
function autoPosition(typeIndex: number, entryIndex: number): { x: number; y: number } {
  return { x: 24 + typeIndex * 290, y: 56 + entryIndex * 150 }
}

const FlowCanvasInner: React.FC<{ sceneId: string; canvas: ExperienceCard }> = ({ sceneId, canvas }) => {
  const { t } = useTranslation()
  const applyCanvasOp = useSceneStore(s => s.applyCanvasOp)
  const undoCanvas = useSceneStore(s => s.undoCanvas)
  const redoCanvas = useSceneStore(s => s.redoCanvas)
  const canUndo = useSceneStore(s => s.canUndo)
  const canRedo = useSceneStore(s => s.canRedo)
  const highlightedEntries = useSceneStore(s => s.highlightedEntries)
  const proposals = useSceneStore(s => s.proposals)
  const applyProposal = useSceneStore(s => s.applyProposal)
  const rejectProposal = useSceneStore(s => s.rejectProposal)
  const [editingId, setEditingId] = useState<string | null>(null)
  const { screenToFlowPosition, getNode } = useReactFlow()
  // 幽灵积木被拖动后的位置（不入经验卡，仅在采纳时带走）
  const ghostPosRef = useRef<Map<string, CanvasPosition>>(new Map())

  const [nodes, setNodes, onNodesChange] = useNodesState<AppNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const entryTypeById = useMemo(() => {
    const map = new Map<string, KnowledgeType>()
    for (const type of KNOWLEDGE_TYPES) {
      for (const e of canvas[`${type}s` as KnowledgeKey]) map.set(e.id, type)
    }
    return map
  }, [canvas])

  const handleSave = useCallback((id: string, patch: { title: string; content: string; evidenceLevel: KnowledgeEntry['evidenceLevel'] }) => {
    applyCanvasOp(sceneId, { kind: 'update', id, patch })
    setEditingId(null)
  }, [applyCanvasOp, sceneId])

  // 流程步骤变化：steps 为真相，同步回写 content 供导出/agent 继续读
  const handleSaveSteps = useCallback((id: string, steps: FlowStep[]) => {
    applyCanvasOp(sceneId, { kind: 'update', id, patch: { steps, content: stepsToContent(steps) } })
  }, [applyCanvasOp, sceneId])

  const handleDelete = useCallback((id: string) => {
    applyCanvasOp(sceneId, { kind: 'delete', id })
  }, [applyCanvasOp, sceneId])

  const handleAcceptProposal = useCallback((proposalId: string, override?: { title: string; content: string }) => {
    const node = getNode(`ghost-${proposalId}`)
    const position = ghostPosRef.current.get(proposalId) ?? node?.position
    ghostPosRef.current.delete(proposalId)
    applyProposal(proposalId, position, override)
  }, [applyProposal, getNode])

  const handleRejectProposal = useCallback((proposalId: string) => {
    ghostPosRef.current.delete(proposalId)
    rejectProposal(proposalId)
  }, [rejectProposal])

  // 经验卡 + 提议 → React Flow 节点/连线
  useEffect(() => {
    const positions = canvas.layout?.positions ?? {}
    const newNodes: AppNode[] = []
    KNOWLEDGE_TYPES.forEach((type, typeIndex) => {
      canvas[`${type}s` as KnowledgeKey].forEach((entry, entryIndex) => {
        newNodes.push({
          id: entry.id,
          type: 'knowledge',
          position: positions[entry.id] ?? autoPosition(typeIndex, entryIndex),
          deletable: false,
          data: {
            entry,
            ktype: type,
            highlighted: highlightedEntries.includes(entry.id),
            editing: editingId === entry.id,
            onStartEdit: setEditingId,
            onSave: handleSave,
            onSaveSteps: handleSaveSteps,
            onCancelEdit: () => setEditingId(null),
            onDelete: handleDelete
          }
        })
      })
    })

    // 幽灵积木：放在所属类型列的已有条目之后
    const ghostCountByType = new Map<KnowledgeType, number>()
    for (const p of proposals) {
      const type = p.proposal.type
      const typeIndex = KNOWLEDGE_TYPES.indexOf(type)
      const entryCount = canvas[`${type}s` as KnowledgeKey].length
      const ghostIndex = ghostCountByType.get(type) ?? 0
      ghostCountByType.set(type, ghostIndex + 1)
      newNodes.push({
        id: `ghost-${p.proposal.id}`,
        type: 'ghost',
        position: ghostPosRef.current.get(p.proposal.id) ?? autoPosition(typeIndex, entryCount + ghostIndex),
        deletable: false,
        connectable: false,
        data: {
          proposal: p.proposal,
          ktype: type,
          onAccept: handleAcceptProposal,
          onReject: handleRejectProposal
        }
      })
    }
    setNodes(newNodes)

    const layoutEdges = canvas.layout?.edges ?? []
    setEdges(layoutEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      animated: e.kind === 'flow-order',
      label: e.label,
      style: { stroke: e.kind === 'flow-order' ? '#3B82F6' : '#A6ABB5', strokeWidth: 1.5 }
    })))
  }, [canvas, proposals, highlightedEntries, editingId, handleSave, handleSaveSteps, handleDelete, handleAcceptProposal, handleRejectProposal, setNodes, setEdges])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return
    const kind: CanvasEdge['kind'] =
      entryTypeById.get(connection.source) === 'flow' && entryTypeById.get(connection.target) === 'flow'
        ? 'flow-order' : 'link'
    applyCanvasOp(sceneId, { kind: 'connect', edge: { id: generateId(), source: connection.source, target: connection.target, kind } })
  }, [applyCanvasOp, sceneId, entryTypeById])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    for (const e of deleted) applyCanvasOp(sceneId, { kind: 'disconnect', edgeId: e.id })
  }, [applyCanvasOp, sceneId])

  const onNodeDragStop = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.id.startsWith('ghost-')) {
      // 幽灵积木位置不入经验卡，本地记住，采纳时带走
      ghostPosRef.current.set(node.id.slice('ghost-'.length), node.position)
      return
    }
    applyCanvasOp(sceneId, { kind: 'move', id: node.id, position: node.position })
  }, [applyCanvasOp, sceneId])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const type = e.dataTransfer.getData('application/skillbooster-block') as KnowledgeType
    if (!KNOWLEDGE_TYPES.includes(type)) return
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    const now = new Date().toISOString()
    const entry: KnowledgeEntry = {
      id: generateId(), title: t('canvas.newEntry', { type: t(TYPE_CONFIG[type].labelKey) }), content: '', verified: false,
      source: 'user', evidenceLevel: 'exploratory', createdAt: now, updatedAt: now
    }
    applyCanvasOp(sceneId, { kind: 'add', type, entry, position })
    setEditingId(entry.id)
  }, [applyCanvasOp, sceneId, screenToFlowPosition, t])

  const totalEntries = KNOWLEDGE_TYPES.reduce((sum, t) => sum + canvas[`${t}s` as KnowledgeKey].length, 0)
  const filledDots = Math.min(5, Math.ceil(totalEntries / 3))

  return (
    <div style={{ width: '100%', height: '100%' }} onDrop={onDrop} onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgesDelete={onEdgesDelete}
        onNodeDragStop={onNodeDragStop}
        deleteKeyCode={['Backspace', 'Delete']}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={16} size={1} color="#ECECF1" />
        <Controls position="bottom-right" showInteractive={false} />
        <MiniMap position="bottom-left" pannable zoomable style={{ width: 120, height: 80 }}
          nodeColor={(n) => TYPE_CONFIG[(n.data as { ktype?: KnowledgeType })?.ktype as KnowledgeType]?.color ?? '#ddd'} />

        {/* 元件栏：拖部件到画布组装经验 */}
        <Panel position="top-left">
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 8, width: 132, boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sub)', marginBottom: 6, letterSpacing: 0.5 }}>{t('canvas.paletteTitle')}</div>
            {PALETTE_TYPES.map(type => {
              const c = TYPE_CONFIG[type]
              return (
                <div key={type} draggable
                  onDragStart={e => { e.dataTransfer.setData('application/skillbooster-block', type); e.dataTransfer.effectAllowed = 'copy' }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', marginBottom: 4,
                    border: '1px solid var(--line)', borderLeft: `4px solid ${c.color}`, borderRadius: 6,
                    cursor: 'grab', background: '#fff', userSelect: 'none'
                  }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--ink)' }}>{t(c.labelKey)}</div>
                    <div style={{ fontSize: 8, color: 'var(--tri)' }}>{t(c.hintKey)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Panel>

        {/* 顶部：Skill 进度 + undo/redo */}
        <Panel position="top-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: i <= filledDots ? 'var(--accent)' : 'var(--line)' }} />
              ))}
            </div>
            <span style={{ fontSize: 9, color: 'var(--tri)' }}>{t('canvas.blocksCount', { count: totalEntries })}</span>
            <button onClick={() => undoCanvas(sceneId)} disabled={!canUndo} title={t('canvas.undo')}
              style={{ background: 'none', border: 'none', cursor: canUndo ? 'pointer' : 'default', fontSize: 11, color: canUndo ? 'var(--ink)' : 'var(--line)', padding: 0 }}>↩</button>
            <button onClick={() => redoCanvas(sceneId)} disabled={!canRedo} title={t('canvas.redo')}
              style={{ background: 'none', border: 'none', cursor: canRedo ? 'pointer' : 'default', fontSize: 11, color: canRedo ? 'var(--ink)' : 'var(--line)', padding: 0 }}>↪</button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  )
}

const FlowCanvas: React.FC<{ sceneId: string; canvas: ExperienceCard }> = (props) => (
  <ReactFlowProvider>
    <FlowCanvasInner {...props} />
  </ReactFlowProvider>
)

export default FlowCanvas
