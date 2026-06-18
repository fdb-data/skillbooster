import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { isDefaultProjectName } from '../i18n'
import Markdown from '../components/Markdown'
import PageNav from '../components/PageNav'
import { ArrowLeft, Edit as EditIcon, ArrowRight, Paperclip, Send } from '../components/Icons'

interface GuideMessage {
  role: 'user' | 'assistant'
  content: string
  options?: string[]
  optionsMultiSelect?: boolean
  allowFreeText?: boolean
  sceneDraft?: { name: string; protagonist: string; trigger: string; includes: string[]; excludes: string[] }
  projectName?: string
  done?: boolean
}

interface SceneDraft {
  name: string
  protagonist: string
  trigger: string
  includes: string[]
  excludes: string[]
}

const emptyDraft: SceneDraft = { name: '', protagonist: '', trigger: '', includes: [], excludes: [] }

const Guide: React.FC = () => {
  const { t } = useTranslation()
  const friendlyError = (message: string): string => {
    if (/429|TooManyRequests|rate limit/i.test(message)) {
      return t('guide.errorRateLimit')
    }
    return t('guide.errorGeneric', { message })
  }
  const currentScene = useSceneStore(s => s.currentScene)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const updateScene = useSceneStore(s => s.updateScene)
  const isLoading = useSceneStore(s => s.isLoading)
  const guideInput = useSceneStore(s => s.guideInput)
  const streamingText = useSceneStore(s => s.streamingText)
  const agentStatus = useSceneStore(s => s.agentStatus)
  const liveSceneDraft = useSceneStore(s => s.liveSceneDraft)

  const [messages, setMessages] = useState<GuideMessage[]>([])
  const [input, setInput] = useState('')
  const [projectName, setProjectName] = useState(t('home.defaultProjectName'))
  const [sceneDraft, setSceneDraft] = useState<SceneDraft>(emptyDraft)
  const [guideDone, setGuideDone] = useState(false)
  const [, setStep] = useState(0)
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [customInputOpen, setCustomInputOpen] = useState(false)
  const [customText, setCustomText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamingText])

  // 引导 agent 调 update_scene 工具时实时同步属性面板
  useEffect(() => {
    if (!liveSceneDraft) return
    setSceneDraft({
      name: liveSceneDraft.name,
      protagonist: liveSceneDraft.protagonist,
      trigger: liveSceneDraft.trigger,
      includes: liveSceneDraft.includes,
      excludes: liveSceneDraft.excludes
    })
    if (liveSceneDraft.projectName) setProjectName(liveSceneDraft.projectName)
  }, [liveSceneDraft])

  // 进入/切换场景时恢复已持久化的引导对话；无历史且带 guideInput 才自动发起首轮
  useEffect(() => {
    if (!currentScene) return
    const sceneId = currentScene.id
    initializedRef.current = false
    setMessages([])
    setGuideDone(false)
    setStep(0)
    let cancelled = false
    window.api.guide.getMessages(sceneId).then(res => {
      if (cancelled || initializedRef.current) return
      initializedRef.current = true
      const restored = res.success && res.data ? res.data : []
      if (restored.length > 0) {
        setMessages(restored.map(m => ({
          role: m.role,
          content: m.content,
          options: m.options,
          optionsMultiSelect: m.optionsMultiSelect,
          allowFreeText: m.allowFreeText,
          done: m.done
        })))
        const last = restored[restored.length - 1]
        if (last.role === 'assistant' && last.done) setGuideDone(true)
        setStep(restored.filter(m => m.role === 'assistant').length)
      } else if (guideInput) {
        handleSend(guideInput)
      }
    }).catch(() => {
      if (!cancelled && !initializedRef.current && guideInput) {
        initializedRef.current = true
        handleSend(guideInput)
      }
    })
    return () => { cancelled = true }
    // 仅在场景切换时初始化对话；handleSend/guideInput 故意不入依赖避免重复触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScene?.id])

  // 恢复已保存的场景草稿（从萃取工作台返回场景定义页时不丢内容）
  useEffect(() => {
    if (!currentScene) return
    window.api.guide.getDraft(currentScene.id).then(res => {
      if (!res.success || !res.data) return
      const d = res.data
      if (d.name || d.protagonist || d.trigger || d.includes.length > 0 || d.excludes.length > 0) {
        setSceneDraft({ name: d.name, protagonist: d.protagonist, trigger: d.trigger, includes: d.includes, excludes: d.excludes })
      }
      // 场景已正式命名的以场景名为准，否则用草稿里的项目名猜测
      if (currentScene.name && !isDefaultProjectName(currentScene.name)) {
        setProjectName(currentScene.name)
      } else if (d.projectName) {
        setProjectName(d.projectName)
      }
    }).catch(() => { /* 草稿恢复失败不阻塞页面 */ })
    // 仅在场景切换时恢复草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentScene?.id])

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading || !currentScene || sending) return
    setSending(true)
    setSelectedOptions([])
    setCustomInputOpen(false)
    setCustomText('')
    const userMsg: GuideMessage = { role: 'user', content: text.trim() }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const result = await window.api.guide.runTurn(currentScene.id, text.trim())
      if (result.success && result.data) {
        const d = result.data
        const aiMsg: GuideMessage = {
          role: 'assistant',
          content: d.reply,
          options: d.options,
          optionsMultiSelect: d.optionsMultiSelect,
          allowFreeText: d.allowFreeText,
          sceneDraft: d.sceneDraft || undefined,
          projectName: d.projectName,
          done: d.done
        }
        setMessages(prev => [...prev, aiMsg])
        if (d.projectName) setProjectName(d.projectName)
        if (d.sceneDraft) setSceneDraft(d.sceneDraft)
        if (d.done) setGuideDone(true)
        setStep(prev => prev + 1)
      } else {
        const errMsg = (result as { error?: { message?: string } }).error?.message || t('guide.requestFailed')
        setMessages(prev => [...prev, { role: 'assistant', content: friendlyError(errMsg) }])
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: friendlyError((err as Error).message) }])
    } finally {
      setSending(false)
    }
  }

  const handleOptionClick = (option: string) => {
    handleSend(option)
  }

  const toggleOption = (option: string) => {
    setSelectedOptions(prev => prev.includes(option) ? prev.filter(o => o !== option) : [...prev, option])
  }

  const confirmMultiSelect = () => {
    const parts = [...selectedOptions]
    if (customText.trim()) parts.push(customText.trim())
    if (parts.length === 0) return
    handleSend(parts.join('、'))
  }

  const submitCustom = (multiSelect: boolean) => {
    if (multiSelect) {
      confirmMultiSelect()
    } else {
      if (!customText.trim()) return
      handleSend(customText.trim())
    }
  }

  const handleStartExtraction = async () => {
    if (!currentScene) return
    if (projectName !== currentScene.name) {
      await updateScene(currentScene.id, { name: projectName })
    }
    setCurrentPage('workbench')
  }

  const handleFileAttach = async () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = true
    el.accept = '.txt,.md,.pdf,.docx'
    el.onchange = async () => {
      if (el.files && currentScene) {
        for (const file of Array.from(el.files)) {
          const path = (file as File & { path?: string }).path
          if (path) {
            await window.api.references.add(currentScene.id, path)
            setAttachedFiles(prev => [...prev, file.name])
          }
        }
      }
    }
    el.click()
  }

  const startEdit = (field: string, value: string) => {
    setEditingField(field)
    setEditValue(value)
  }

  const saveEdit = async (field: string): Promise<void> => {
    // 项目名独立于场景草稿：写回 projectName 并同步场景名
    if (field === 'projectName') {
      const name = editValue.trim()
      setEditingField(null)
      if (name && name !== projectName) {
        setProjectName(name)
        if (currentScene) await updateScene(currentScene.id, { name })
      }
      return
    }
    const updated = { ...sceneDraft }
    if (field === 'name') updated.name = editValue
    else if (field === 'protagonist') updated.protagonist = editValue
    else if (field === 'trigger') updated.trigger = editValue
    else if (field === 'includes') updated.includes = editValue.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    else if (field === 'excludes') updated.excludes = editValue.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    setSceneDraft(updated)
    setEditingField(null)
  }

  const canEnterWorkbench = sceneDraft.name.trim() !== '' && sceneDraft.protagonist.trim() !== '' && sceneDraft.trigger.trim() !== ''

  const draftFields: { key: keyof SceneDraft; label: string; type: 'text' | 'list' }[] = [
    { key: 'name', label: t('guide.fieldName'), type: 'text' },
    { key: 'protagonist', label: t('guide.fieldProtagonist'), type: 'text' },
    { key: 'trigger', label: t('guide.fieldTrigger'), type: 'text' },
    { key: 'includes', label: t('guide.fieldIncludes'), type: 'list' },
    { key: 'excludes', label: t('guide.fieldExcludes'), type: 'list' },
  ]

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="grid h-14 shrink-0 grid-cols-3 items-center border-b border-line bg-white px-4">
        <div className="flex items-center gap-2 justify-self-start">
          <button onClick={() => setCurrentPage('home')} className="flex cursor-pointer items-center text-ink hover:text-accent"><ArrowLeft size={16} /></button>
          {editingField === 'projectName' ? (
            <div className="flex items-center gap-1">
              <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveEdit('projectName'); else if (e.key === 'Escape') setEditingField(null) }}
                className="rounded-md border border-line px-2 py-0.5 text-[13px] font-bold text-ink outline-none focus:border-accent" />
              <button onClick={() => saveEdit('projectName')} className="btn-soft px-2 py-0.5 text-[9px]">✓</button>
              <button onClick={() => setEditingField(null)} className="btn-ghost px-2 py-0.5 text-[9px]">✕</button>
            </div>
          ) : (
            <>
              <span className="text-[13px] font-bold text-ink">{projectName}</span>
              <button onClick={() => startEdit('projectName', projectName)} className="flex cursor-pointer items-center text-tri hover:text-accent"><EditIcon size={13} /></button>
            </>
          )}
        </div>
        <div className="justify-self-center">
          <PageNav current="guide" />
        </div>
        <div />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：对话区 */}
        <div className="flex flex-1 flex-col border-r border-line">
          <div className="flex flex-1 flex-col items-center overflow-auto py-6">
            <div className="flex w-full max-w-[460px] flex-col gap-3 px-4">
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'assistant' ? (
                    <div className="rounded-card bg-ai-bubble px-4 py-3">
                      <Markdown text={msg.content} />
                      {msg.options && msg.options.length > 0 && !msg.done && (
                        <>
                          <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {msg.options.map((opt, j) => {
                              const isLast = i === messages.length - 1
                              if (msg.optionsMultiSelect && isLast) {
                                const selected = selectedOptions.includes(opt)
                                return (
                                  <button key={j} onClick={() => toggleOption(opt)} className="chip-option"
                                    style={selected ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                                    {selected ? '✓ ' : ''}{opt}
                                  </button>
                                )
                              }
                              return <button key={j} onClick={() => handleOptionClick(opt)} className="chip-option">{opt}</button>
                            })}
                            {msg.allowFreeText && i === messages.length - 1 && (
                              <button onClick={() => setCustomInputOpen(v => !v)} className="chip-option"
                                style={customInputOpen ? { background: 'var(--accent-soft)', borderColor: 'var(--accent)', color: 'var(--accent)' } : undefined}>
                                {t('guide.otherOption')}
                              </button>
                            )}
                            {msg.optionsMultiSelect && i === messages.length - 1 && (
                              <>
                                <span className="text-[9px] text-tri">{t('guide.multiSelectHint')}</span>
                                {(selectedOptions.length > 0 || customText.trim() !== '') && (
                                  <button onClick={confirmMultiSelect} className="btn-primary px-3 py-1 text-[10px]">
                                    {t('guide.confirmCount', { count: selectedOptions.length + (customText.trim() ? 1 : 0) })}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {customInputOpen && i === messages.length - 1 && (
                            <div className="mt-2 flex gap-1.5">
                              <input autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') submitCustom(!!msg.optionsMultiSelect) }}
                                placeholder={t('guide.customPlaceholder')}
                                className="input-pill flex-1 text-[10px]" />
                              <button onClick={() => submitCustom(!!msg.optionsMultiSelect)}
                                disabled={!customText.trim() && selectedOptions.length === 0}
                                className="btn-primary px-3 py-1 text-[10px]">
                                {msg.optionsMultiSelect ? t('common.confirm') : t('common.send')}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-card bg-user-bubble px-4 py-2.5">
                        <p className="text-[11px] leading-normal text-ink">{msg.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="rounded-card bg-ai-bubble px-4 py-3">
                  {streamingText && (
                    <Markdown text={streamingText} style={{ marginBottom: 8 }} />
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex gap-[3px]">
                      <span className="thinking-dot h-[5px] w-[5px] rounded-full bg-tri" style={{ animation: 'pulse 1.2s ease-in-out infinite' }} />
                      <span className="thinking-dot h-[5px] w-[5px] rounded-full bg-tri" style={{ animation: 'pulse 1.2s ease-in-out 0.2s infinite' }} />
                      <span className="thinking-dot h-[5px] w-[5px] rounded-full bg-tri" style={{ animation: 'pulse 1.2s ease-in-out 0.4s infinite' }} />
                    </div>
                    <span className="text-[10px] text-tri">{agentStatus || t('guide.thinking')}</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div className="flex shrink-0 justify-center py-3">
            <div className="flex w-full max-w-[460px] items-center gap-2 px-4">
              <button onClick={handleFileAttach} className="flex cursor-pointer items-center text-tri hover:text-accent"><Paperclip size={15} /></button>
              {attachedFiles.length > 0 && <span className="text-[8px] text-tri">{t('guide.filesCount', { count: attachedFiles.length })}</span>}
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(input) }}
                placeholder={t('guide.inputPlaceholder')}
                className="input-pill flex-1 text-[11px]"
                disabled={isLoading || guideDone} />
              <button onClick={() => handleSend(input)} disabled={isLoading || guideDone || !input.trim()}
                className="btn-primary flex items-center px-3.5 py-2 text-sm"><Send size={14} /></button>
            </div>
          </div>
        </div>

        {/* 右侧：场景属性面板 */}
        <div className="flex w-[300px] shrink-0 flex-col bg-canvas">
          <div className="border-b border-line px-5 py-4">
            <span className="text-xs font-bold text-ink">{t('guide.sceneProps')}</span>
            <span className="ml-2 text-[9px] text-tri">{t('guide.realtimeExtract')}</span>
          </div>

          <div className="flex-1 overflow-auto px-5 py-3">
            {draftFields.map(({ key, label, type }) => (
              <div key={key} className="mb-3.5">
                <div className="mb-1 text-[9px] font-semibold uppercase tracking-[0.5px] text-tri">{label}</div>
                {editingField === key ? (
                  <div className="flex gap-1">
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                      className="input-pill flex-1 px-2 py-1 text-[10px]"
                      placeholder={type === 'list' ? t('guide.listEditHint') : undefined}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(key); else if (e.key === 'Escape') setEditingField(null) }} />
                    <button onClick={() => saveEdit(key)} className="btn-soft px-2 py-0.5 text-[9px]">✓</button>
                    <button onClick={() => setEditingField(null)} className="btn-ghost px-2 py-0.5 text-[9px]">✕</button>
                  </div>
                ) : (
                  <div
                    onClick={() => startEdit(key, type === 'list' ? (sceneDraft[key] as string[]).join(', ') : (sceneDraft[key] as string))}
                    className={`min-h-[28px] cursor-pointer rounded-md border border-line bg-white px-2.5 py-1.5 text-[11px] transition-colors hover:border-accent-edge ${(type === 'list' ? (sceneDraft[key] as string[]).length > 0 : !!sceneDraft[key]) ? 'text-ink' : 'text-tri'}`}
                  >
                    {type === 'list'
                      ? ((sceneDraft[key] as string[]).length > 0 ? (sceneDraft[key] as string[]).join(' · ') : t('guide.clickToFill'))
                      : (sceneDraft[key] || t('guide.clickToFill'))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-line px-5 py-3">
            <button
              onClick={handleStartExtraction}
              disabled={!canEnterWorkbench}
              className="btn-primary flex w-full items-center justify-center gap-1.5 py-2.5 text-xs"
            >
              {t('guide.enterWorkbench')} <ArrowRight size={14} />
            </button>
            {!canEnterWorkbench && (
              <p className="mt-1.5 text-center text-[9px] text-tri">
                {t('guide.enterWorkbenchHint')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Guide
