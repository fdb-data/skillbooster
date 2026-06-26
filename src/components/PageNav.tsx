import React from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'

type NavPage = 'guide' | 'workbench' | 'validate'

/**
 * 三个核心页面（场景定义 / 萃取 / 验证）的共享导航条。
 * 当前页显示为不可点的 btn-soft，其余为可点跳转的 btn-ghost。
 * 复用 workbench.* 的 i18n key，三页文案保持一致。
 */
const PageNav: React.FC<{ current: NavPage }> = ({ current }) => {
  const { t } = useTranslation()
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)

  const items: { page: NavPage; label: string }[] = [
    { page: 'guide', label: t('workbench.sceneDefine') },
    { page: 'workbench', label: t('workbench.extraction') },
    { page: 'validate', label: t('workbench.validate') }
  ]

  return (
    <div className="flex items-center gap-2">
      {items.map(it => it.page === current ? (
        <span key={it.page} className="btn-soft cursor-default px-4 py-1.5 text-[13px]">{it.label}</span>
      ) : (
        <button key={it.page} onClick={() => setCurrentPage(it.page)} className="btn-ghost px-4 py-1.5 text-[13px]">{it.label}</button>
      ))}
    </div>
  )
}

export default PageNav
