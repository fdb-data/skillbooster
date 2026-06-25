import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import type { AgentKey } from '../contracts/agent-events'

interface ModelBadgeProps {
  agentKey: AgentKey
}

const ModelBadge: React.FC<ModelBadgeProps> = ({ agentKey }) => {
  const { t } = useTranslation()
  const resolveAgentLLMConfig = useSceneStore(s => s.resolveAgentLLMConfig)
  const [config, setConfig] = useState<{ provider: string; model: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    resolveAgentLLMConfig(agentKey).then(res => {
      if (!cancelled) setConfig(res)
    }).catch(() => {
      if (!cancelled) setConfig(null)
    })
    return () => { cancelled = true }
  }, [agentKey, resolveAgentLLMConfig])

  if (!config) return null

  return (
    <div
      title={t('modelBadge.title', { provider: config.provider, model: config.model })}
      className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full border border-line bg-canvas px-2 py-0.5 text-[10px] text-sub"
    >
      <span className="truncate">{config.provider}</span>
      <span className="text-tri">/</span>
      <span className="truncate font-medium text-ink">{config.model}</span>
    </div>
  )
}

export default ModelBadge
