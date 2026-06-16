import React, { useState } from 'react'
import { useSceneStore } from '../store/sceneStore'
import type { ProposalCard as ProposalCardType } from '../contracts/ipc-types'

const ProposalCard: React.FC<{ proposalCard: ProposalCardType }> = ({ proposalCard }) => {
  const applyProposal = useSceneStore(s => s.applyProposal)
  const rejectProposal = useSceneStore(s => s.rejectProposal)
  const modifyProposal = useSceneStore(s => s.modifyProposal)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(proposalCard.proposal.content)

  const { proposal, status } = proposalCard
  if (status !== 'pending' && status !== 'modifying') return null

  const typeLabels: Record<string, string> = {
    flow: '流程', rule: '规则', insight: '洞察', concept: '概念', relation: '关系'
  }

  const handleConfirm = () => {
    if (editing && editContent.trim()) {
      modifyProposal(proposalCard.id, editContent.trim())
    }
    applyProposal(proposalCard.id)
  }

  const handleModify = () => {
    if (editing) {
      if (editContent.trim()) {
        modifyProposal(proposalCard.id, editContent.trim())
        applyProposal(proposalCard.id)
      }
    } else {
      setEditing(true)
    }
  }

  return (
    <div style={{
      margin: '8px 0', padding: 10,
      border: '1px solid var(--line)', borderRadius: 8, background: '#fff'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{
          padding: '1px 6px', borderRadius: 4, fontSize: 9,
          background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 600
        }}>
          {typeLabels[proposal.type] || proposal.type}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{proposal.title}</span>
      </div>
      {editing ? (
        <textarea value={editContent} onChange={e => setEditContent(e.target.value)}
          style={{
            width: '100%', padding: 6, border: '1px solid var(--accent-edge)', borderRadius: 6,
            fontSize: 11, minHeight: 48, resize: 'vertical', boxSizing: 'border-box', outline: 'none'
          }} />
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: 'var(--ink)', lineHeight: 1.5 }}>{proposal.content}</p>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={handleConfirm} className="btn-soft" style={{ padding: '4px 12px', fontSize: 10 }}>✓ 采纳</button>
        <button onClick={() => rejectProposal(proposalCard.id)} className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }}>✕ 不对</button>
        <button onClick={handleModify} className="btn-ghost" style={{ padding: '4px 12px', fontSize: 10 }}>✎ 改</button>
      </div>
    </div>
  )
}

export default ProposalCard
