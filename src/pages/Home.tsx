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
      <div className="flex h-1.5 w-24 gap-px overflow-hidden rounded-full bg-line">
        {counts.institutional > 0 && <div style={{ flex: counts.institutional / total, background: '#2E9E6B' }} />}
        {counts.validated > 0 && <div style={{ flex: counts.validated / total, background: '#3B82F6' }} />}
        {counts.sample > 0 && <div style={{ flex: counts.sample / total, background: '#E0A93B' }} />}
        {counts.exploratory > 0 && <div style={{ flex: counts.exploratory / total, background: '#E05D5D' }} />}
      </div>
    )
  }

  return (
    <div className="relative h-full overflow-auto bg-white">
      {/* 顶部柔光：靛蓝品牌色，营造纵深，不改主色 */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px]"
        style={{ background: 'radial-gradient(58% 70% at 50% -8%, rgba(79,70,229,0.10), rgba(79,70,229,0.03) 42%, transparent 72%)' }} />

      <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line/70 bg-white/75 px-7 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <MindLogo size={18} />
          <span className="text-[13px] font-bold tracking-tight text-ink">{t('home.brand')}</span>
        </div>
        <button onClick={() => setCurrentPage('settings')} className="flex cursor-pointer items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] text-tri transition-colors hover:bg-canvas hover:text-sub">
          <SettingsIcon size={14} /> {t('home.settings')}
        </button>
      </div>

      <div className="relative pb-6 pt-16 text-center">
        <h1 className="mx-auto mb-3 max-w-[720px] px-6 text-[30px] font-bold leading-tight tracking-tight text-ink">{t('home.heroTitle')}</h1>
        <p className="mx-auto max-w-[560px] px-6 text-[13px] leading-relaxed text-sub">{t('home.heroSubtitle')}</p>
      </div>

      <div className="relative mx-auto w-full max-w-[680px] px-6">
        <div onDrop={handleDrop} onDragOver={handleDragOver}
          className="group min-h-[116px] rounded-2xl border border-accent-edge bg-white px-5 py-4 shadow-[0_4px_24px_-8px_rgba(17,17,46,0.08)] transition-all duration-200 focus-within:border-accent focus-within:shadow-[0_12px_40px_-10px_rgba(79,70,229,0.28)]">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleStart() }}
            placeholder={t('home.inputPlaceholder')}
            className="min-h-[52px] w-full resize-none border-none bg-transparent font-[inherit] text-[14px] leading-relaxed text-ink outline-none placeholder:text-tri" />
          {attachedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {attachedFiles.map(f => (
                <div key={f.path} className="flex max-w-[220px] items-center gap-1 rounded-full border border-line bg-canvas px-2 py-[3px] text-[10px] text-ink">
                  <Paperclip size={11} />
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap">{f.name}</span>
                  <button onClick={() => setAttachedFiles(prev => prev.filter(p => p.path !== f.path))}
                    className="flex cursor-pointer items-center border-none bg-none p-0 text-tri hover:text-sub"><Close size={11} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={handleFileAttach} title={t('home.dropHint')} className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-tri transition-colors hover:bg-canvas hover:text-accent"><Paperclip size={15} /></button>
              <span className="text-[9px] text-tri">{t('home.dropHint')}</span>
            </div>
            <button onClick={handleStart} disabled={!input.trim() && attachedFiles.length === 0}
              className="btn-primary flex items-center gap-1.5 px-5 py-2.5 text-[12px] shadow-[0_4px_14px_-2px_rgba(79,70,229,0.45)] transition-all hover:-translate-y-px disabled:shadow-none">{t('home.startProject')} <ArrowRight size={13} /></button>
          </div>
        </div>
      </div>

      <p className="relative mx-auto mt-3.5 w-fit cursor-pointer text-center text-[11px] text-accent transition-colors hover:text-ink">{t('home.draftFromDocsHint')}</p>

      <div className="relative mx-auto mt-5 w-full max-w-[680px] px-6">
        <div onDrop={handleImportDrop} onDragOver={handleDragOver}
          className="rounded-2xl border border-dashed border-line bg-canvas/60 px-5 py-4 transition-colors hover:border-accent-edge">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-0.5 text-xs font-semibold text-ink">{t('home.importSkill')}</div>
              <div className="text-[10px] text-sub">{t('home.importSectionHint')}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <button onClick={() => pickImport('file')} disabled={importing} className="btn-primary whitespace-nowrap px-3.5 py-1.5 text-[10px]">{t('home.importPickFile')}</button>
              <button onClick={() => pickImport('folder')} disabled={importing} className="btn-ghost whitespace-nowrap px-3.5 py-1.5 text-[10px]">{t('home.importPickFolder')}</button>
            </div>
          </div>
          <div className="mt-2 text-[9px] text-tri">{importing ? t('home.importing') : t('home.importDropHint')}</div>
        </div>
      </div>

      {pendingImport && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35"
          onClick={() => setPendingImport(null)}>
          <div onClick={e => e.stopPropagation()}
            className="mx-4 max-w-[380px] rounded-xl bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
            <p className="mb-5 text-[13px] leading-relaxed text-ink">{t('home.importConfirmText')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingImport(null)} className="btn-ghost px-4 py-1.5 text-[11px]">{t('home.importConfirmCancel')}</button>
              <button onClick={confirmImport} className="btn-primary px-4 py-1.5 text-[11px]">{t('home.importConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      {scriptHint && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35">
          <div className="mx-4 max-w-[380px] rounded-xl bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
            <p className="mb-5 text-[13px] leading-relaxed text-ink">{scriptHint.message}</p>
            <div className="flex justify-end">
              <button onClick={() => { const id = scriptHint.sceneId; setScriptHint(null); enterWorkbench(id) }} className="btn-primary px-4 py-1.5 text-[11px]">{t('home.importConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/35"
          onClick={() => setPendingDelete(null)}>
          <div onClick={e => e.stopPropagation()}
            className="mx-4 max-w-[380px] rounded-xl bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
            <p className="mb-5 text-[13px] leading-relaxed text-ink">{t('home.deleteConfirmText', { name: pendingDelete.name })}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setPendingDelete(null)} className="btn-ghost px-4 py-1.5 text-[11px]">{t('home.deleteConfirmCancel')}</button>
              <button onClick={() => { const id = pendingDelete.id; setPendingDelete(null); void deleteScene(id) }} className="btn-primary px-4 py-1.5 text-[11px]">{t('home.deleteConfirmOk')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mx-auto mt-12 w-full max-w-[920px] px-6">
        <div className="mb-3.5 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-tri">{t('home.myProjects', { count: scenes.length })}</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-3.5">
          {scenes.map((scene, i) => {
            const stColor = statusColors[scene.status] || statusColors.active
            const stText = t(`home.status.${scene.status}`, { defaultValue: t('home.status.active') })
            return (
              <div key={scene.id} onClick={() => handleCardClick(scene.id)}
                className="animate-fade-up group cursor-pointer rounded-xl border border-line bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(17,17,46,0.03)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-1 hover:border-accent-edge hover:shadow-[0_10px_28px_-8px_rgba(79,70,229,0.22)]"
                style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-ink transition-colors group-hover:text-accent">{scene.name}</span>
                  <button onClick={e => { e.stopPropagation(); setPendingDelete({ id: scene.id, name: scene.name }) }} className="-mr-1 -mt-1 flex shrink-0 cursor-pointer items-center rounded-md border-none bg-none p-1 text-tri opacity-0 transition-all hover:bg-canvas hover:text-sub group-hover:opacity-100"><Close size={13} /></button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="h-[6px] w-[6px] rounded-full" style={{ background: stColor }} />
                    <span className="text-[10px] text-sub">{stText}</span>
                  </div>
                  {evidenceBar(scene)}
                </div>
              </div>
            )
          })}
          <button onClick={handleStart}
            className="animate-fade-up flex min-h-[84px] cursor-pointer items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-accent-edge bg-transparent px-4 text-xs font-semibold text-accent transition-all duration-200 hover:-translate-y-1 hover:border-accent hover:bg-accent-soft"
            style={{ animationDelay: `${Math.min(scenes.length, 12) * 45}ms` }}>
            {t('home.newProject')}
          </button>
        </div>
      </div>
      <p className="relative mb-12 mt-12 text-center text-[9px] text-tri">{t('home.communityComingSoon')}</p>
    </div>
  )
}

export default Home
