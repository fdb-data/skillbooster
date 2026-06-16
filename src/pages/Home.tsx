import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { Scene } from '../contracts/ipc-types'
import { MindLogo, Settings as SettingsIcon, Paperclip, Close, ArrowRight } from '../components/Icons'

const statusColors: Record<string, string> = {
  active: '#A6ABB5',
  validating: '#E0A93B',
  completed: '#2E9E6B'
}

const Home: React.FC = () => {
  const { t } = useTranslation()
  const scenes = useSceneStore(s => s.scenes)
  const createScene = useSceneStore(s => s.createScene)
  const importSkill = useSceneStore(s => s.importSkill)
  const draftFromDocs = useSceneStore(s => s.draftFromDocs)
  const selectScene = useSceneStore(s => s.selectScene)
  const deleteScene = useSceneStore(s => s.deleteScene)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const [input, setInput] = useState('')
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; path: string }[]>([])
  const [pendingImport, setPendingImport] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [scriptHint, setScriptHint] = useState<{ message: string; sceneId: string } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  const handleStart = async () => {
    if (!input.trim() && attachedFiles.length === 0) return
    const scene = await createScene(t('home.defaultProjectName'))
    if (scene) {
      await selectScene(scene.id)
      // 附件落库为参考文档：引导/萃取智能体读取，进工作台后仍在参考文档面板
      for (const f of attachedFiles) {
        await useSceneStore.getState().addReference(scene.id, f.path)
      }
      useSceneStore.getState().setGuideInput(input.trim() || t('home.guideInputFallback'))
      setCurrentPage('guide')
    }
  }

  const pickImport = async (mode: 'file' | 'folder') => {
    const res = await window.api.skill.pickImportPath(mode)
    if (res.success && res.data?.path) setPendingImport(res.data.path)
  }

  const handleImportDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const f = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
    if (f?.path) setPendingImport(f.path)
  }

  // 落工作台 + 自动触发「从文档起草」把正文结构化进画布（原样复用）
  const enterWorkbench = (sceneId: string) => {
    setCurrentPage('workbench')
    void draftFromDocs(sceneId)
  }

  const confirmImport = async () => {
    const src = pendingImport
    if (!src) return
    setPendingImport(null)
    setImporting(true)
    setScriptHint(null)
    try {
      const scene = await importSkill(src)
      if (!scene) return
      if (scene.scripts.length > 0) {
        // 含脚本：先给轻提示，用户确认后再进工作台
        setScriptHint({ message: t('home.importScriptHint', { count: scene.scripts.length }), sceneId: scene.id })
      } else {
        enterWorkbench(scene.id)
      }
    } finally {
      setImporting(false)
    }
  }

  const handleCardClick = async (id: string) => {
    await selectScene(id)
    const scene = useSceneStore.getState().currentScene
    if (!scene) return
    const hasContent = scene.canvas.flows.length + scene.canvas.rules.length + scene.canvas.insights.length + scene.canvas.concepts.length + scene.canvas.relations.length > 0
    if (hasContent) {
      setCurrentPage('workbench')
    } else {
      setCurrentPage('guide')
    }
  }

  const collectFiles = (files: File[]) => {
    const items = files
      .map(f => ({ name: f.name, path: (f as File & { path?: string }).path || '' }))
      .filter(f => f.path)
    if (items.length > 0) {
      setAttachedFiles(prev => [...prev, ...items.filter(i => !prev.some(p => p.path === i.path))])
    }
  }

  const handleFileAttach = () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = true
    el.accept = '.txt,.md,.pdf,.docx'
    el.onchange = () => {
      if (el.files) collectFiles(Array.from(el.files))
    }
    el.click()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ['.txt', '.md', '.pdf', '.docx'].some(ext => f.name.endsWith(ext))
    )
    collectFiles(files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const evidenceBar = (scene: Scene) => {
    const counts = {
      institutional: scene.canvas.flows.filter(e => e.evidenceLevel === 'institutional').length,
      validated: scene.canvas.rules.filter(e => e.evidenceLevel === 'validated').length,
      sample: scene.canvas.insights.filter(e => e.evidenceLevel === 'sample').length,
      exploratory: scene.canvas.concepts.filter(e => e.evidenceLevel === 'exploratory').length
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1
    return (
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', gap: 1 }}>
        {counts.institutional > 0 && <div style={{ flex: counts.institutional / total, background: '#2E9E6B' }} />}
        {counts.validated > 0 && <div style={{ flex: counts.validated / total, background: '#3B82F6' }} />}
        {counts.sample > 0 && <div style={{ flex: counts.sample / total, background: '#E0A93B' }} />}
        {counts.exploratory > 0 && <div style={{ flex: counts.exploratory / total, background: '#E05D5D' }} />}
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflow: 'auto', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', height: 56, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MindLogo size={18} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{t('home.brand')}</span>
        </div>
        <button onClick={() => setCurrentPage('settings')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--tri)', fontSize: 11 }}>
          <SettingsIcon size={14} /> {t('home.settings')}
        </button>
      </div>

      <div style={{ textAlign: 'center', paddingTop: 48, paddingBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{t('home.heroTitle')}</h1>
        <p style={{ fontSize: 12, color: 'var(--sub)' }}>{t('home.heroSubtitle')}</p>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <div onDrop={handleDrop} onDragOver={handleDragOver}
          style={{ border: '1.5px solid var(--accent-edge)', borderRadius: 14, padding: '16px 20px', minHeight: 104, background: '#fff' }}>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleStart() }}
            placeholder={t('home.inputPlaceholder')}
            style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 13, color: 'var(--ink)', minHeight: 48, fontFamily: 'inherit', background: 'transparent' }} />
          {attachedFiles.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {attachedFiles.map(f => (
                <div key={f.path} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 999, fontSize: 10, color: 'var(--ink)', maxWidth: 220 }}>
                  <Paperclip size={11} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter(p => p.path !== f.path))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)', padding: 0 }}><Close size={11} /></button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={handleFileAttach} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><Paperclip size={15} /></button>
              <span style={{ fontSize: 9, color: 'var(--tri)' }}>{t('home.dropHint')}</span>
            </div>
            <button onClick={handleStart} disabled={!input.trim() && attachedFiles.length === 0}
              className="btn-primary" style={{ padding: '8px 20px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>{t('home.startProject')} <ArrowRight size={12} /></button>
          </div>
        </div>
      </div>

      <p style={{ textAlign: 'center', marginTop: 12, fontSize: 10, color: 'var(--accent)', cursor: 'pointer' }}>{t('home.draftFromDocsHint')}</p>

      <div style={{ maxWidth: 600, margin: '20px auto 0' }}>
        <div onDrop={handleImportDrop} onDragOver={handleDragOver}
          style={{ border: '1px dashed var(--line)', borderRadius: 14, padding: '14px 20px', background: 'var(--canvas)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{t('home.importSkill')}</div>
              <div style={{ fontSize: 10, color: 'var(--sub)' }}>{t('home.importSectionHint')}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => pickImport('file')} disabled={importing} className="btn-primary" style={{ padding: '6px 12px', fontSize: 10, whiteSpace: 'nowrap' }}>{t('home.importPickFile')}</button>
              <button onClick={() => pickImport('folder')} disabled={importing} className="btn-ghost" style={{ padding: '6px 12px', fontSize: 10, whiteSpace: 'nowrap' }}>{t('home.importPickFolder')}</button>
            </div>
          </div>
          <div style={{ fontSize: 9, color: 'var(--tri)', marginTop: 8 }}>{importing ? t('home.importing') : t('home.importDropHint')}</div>
        </div>
      </div>

      {pendingImport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPendingImport(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, margin: '0 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 20px' }}>{t('home.importConfirmText')}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPendingImport(null)} className="btn-ghost" style={{ padding: '6px 16px', fontSize: 11 }}>{t('home.importConfirmCancel')}</button>
              <button onClick={confirmImport} className="btn-primary" style={{ padding: '6px 16px', fontSize: 11 }}>{t('home.importConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      {scriptHint && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, margin: '0 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 20px' }}>{scriptHint.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => { const id = scriptHint.sceneId; setScriptHint(null); enterWorkbench(id) }} className="btn-primary" style={{ padding: '6px 16px', fontSize: 11 }}>{t('home.importConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => setPendingDelete(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, margin: '0 16px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
            <p style={{ fontSize: 13, color: 'var(--ink)', lineHeight: 1.6, margin: '0 0 20px' }}>{t('home.deleteConfirmText', { name: pendingDelete.name })}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setPendingDelete(null)} className="btn-ghost" style={{ padding: '6px 16px', fontSize: 11 }}>{t('home.deleteConfirmCancel')}</button>
              <button onClick={() => { const id = pendingDelete.id; setPendingDelete(null); void deleteScene(id) }} className="btn-primary" style={{ padding: '6px 16px', fontSize: 11 }}>{t('home.deleteConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 960, margin: '32px auto 0', padding: '0 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sub)' }}>{t('home.myProjects', { count: scenes.length })}</span>
        </div>
        <div style={{ height: 1, background: 'var(--line)', marginBottom: 20 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {scenes.map(scene => {
            const stColor = statusColors[scene.status] || statusColors.active
            const stText = t(`home.status.${scene.status}`, { defaultValue: t('home.status.active') })
            return (
              <div key={scene.id} onClick={() => handleCardClick(scene.id)}
                style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 10, padding: 16, cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{scene.name}</span>
                  <button onClick={e => { e.stopPropagation(); setPendingDelete({ id: scene.id, name: scene.name }) }} style={{ background: 'none', border: 'none', color: 'var(--tri)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Close size={14} /></button>
                </div>
                <div style={{ marginTop: 10 }}>{evidenceBar(scene)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <div style={{ width: 9, height: 9, borderRadius: '50%', background: stColor }} />
                  <span style={{ fontSize: 10, color: 'var(--sub)' }}>{stText}</span>
                </div>
              </div>
            )
          })}
          <div onClick={handleStart}
            style={{ border: '1.5px dashed var(--accent)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 80 }}>
            {t('home.newProject')}
          </div>
        </div>
      </div>
      <p style={{ textAlign: 'center', marginTop: 32, fontSize: 9, color: 'var(--tri)' }}>{t('home.communityComingSoon')}</p>
    </div>
  )
}

export default Home
