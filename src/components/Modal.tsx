import React, { useEffect } from 'react'
import { Close } from './Icons'

/** 通用模态：固定遮罩 + 居中卡片。Esc 或点遮罩关闭 */
const Modal: React.FC<{
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  width?: number
}> = ({ onClose, title, children, width = 480 }) => {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: 'var(--surface)', borderRadius: 12, width, maxWidth: '100%', maxHeight: '85vh', overflow: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.22)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{title}</div>
          <button onClick={onClose} title="关闭" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tri)', display: 'flex', flexShrink: 0 }}><Close size={16} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  )
}

export default Modal
