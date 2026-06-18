import React, { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import ReferencePanel from '../components/ReferencePanel'
import FileAttachmentPanel from '../components/FileAttachmentPanel'
import Conversation from '../components/Conversation'
import PageNav from '../components/PageNav'
import { ArrowLeft, Edit as EditIcon, Close } from '../components/Icons'
import FlowCanvas from '../components/FlowCanvas'

const Workbench: React.FC = () => {
  const { t } = useTranslation()
  const currentScene = useSceneStore(s => s.currentScene)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const updateScene = useSceneStore(s => s.updateScene)
  const [exporting, setExporting] = useState(false)
  const [exportResult, setExportResult] = useState<string | null>(null)
  const [refsCollapsed, setRefsCollapsed] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const editingNameRef = useRef(false) // 去重守卫：Enter 保存后 blur 不再重复保存

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
    if (!editingNameRef.current) return // 已保存/已取消，blur 不再重复触发
    editingNameRef.current = false
    setEditingName(false)
    const name = nameInput.trim()
    if (currentScene && name && name !== currentScene.name) {
      await updateScene(currentScene.id, { name })
    }
  }

  if (!currentScene) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sub)' }}>
        <p>{t('workbench.selectSceneHint')}</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', height: 56, borderBottom: '1px solid var(--line)', background: '#fff', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCurrentPage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--ink)' }}><ArrowLeft size={16} /></button>
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
              style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 8px', outline: 'none' }}
            />
          ) : (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{currentScene.name}</span>
              <button onClick={startEditName} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><EditIcon size={13} /></button>
            </>
          )}
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <PageNav current="workbench" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={async () => {
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
          }} disabled={exporting} className="btn-primary" style={{ padding: '6px 16px', fontSize: 11 }}>
            {exporting ? t('workbench.exporting') : t('workbench.export')}
          </button>
        </div>
      </div>

      {exportResult && (
        <div style={{ padding: '8px 16px', background: 'var(--canvas)', borderBottom: '1px solid var(--line)', fontSize: 10, color: 'var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ whiteSpace: 'pre-wrap' }}>{exportResult}</span>
          <button onClick={() => setExportResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)' }}><Close size={12} /></button>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', gap: 16, padding: '16px 16px 0' }}>
        {refsCollapsed ? (
          <div style={{ width: 28, flexShrink: 0 }}>
            <button onClick={() => setRefsCollapsed(false)} title={t('workbench.expandRefs')}
              style={{
                width: '100%', background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 10,
                padding: '10px 0', cursor: 'pointer', color: 'var(--sub)', fontSize: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
              }}>
              <span>»</span>
              <span style={{ writingMode: 'vertical-rl', letterSpacing: 2 }}>{t('workbench.refs')}</span>
              {currentScene.references.length > 0 && <span>{currentScene.references.length}</span>}
            </button>
          </div>
        ) : (
          <div style={{ width: 216, display: 'flex', flexDirection: 'column', gap: 12, flexShrink: 0, overflow: 'auto' }}>
            <div style={{ background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, overflow: 'auto' }}>
              <ReferencePanel sceneId={currentScene.id} references={currentScene.references} onCollapse={() => setRefsCollapsed(true)} />
            </div>
            <div style={{ background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, overflow: 'auto' }}>
              <FileAttachmentPanel sceneId={currentScene.id} kind="script" items={currentScene.scripts} />
            </div>
            <div style={{ background: 'var(--canvas)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, overflow: 'auto' }}>
              <FileAttachmentPanel sceneId={currentScene.id} kind="asset" items={currentScene.assets} />
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'hidden', minWidth: 0, border: '1px solid var(--line)', borderRadius: 10, background: '#fff' }}>
          <FlowCanvas sceneId={currentScene.id} canvas={currentScene.canvas} />
        </div>

        <div style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 9, color: 'var(--tri)', marginBottom: 4 }}>{t('workbench.agentDriven')}</span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Conversation sceneId={currentScene.id} conversation={currentScene.conversation} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default Workbench
