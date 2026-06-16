import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { Attachment, AttachmentKind } from '../contracts/ipc-types'

/** 脚本区允许的文件类型（文件选择器 accept 过滤，常见可执行脚本） */
const SCRIPT_ACCEPT = '.py,.js,.mjs,.cjs,.ts,.sh,.bash,.ps1,.bat,.cmd,.rb,.pl,.php,.lua,.r,.go,.sql'
/** 资产区允许的文件类型（模板/图片/数据） */
const ASSET_ACCEPT = '.md,.txt,.json,.yaml,.yml,.csv,.xml,.html,.css,.png,.jpg,.jpeg,.gif,.svg,.webp,.pdf,.docx,.xlsx,.pptx,.zip'

/**
 * 脚本 / 资产共用的文件挂载面板：增 / 看(系统默认程序打开) / 留(打包开关) / 删。
 * 不解析内容、不喂 agent、不内置查看器/编辑器。镜像参考文档的交互，刻意保持独立于 ReferencePanel。
 */
const FileAttachmentPanel: React.FC<{
  sceneId: string
  kind: AttachmentKind
  items: Attachment[]
}> = ({ sceneId, kind, items }) => {
  const { t } = useTranslation()
  const addAttachment = useSceneStore(s => s.addAttachment)
  const removeAttachment = useSceneStore(s => s.removeAttachment)
  const setAttachmentInclude = useSceneStore(s => s.setAttachmentInclude)
  const openAttachment = useSceneStore(s => s.openAttachment)

  const ns = kind === 'script' ? 'scripts' : 'assets'
  const accept = kind === 'script' ? SCRIPT_ACCEPT : ASSET_ACCEPT

  const handleUpload = (): void => {
    const el = document.createElement('input')
    el.type = 'file'
    el.multiple = true
    el.accept = accept
    el.onchange = async () => {
      if (el.files) {
        for (const file of el.files) {
          await addAttachment(sceneId, kind, file.path)
        }
      }
    }
    el.click()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h4 style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--sub)' }}>{t(`${ns}.title`)}</h4>
        <button onClick={handleUpload} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 9 }}>{t(`${ns}.upload`)}</button>
      </div>

      {items.length === 0 ? (
        <p style={{ fontSize: 9, color: 'var(--tri)', margin: 0 }}>{t(`${ns}.empty`)}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '4px 6px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 10
            }}>
              <input type="checkbox" checked={item.includeInPackage}
                onChange={() => setAttachmentInclude(sceneId, kind, item.id, !item.includeInPackage)}
                style={{ width: 12, height: 12 }} />
              <span
                onClick={() => openAttachment(sceneId, item.id)}
                title={t(`${ns}.openHint`)}
                style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', cursor: 'pointer' }}>
                {item.filename}
              </span>
              <button onClick={() => removeAttachment(sceneId, kind, item.id)}
                style={{ border: 'none', background: 'transparent', color: 'var(--tri)', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 8, color: 'var(--tri)', marginTop: 6 }}>{t(`${ns}.includeHint`)}</p>
    </div>
  )
}

export default FileAttachmentPanel
