import React, { useEffect } from 'react'
import { Close } from './Icons'

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
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35 p-6">
      <div onClick={e => e.stopPropagation()}
        className="flex max-h-[85vh] w-full flex-col overflow-auto rounded-xl bg-surface shadow-lg"
        style={{ maxWidth: width }}>
        {title && (
          <div className="sticky top-0 z-1 flex shrink-0 items-center justify-between border-b border-line bg-surface px-[18px] py-3.5">
            <div className="flex min-w-0 items-center gap-2">{title}</div>
            <button onClick={onClose} className="flex shrink-0 cursor-pointer text-tri hover:text-ink"><Close size={16} /></button>
          </div>
        )}
        <div className="p-[18px]">{children}</div>
      </div>
    </div>
  )
}

export default Modal
