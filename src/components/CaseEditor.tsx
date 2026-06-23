import { useState, useEffect, useRef } from 'react'
import type { TestCase, TestCaseInput, Reference } from '../contracts/ipc-types'

interface CaseEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (input: TestCaseInput) => void
  references: Reference[]
  initialCase?: TestCase
}

export function CaseEditor({ isOpen, onClose, onSave, references, initialCase }: CaseEditorProps) {
  const [instruction, setInstruction] = useState(initialCase?.instruction ?? '')
  const [expectedAnswer, setExpectedAnswer] = useState(initialCase?.expectedAnswer ?? '')
  const [sourceRefIds, setSourceRefIds] = useState<string[]>(initialCase?.sourceReferenceIds ?? [])
  const [difficulty, setDifficulty] = useState<TestCaseInput['difficulty']>(initialCase?.difficulty)
  const [confidence, setConfidence] = useState<TestCaseInput['confidence']>(initialCase?.confidence)
  const [tags, setTags] = useState(initialCase?.tags ?? '')
  const [notes, setNotes] = useState(initialCase?.notes ?? '')
  const instructionRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      instructionRef.current?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setInstruction(initialCase?.instruction ?? '')
    setExpectedAnswer(initialCase?.expectedAnswer ?? '')
    setSourceRefIds(initialCase?.sourceReferenceIds ?? [])
    setDifficulty(initialCase?.difficulty)
    setConfidence(initialCase?.confidence)
    setTags(initialCase?.tags ?? '')
    setNotes(initialCase?.notes ?? '')
  }, [isOpen, initialCase])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!instruction.trim()) return
    onSave({
      instruction: instruction.trim(),
      expectedAnswer: expectedAnswer.trim() || undefined,
      sourceReferenceIds: sourceRefIds.length > 0 ? sourceRefIds : undefined,
      difficulty,
      confidence,
      tags: tags.trim() || undefined,
      notes: notes.trim() || undefined
    })
    onClose()
  }

  const inputClass = 'w-full rounded-block border border-line bg-surface p-2 text-[11px] text-ink focus:border-accent focus:outline-none'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-editor-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-card border border-line bg-surface p-5 shadow-[0_16px_48px_rgba(0,0,0,0.22)]"
        style={{ maxHeight: '85vh', overflow: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="case-editor-title" className="mb-4 text-[13px] font-bold text-ink">
          {initialCase ? '编辑案例' : '新增案例'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-[10px] font-semibold text-sub">
            <span className="mb-1 block">案例描述 / 测试指令</span>
            <textarea
              ref={instructionRef}
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              className={inputClass}
              rows={3}
              required
            />
          </label>
          <label className="block text-[10px] font-semibold text-sub">
            <span className="mb-1 block">期望结论</span>
            <textarea
              value={expectedAnswer}
              onChange={e => setExpectedAnswer(e.target.value)}
              className={inputClass}
              rows={3}
              placeholder="专家对此案例的标准结论（用于计算命中率）"
            />
          </label>
          <label className="block text-[10px] font-semibold text-sub">
            <span className="mb-1 block">来源文档</span>
            <select
              multiple
              value={sourceRefIds}
              onChange={e => setSourceRefIds(Array.from(e.target.selectedOptions, o => o.value))}
              className={inputClass}
              size={Math.min(4, Math.max(2, references.length))}
            >
              {references.map(ref => (
                <option key={ref.id} value={ref.id}>{ref.filename}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-[10px] font-semibold text-sub">
              <span className="mb-1 block">难度</span>
              <select
                value={difficulty ?? ''}
                onChange={e => setDifficulty((e.target.value || undefined) as TestCaseInput['difficulty'])}
                className={inputClass}
              >
                <option value="">未设置</option>
                <option value="easy">简单</option>
                <option value="medium">中等</option>
                <option value="hard">困难</option>
              </select>
            </label>
            <label className="block text-[10px] font-semibold text-sub">
              <span className="mb-1 block">置信度</span>
              <select
                value={confidence ?? ''}
                onChange={e => setConfidence((e.target.value || undefined) as TestCaseInput['confidence'])}
                className={inputClass}
              >
                <option value="">未设置</option>
                <option value="high">高</option>
                <option value="medium">中</option>
                <option value="low">低</option>
              </select>
            </label>
          </div>
          <label className="block text-[10px] font-semibold text-sub">
            <span className="mb-1 block">标签</span>
            <input
              value={tags}
              onChange={e => setTags(e.target.value)}
              className={inputClass}
              placeholder="用逗号分隔"
            />
          </label>
          <label className="block text-[10px] font-semibold text-sub">
            <span className="mb-1 block">备注</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={inputClass}
              rows={2}
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-[10px]">
              取消
            </button>
            <button type="submit" className="btn-primary px-4 py-2 text-[10px]">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
