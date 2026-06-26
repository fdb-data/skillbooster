import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { Reference } from '../contracts/ipc-types'

const ReferencePanel: React.FC<{ sceneId: string; references: Reference[]; onCollapse?: () => void }> = ({ sceneId, references, onCollapse }) => {
  const { t } = useTranslation()
  const addReference = useSceneStore(s => s.addReference)
  const removeReference = useSceneStore(s => s.removeReference)
  const setReferenceInclude = useSceneStore(s => s.setReferenceInclude)
  const draftFromDocs = useSceneStore(s => s.draftFromDocs)
  const isLoading = useSceneStore(s => s.isLoading)

  const handleUpload = async () => {
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = true
    el.accept = '.txt,.md,.pdf,.docx'
    el.onchange = async () => {
      if (el.files) {
        for (const file of el.files) {
          await addReference(sceneId, file.path)
        }
      }
    }
    el.click()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--sub)' }}>{t('reference.title')}</h4>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button onClick={handleUpload} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 11 }}>{t('reference.upload')}</button>
          {onCollapse && (
            <button onClick={onCollapse} title={t('reference.collapse')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tri)', fontSize: 13, padding: '0 2px' }}>«</button>
          )}
        </div>
      </div>

      {references.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--tri)', margin: 0 }}>{t('reference.empty')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {references.map(ref => (
            <div key={ref.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 12
            }}>
              <input type="checkbox" checked={ref.includeInPackage}
                onChange={() => setReferenceInclude(sceneId, ref.id, !ref.includeInPackage)}
                style={{ width: 12, height: 12 }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                {ref.filename}
              </span>
              <button onClick={() => removeReference(sceneId, ref.id)}
                style={{ border: 'none', background: 'transparent', color: 'var(--tri)', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {references.length > 0 && (
        <button onClick={() => draftFromDocs(sceneId)} disabled={isLoading}
          className="btn-primary" style={{ width: '100%', marginTop: 8, padding: '6px', fontSize: 11 }}>
          {isLoading ? t('reference.drafting') : t('reference.draftFromDocs')}
        </button>
      )}
      <p style={{ fontSize: 8, color: 'var(--tri)', marginTop: 6 }}>{t('reference.includeHint')}</p>
    </div>
  )
}

export default ReferencePanel
