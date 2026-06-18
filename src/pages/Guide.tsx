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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56, borderBottom: '1px solid var(--line)', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCurrentPage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--ink)' }}><ArrowLeft size={16} /></button>
          {editingField === 'projectName' ? (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Enter') saveEdit('projectName'); else if (e.key === 'Escape') setEditingField(null) }}
                style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 8px', outline: 'none' }} />
              <button onClick={() => saveEdit('projectName')} className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>✓</button>
              <button onClick={() => setEditingField(null)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>✕</button>
            </div>
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{projectName}</span>
              <button onClick={() => startEdit('projectName', projectName)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><EditIcon size={13} /></button>
            </>
          )}
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <PageNav current="guide" />
        </div>
        <div />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        {/* 左侧：对话区 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map((msg, i) => (
                <div key={i}>
                  {msg.role === 'assistant' ? (
                    <div style={{ background: 'var(--ai-bubble)', borderRadius: 10, padding: '12px 16px' }}>
                      <Markdown text={msg.content} />
                      {msg.options && msg.options.length > 0 && !msg.done && (
                        <>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10, alignItems: 'center' }}>
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
                                <span style={{ fontSize: 9, color: 'var(--tri)' }}>{t('guide.multiSelectHint')}</span>
                                {(selectedOptions.length > 0 || customText.trim() !== '') && (
                                  <button onClick={confirmMultiSelect} className="btn-primary" style={{ padding: '4px 12px', fontSize: 10 }}>
                                    {t('guide.confirmCount', { count: selectedOptions.length + (customText.trim() ? 1 : 0) })}
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                          {customInputOpen && i === messages.length - 1 && (
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <input autoFocus value={customText} onChange={e => setCustomText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') submitCustom(!!msg.optionsMultiSelect) }}
                                placeholder={t('guide.customPlaceholder')}
                                className="input-pill" style={{ flex: 1, fontSize: 10 }} />
                              <button onClick={() => submitCustom(!!msg.optionsMultiSelect)}
                                disabled={!customText.trim() && selectedOptions.length === 0}
                                className="btn-primary" style={{ padding: '4px 12px', fontSize: 10 }}>
                                {msg.optionsMultiSelect ? t('common.confirm') : t('common.send')}
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <div style={{ background: 'var(--user-bubble)', borderRadius: 10, padding: '10px 16px', maxWidth: '80%' }}>
                        <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.5 }}>{msg.content}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div style={{ background: 'var(--ai-bubble)', borderRadius: 10, padding: '12px 16px' }}>
                  {streamingText && (
                    <Markdown text={streamingText} style={{ marginBottom: 8 }} />
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 3 }}>
                      <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out infinite' }} />
                      <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out 0.2s infinite' }} />
                      <span className="thinking-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--tri)', animation: 'pulse 1.2s ease-in-out 0.4s infinite' }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--tri)' }}>{agentStatus || t('guide.thinking')}</span>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </div>

          <div style={{ padding: '12px 0', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <div style={{ width: 440, display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={handleFileAttach} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><Paperclip size={15} /></button>
              {attachedFiles.length > 0 && <span style={{ fontSize: 8, color: 'var(--tri)' }}>{t('guide.filesCount', { count: attachedFiles.length })}</span>}
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSend(input) }}
                placeholder={t('guide.inputPlaceholder')}
                className="input-pill"
                disabled={isLoading || guideDone}
                style={{ flex: 1, fontSize: 11 }} />
              <button onClick={() => handleSend(input)} disabled={isLoading || guideDone || !input.trim()}
                className="btn-primary" style={{ padding: '8px 14px', fontSize: 14, display: 'flex', alignItems: 'center' }}><Send size={14} /></button>
            </div>
          </div>
        </div>

        {/* 右侧：场景属性面板 */}
        <div style={{ width: 300, display: 'flex', flexDirection: 'column', background: 'var(--canvas)' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{t('guide.sceneProps')}</span>
            <span style={{ fontSize: 9, color: 'var(--tri)', marginLeft: 8 }}>{t('guide.realtimeExtract')}</span>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
            {draftFields.map(({ key, label, type }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 9, color: 'var(--tri)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                {editingField === key ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                      className="input-pill" style={{ flex: 1, fontSize: 10, padding: '4px 8px' }}
                      placeholder={type === 'list' ? t('guide.listEditHint') : undefined}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(key); else if (e.key === 'Escape') setEditingField(null) }} />
                    <button onClick={() => saveEdit(key)} className="btn-soft" style={{ padding: '2px 8px', fontSize: 9 }}>✓</button>
                    <button onClick={() => setEditingField(null)} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>✕</button>
                  </div>
                ) : (
                  <div
                    onClick={() => startEdit(key, type === 'list' ? (sceneDraft[key] as string[]).join(', ') : (sceneDraft[key] as string))}
                    style={{
                      fontSize: 11, color: (type === 'list' ? (sceneDraft[key] as string[]).length > 0 : !!sceneDraft[key]) ? 'var(--ink)' : 'var(--tri)',
                      background: '#fff', border: '1px solid var(--line)', borderRadius: 6,
                      padding: '6px 10px', cursor: 'pointer', minHeight: 28,
                      transition: 'border-color 0.15s'
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'var(--accent-edge)' }}
                    onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'var(--line)' }}
                  >
                    {type === 'list'
                      ? ((sceneDraft[key] as string[]).length > 0 ? (sceneDraft[key] as string[]).join(' · ') : t('guide.clickToFill'))
                      : (sceneDraft[key] || t('guide.clickToFill'))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--line)' }}>
            <button
              onClick={handleStartExtraction}
              disabled={!canEnterWorkbench}
              className="btn-primary"
              style={{
                width: '100%', padding: '10px 0', fontSize: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
              }}
            >
              {t('guide.enterWorkbench')} <ArrowRight size={14} />
            </button>
            {!canEnterWorkbench && (
              <p style={{ fontSize: 9, color: 'var(--tri)', textAlign: 'center', marginTop: 6 }}>
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
