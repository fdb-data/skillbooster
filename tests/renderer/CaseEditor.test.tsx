import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CaseEditor } from '../../src/components/CaseEditor'

describe('CaseEditor', () => {
  it('calls onSave with input when submitted', () => {
    const onSave = vi.fn()
    render(
      <CaseEditor
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        references={[]}
      />
    )
    fireEvent.change(screen.getByLabelText(/案例描述/i), { target: { value: '测试案例' } })
    fireEvent.change(screen.getByLabelText(/期望结论/i), { target: { value: '通过' } })
    fireEvent.click(screen.getByText(/保存/i))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      instruction: '测试案例',
      expectedAnswer: '通过'
    }))
  })

  it('renders reference options', () => {
    render(
      <CaseEditor
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        references={[{ id: 'r1', filename: 'doc.pdf', storedPath: '', extractedText: '', includeInPackage: true }]}
      />
    )
    expect(screen.getByText('doc.pdf')).toBeInTheDocument()
  })

  it('prefills form when editing existing case', () => {
    render(
      <CaseEditor
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        references={[]}
        initialCase={{
          id: 'c1',
          sceneId: 's1',
          instruction: '编辑案例',
          expectedAnswer: '通过',
          sourceReferenceIds: [],
          difficulty: 'easy',
          confidence: 'high',
          tags: '标签',
          notes: '备注',
          sortOrder: 0,
          createdAt: new Date().toISOString()
        }}
      />
    )
    expect(screen.getByDisplayValue('编辑案例')).toBeInTheDocument()
    expect(screen.getByDisplayValue('通过')).toBeInTheDocument()
  })

  it('calls onClose when cancel clicked', () => {
    const onClose = vi.fn()
    render(
      <CaseEditor isOpen={true} onClose={onClose} onSave={() => {}} references={[]} />
    )
    fireEvent.click(screen.getByText(/取消/i))
    expect(onClose).toHaveBeenCalled()
  })

  it('does not call onSave when instruction is empty', () => {
    const onSave = vi.fn()
    render(
      <CaseEditor isOpen={true} onClose={() => {}} onSave={onSave} references={[]} />
    )
    fireEvent.click(screen.getByText(/保存/i))
    expect(onSave).not.toHaveBeenCalled()
  })

  it('carries sourceReferenceIds in submitted input', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <CaseEditor
        isOpen={true}
        onClose={() => {}}
        onSave={onSave}
        references={[{ id: 'r1', filename: 'doc.pdf', storedPath: '', extractedText: '', includeInPackage: true }]}
      />
    )
    fireEvent.change(screen.getByLabelText(/案例描述/i), { target: { value: '测试' } })
    await user.selectOptions(screen.getByLabelText(/来源文档/i), ['r1'])
    fireEvent.click(screen.getByText(/保存/i))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      instruction: '测试',
      sourceReferenceIds: ['r1']
    }))
  })
})
