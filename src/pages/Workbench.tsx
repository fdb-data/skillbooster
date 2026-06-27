import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import ReferencePanel from '../components/ReferencePanel'
import FileAttachmentPanel from '../components/FileAttachmentPanel'
import Conversation from '../components/Conversation'
import PageNav from '../components/PageNav'
import { ArrowLeft, Edit as EditIcon, Close, Shield } from '../components/Icons'
import FlowCanvas from '../components/FlowCanvas'
import PageHeader from '../components/ui/PageHeader'
import SecurityCheckPanel from '../components/SecurityCheckPanel'
import type { SecurityFinding } from '../contracts/ipc-types'

const Workbench: React.FC = () => {
  const { t } = useTranslation()
  const currentScene = useSceneStore(s => s.currentScene)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const updateScene = useSceneStore(s => s.updateScene)
  const runSecurityCheck = useSceneStore(s => s.runSecurityCheck)
  const remediateFindings = useSceneStore(s => s.remediateFindings)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)
  const [securityOpen, setSecurityOpen] = useState(false)
  const [refsCollapsed, setRefsCollapsed] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const editingNameRef = useRef(false)

  const startEditName = (): void => {
    if (!currentScene) return
    setNameInput(currentScene.name)
    editingNameRef.current = true
    setEditingName(true)
  }
  const cancelEditName = (): void => {
    editingNameRef.current = false
    setEditingName(false)
  }
  const saveName = async (): Promise<void> => {
    if (!editingNameRef.current) return
    editingNameRef.current = false
    setEditingName(false)
    const name = nameInput.trim()
    if (currentScene && name && name !== currentScene.name) {
      await updateScene(currentScene.id, { name })
    }
  }

  const runSecurity = async (): Promise<void> => {
    if (!currentScene) return
    await runSecurityCheck(currentScene.id)
  }

  const remediateSecurity = async (findings: SecurityFinding[]): Promise<void> => {
    if (!currentScene || findings.length === 0) return
    await remediateFindings(currentScene.id, findings)
  }

  if (!currentScene) {
    return (
      <div className="flex h-full items-center justify-center text-sub">
        <p>{t('workbench.selectSceneHint')}</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        left={
          <>
            <button onClick={() => setCurrentPage('home')} className="flex cursor-pointer items-center text-ink hover:text-accent"><ArrowLeft size={16} /></button>
            {editingName ? (
              <input
                autoFocus
                value={nameInput}
                onChange={e => setNameInput(e.target.value)}
                onBlur={saveName}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName()
                  else if (e.key === 'Escape') cancelEditName()
                }}
                className="rounded-md border border-line px-2 py-0.5 text-[13px] font-bold text-ink outline-none focus:border-accent"
              />
            ) : (
              <>
                <span className="text-[13px] font-bold text-ink">{currentScene.name}</span>
                <button onClick={startEditName} className="flex cursor-pointer items-center text-tri hover:text-accent"><EditIcon size={13} /></button>
              </>
            )}
          </>
        }
        center={<PageNav current="workbench" />}
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSecurityOpen(o => !o)}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-canvas px-3 py-1.5 text-[13px] text-ink hover:bg-surface"
            >
              <Shield size={14} />
              {t('workbench.securityCheck')}
            </button>
            <button
              onClick={async () => {
                if (!currentScene) return
                setExporting(true)
                setExportResult(null)
                try {
                  const health = await window.api.export.healthCheck(currentScene.id)
                  if (health.success && health.data && !health.data.passed) {
                    const warnings = health.data.warnings.map((w: { message: string }) => w.message).join('\n')
                    setExportResult(t('workbench.healthWarnings', { warnings }))
                    setExporting(false)
                    return
                  }
                  const result = await window.api.export.buildPackage(currentScene.id)
                  if (result.success && result.data) {
                    setExportResult(t('workbench.packageExported', { path: result.data.filePath }))
                  } else {
                    setExportResult(t('workbench.exportFailed'))
                  }
                } catch (err) {
                  setExportResult(t('workbench.errorPrefix', { message: (err as Error).message }))
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting}
              className="btn-primary px-4 py-1.5 text-[13px]"
            >
              {exporting ? t('workbench.exporting') : t('workbench.export')}
            </button>
          </div>
        }
      />

      {exportResult && (
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-canvas px-4 py-2 text-[12px] text-ink">
          <span className="whitespace-pre-wrap">{exportResult}</span>
          <button onClick={() => setExportResult(null)} className="flex cursor-pointer items-center text-tri hover:text-sub"><Close size={12} /></button>
        </div>
      )}

      {securityOpen && (
        <SecurityCheckPanel
          sceneId={currentScene.id}
          onStart={runSecurity}
          onRerun={runSecurity}
          onRemediate={remediateSecurity}
          onClose={() => setSecurityOpen(false)}
        />
      )}

      <div className="relative flex flex-1 gap-5 overflow-hidden px-[18px] pt-[18px]">
        <div className="w-7 shrink-0">
          <button
            onClick={() => setRefsCollapsed(c => !c)}
            title={t('workbench.expandRefs')}
            className={`flex w-full cursor-pointer flex-col items-center gap-1.5 rounded-card border px-0 py-2.5 text-[12px] transition-colors ${refsCollapsed ? 'border-line bg-canvas text-sub hover:bg-surface' : 'border-accent-edge bg-accent-soft text-accent'}`}
          >
            <span>{refsCollapsed ? '»' : '«'}</span>
            <span style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>{t('workbench.refs')}</span>
            {currentScene.references.length > 0 && <span>{currentScene.references.length}</span>}
          </button>
        </div>

        {!refsCollapsed && (
          <div className="absolute bottom-[18px] left-[54px] top-[18px] z-30 flex w-[300px] flex-col gap-3 overflow-auto rounded-xl border border-line bg-surface p-3 shadow-lg">
            <div className="overflow-auto rounded-card border border-line bg-canvas p-3">
              <ReferencePanel sceneId={currentScene.id} references={currentScene.references} onCollapse={() => setRefsCollapsed(true)} />
            </div>
            <div className="overflow-auto rounded-card border border-line bg-canvas p-3">
              <FileAttachmentPanel sceneId={currentScene.id} kind="script" items={currentScene.scripts} />
            </div>
            <div className="overflow-auto rounded-card border border-line bg-canvas p-3">
              <FileAttachmentPanel sceneId={currentScene.id} kind="asset" items={currentScene.assets} />
            </div>
          </div>
        )}

        <div className="flex w-[380px] shrink-0 flex-col">
          <span className="mb-1 text-[11px] text-tri">{t('workbench.agentDriven')}</span>
          <div className="flex-1 overflow-hidden">
            <Conversation sceneId={currentScene.id} conversation={currentScene.conversation} />
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-hidden rounded-card border border-line bg-canvas">
          <FlowCanvas sceneId={currentScene.id} canvas={currentScene.canvas} />
        </div>
      </div>
    </div>
  )
}

export default Workbench
