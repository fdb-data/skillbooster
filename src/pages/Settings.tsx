import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { ArrowLeft } from '../components/Icons'
import { setLanguage, SUPPORTED_LANGS, LANG_LABELS } from '../i18n'
import type { Lang } from '../i18n'
import { setTheme, THEME_MODES } from '../theme'
import type { ThemeMode } from '../theme'
import type { LLMConfig, LLMProviderConfig, AgentConfig } from '../global'

type SettingsTab = 'llm' | 'agents' | 'general'

interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  status?: 'ok' | 'fail' | 'unknown'
}

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const loadLLMConfig = useSceneStore(s => s.loadLLMConfig)
  const saveLLMConfig = useSceneStore(s => s.saveLLMConfig)
  const testConnection = useSceneStore(s => s.testConnection)
  const llmConfig = useSceneStore(s => s.llmConfig)
  const loadLLMProviders = useSceneStore(s => s.loadLLMProviders)
  const saveLLMProviders = useSceneStore(s => s.saveLLMProviders)
  const llmProviders = useSceneStore(s => s.llmProviders)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)

  const [tab, setTab] = useState<SettingsTab>('general')
  const [providers, setProviders] = useState<ProviderConfig[]>([])
  const [selectedProvider, setSelectedProvider] = useState<number>(0)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null)
  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentConfig>>({})
  const [agentTesting, setAgentTesting] = useState<string | null>(null)
  const [theme, setThemeState] = useState<ThemeMode>('system')

  useEffect(() => { loadLLMConfig(); loadLLMProviders() }, [loadLLMConfig, loadLLMProviders])

  useEffect(() => {
    window.api.settings.getTheme().then(res => {
      if (res.success && res.data) setThemeState(res.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    const loadAgents = async () => {
      try {
        const res = await window.api.settings.getAgentConfigs()
        if (res.success && res.data) {
          const map: Record<string, AgentConfig> = {}
          res.data.forEach(c => { map[c.agentKey] = c })
          setAgentConfigs(map)
        }
      } catch {}
    }
    loadAgents()
  }, [])

  useEffect(() => {
    if (llmProviders.length > 0) {
      setProviders(llmProviders.map(p => ({
        id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models, status: 'unknown' as const
      })))
    } else if (llmConfig) {
      setProviders([{
        id: '1', name: llmConfig.provider === 'openai' ? 'OpenAI' : llmConfig.provider === 'azure' ? 'Azure' : 'Custom',
        baseUrl: llmConfig.baseUrl || '', apiKey: llmConfig.apiKey,
        models: [llmConfig.model], status: 'unknown'
      }])
    }
  }, [llmProviders, llmConfig])

  const handleAddProvider = () => {
    setProviders(prev => [...prev, {
      id: String(prev.length + 1), name: 'New Provider', baseUrl: '', apiKey: '', models: ['gpt-4o'], status: 'unknown'
    }])
    setSelectedProvider(providers.length)
  }

  const handleProviderChange = (field: keyof ProviderConfig, value: string) => {
    setProviders(prev => prev.map((p, i) => i === selectedProvider ? { ...p, [field]: value } : p))
  }

  const handleAddModel = () => {
    setProviders(prev => prev.map((p, i) =>
      i === selectedProvider ? { ...p, models: [...p.models, 'new-model'] } : p
    ))
  }

  const handleRemoveModel = (idx: number) => {
    setProviders(prev => prev.map((p, i) =>
      i === selectedProvider ? { ...p, models: p.models.filter((_, j) => j !== idx) } : p
    ))
  }

  const handleModelChange = (idx: number, value: string) => {
    setProviders(prev => prev.map((p, i) =>
      i === selectedProvider ? { ...p, models: p.models.map((m, j) => j === idx ? value : m) } : p
    ))
  }

  const handleSave = async () => {
    if (providers.length === 0) return
    const providerConfigs: LLMProviderConfig[] = providers.map(p => ({
      id: p.id, name: p.name, baseUrl: p.baseUrl, apiKey: p.apiKey, models: p.models
    }))
    await saveLLMProviders(providerConfigs)
    const p = providers[selectedProvider]
    const providerType: 'openai' | 'azure' | 'custom' = p.name.toLowerCase() === 'openai' ? 'openai' : p.name.toLowerCase() === 'azure' ? 'azure' : 'custom'
    const config: LLMConfig = {
      provider: providerType,
      apiKey: p.apiKey,
      model: p.models[0] || 'gpt-4o',
      baseUrl: p.baseUrl || undefined
    }
    await saveLLMConfig(config)
    setTestResult({ success: true })
  }

  const handleTest = async () => {
    if (providers.length === 0) return
    const p = providers[selectedProvider]
    setTesting(true)
    setTestResult(null)
    try {
      const providerType: 'openai' | 'azure' | 'custom' = p.name.toLowerCase() === 'openai' ? 'openai' : p.name.toLowerCase() === 'azure' ? 'azure' : 'custom'
      const config: LLMConfig = {
        provider: providerType,
        apiKey: p.apiKey, model: p.models[0] || 'gpt-4o',
        baseUrl: p.baseUrl || undefined
      }
      const { success, error } = await testConnection(config)
      setTestResult({ success, error: success ? undefined : (error || t('settings.connectionFailed')) })
      setProviders(prev => prev.map((pr, i) => i === selectedProvider ? { ...pr, status: success ? 'ok' : 'fail' } : pr))
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const agentCards = [
    { key: 'guide', label: t('settings.agents.guideLabel'), desc: t('settings.agents.guideDesc'), promptFile: 'agents/guide.md' },
    { key: 'extract', label: t('settings.agents.extractLabel'), desc: t('settings.agents.extractDesc'), promptFile: 'experience-extraction/SKILL.md' },
    { key: 'validate', label: t('settings.agents.validateLabel'), desc: t('settings.agents.validateDesc'), promptFile: 'agents/validate.md' }
  ]

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 items-center border-b border-line px-7">
        <button onClick={() => setCurrentPage('home')} className="flex cursor-pointer items-center text-ink hover:text-accent"><ArrowLeft size={16} /></button>
        <span className="ml-2 text-[13px] font-bold text-ink">{t('settings.title')}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[180px] shrink-0 border-r border-line p-3">
          {(['general', 'llm', 'agents'] as SettingsTab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              className={`mb-0.5 block w-full rounded-md px-2.5 py-2 text-left text-[11px] transition-colors ${tab === tabKey ? 'bg-accent-soft font-semibold text-accent' : 'text-sub hover:bg-canvas'}`}>
              {{ llm: t('settings.tabLlm'), agents: t('settings.tabAgents'), general: t('settings.tabGeneral') }[tabKey]}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="mx-auto max-w-[640px]">
          {tab === 'llm' && (
            <div>
              <h3 className="mb-4 text-[13px] font-bold text-ink">{t('settings.providerList')}</h3>
              <div className="flex flex-col gap-1.5">
                {providers.map((p, i) => (
                  <div key={p.id} onClick={() => setSelectedProvider(i)}
                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 transition-colors ${i === selectedProvider ? 'border-accent-edge bg-accent-soft' : 'border-line bg-surface hover:border-accent-edge'}`}>
                    <div>
                      <span className="text-[11px] font-semibold text-ink">{p.name}</span>
                      <span className="ml-2 text-[9px] text-tri">{t('settings.modelsCount', { count: p.models.length })}</span>
                    </div>
                    <span className="rounded px-1.5 py-px text-[9px]" style={{
                      background: p.status === 'ok' ? '#dcfce7' : p.status === 'fail' ? '#fee2e2' : 'var(--canvas)',
                      color: p.status === 'ok' ? '#16a34a' : p.status === 'fail' ? '#dc2626' : 'var(--tri)'
                    }}>
                      {p.status === 'ok' ? t('common.connected') : p.status === 'fail' ? t('common.failed') : t('common.unknown')}
                    </span>
                  </div>
                ))}
              </div>
              <button onClick={handleAddProvider} className="btn-ghost mt-2 px-3 py-1.5 text-[10px]">{t('settings.addProvider')}</button>

              {providers.length > 0 && (
                <div className="mt-5 rounded-card border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-semibold text-sub">{t('settings.name')}</label>
                    <input value={providers[selectedProvider]?.name || ''} onChange={e => handleProviderChange('name', e.target.value)}
                      className="input-pill w-full text-[11px]" />
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-semibold text-sub">Base URL</label>
                    <input value={providers[selectedProvider]?.baseUrl || ''} onChange={e => handleProviderChange('baseUrl', e.target.value)}
                      placeholder="https://api.example.com/v1" className="input-pill w-full text-[11px]" />
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-semibold text-sub">API Key</label>
                    <input type="password" value={providers[selectedProvider]?.apiKey || ''} onChange={e => handleProviderChange('apiKey', e.target.value)}
                      className="input-pill w-full text-[11px]" />
                  </div>
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-semibold text-sub">{t('settings.modelList')}</label>
                    <div className="flex flex-wrap gap-1.5">
                      {(providers[selectedProvider]?.models || []).map((m, j) => (
                        <span key={j} className="flex items-center gap-1 rounded bg-accent-soft px-2 py-0.5 text-[9px] text-accent">
                          <input value={m} onChange={e => handleModelChange(j, e.target.value)}
                            className="w-20 border-none bg-transparent text-[9px] text-accent outline-none" />
                          <button onClick={() => handleRemoveModel(j)} className="cursor-pointer border-none bg-none text-[10px] text-tri hover:text-sub">×</button>
                        </span>
                      ))}
                      <button onClick={handleAddModel} className="btn-ghost px-1.5 py-0.5 text-[8px]">+</button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSave} className="btn-primary px-4 py-1.5 text-[10px]">{t('common.save')}</button>
                    <button onClick={handleTest} disabled={testing} className="btn-ghost px-4 py-1.5 text-[10px]">
                      {testing ? t('common.testing') : t('settings.testConnection')}
                    </button>
                  </div>
                  {testResult && (
                    <div className="mt-2 rounded-md p-2 text-[10px]" style={{
                      background: testResult.success ? '#dcfce7' : '#fee2e2',
                      color: testResult.success ? '#16a34a' : '#dc2626'
                    }}>
                      {testResult.success ? `✓ ${t('common.connected')}` : `✕ ${testResult.error || t('common.failed')}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'agents' && (
            <div>
              <h3 className="mb-4 text-[13px] font-bold text-ink">{t('settings.agentTitle')}</h3>
              <div className="flex flex-col gap-3">
                {agentCards.map(agent => {
                  const cfg = agentConfigs[agent.key]
                  const selectedProviderIdx = cfg ? providers.findIndex(p => p.name.toLowerCase().includes(cfg.provider.toLowerCase())) : 0
                  const currentProvider = providers[selectedProviderIdx] || providers[0]
                  return (
                    <div key={agent.key} className="rounded-card border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                      <h4 className="mb-1 text-xs font-bold text-ink">{agent.label}</h4>
                      <p className="mb-3 text-[10px] text-sub">{agent.desc}</p>
                      <div className="mb-2 flex items-center gap-2">
                        <label className="w-10 text-[9px] text-tri">Provider</label>
                        <select value={selectedProviderIdx} onChange={async e => {
                          const idx = Number(e.target.value)
                          const p = providers[idx]
                          if (p) {
                            const newCfg: AgentConfig = { agentKey: agent.key, provider: p.name, apiKey: p.apiKey, model: p.models[0] || 'gpt-4o', baseUrl: p.baseUrl || undefined }
                            setAgentConfigs(prev => ({ ...prev, [agent.key]: newCfg }))
                            await window.api.settings.saveAgentConfig(newCfg)
                          }
                        }} className="input-pill px-2 py-1 text-[10px]">
                          {providers.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                        </select>
                        <label className="w-[30px] text-[9px] text-tri">Model</label>
                        <select value={cfg?.model || currentProvider?.models[0] || ''} onChange={async e => {
                          const newCfg: AgentConfig = { agentKey: agent.key, provider: cfg?.provider || currentProvider?.name || '', apiKey: cfg?.apiKey || currentProvider?.apiKey || '', model: e.target.value, baseUrl: cfg?.baseUrl || currentProvider?.baseUrl || undefined }
                          setAgentConfigs(prev => ({ ...prev, [agent.key]: newCfg }))
                          await window.api.settings.saveAgentConfig(newCfg)
                        }} className="input-pill px-2 py-1 text-[10px]">
                          {(currentProvider?.models || []).map((m, i) => <option key={i}>{m}</option>)}
                        </select>
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <label className="text-[9px] text-tri">{t('settings.driverPrompt')}</label>
                        <span className="rounded bg-canvas px-1.5 py-0.5 text-[9px] text-sub">{agent.promptFile}</span>
                        <button onClick={async () => { await window.api.settings.openPromptFile(agent.promptFile) }} className="btn-ghost px-2 py-0.5 text-[8px]">{t('common.view')}</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={async () => {
                          setAgentTesting(agent.key)
                          try {
                            let llmCfg: LLMConfig
                            if (cfg && cfg.apiKey && cfg.model) {
                              const name = cfg.provider.toLowerCase()
                              const providerType: 'openai' | 'azure' | 'custom' = name === 'openai' ? 'openai' : name === 'azure' ? 'azure' : 'custom'
                              llmCfg = { provider: providerType, apiKey: cfg.apiKey, model: cfg.model, baseUrl: cfg.baseUrl }
                            } else {
                              llmCfg = llmConfig || { provider: 'custom', apiKey: '', model: 'gpt-4o' }
                            }
                            const result = await testConnection(llmCfg)
                            if (!result.success) { alert(result.error || t('settings.connectionFailed')) }
                            else { alert(t('settings.connectionOk')) }
                          } catch (err) { alert((err as Error).message) }
                          finally { setAgentTesting(null) }
                        }} disabled={agentTesting === agent.key} className="btn-soft px-2.5 py-1 text-[9px]">
                          {agentTesting === agent.key ? t('common.testing') : t('settings.testOneRound')}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'general' && (
            <div>
              <h3 className="mb-4 text-[13px] font-bold text-ink">{t('settings.generalTitle')}</h3>
              <div className="max-w-[320px] rounded-card border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                <label className="mb-0.5 block text-[11px] font-semibold text-ink">{t('settings.language')}</label>
                <p className="mb-2 text-[10px] text-tri">{t('settings.languageDesc')}</p>
                <select
                  value={i18n.language === 'zh' ? 'zh' : 'en'}
                  onChange={e => setLanguage(e.target.value as Lang)}
                  className="input-pill w-full px-2.5 py-1.5 text-[11px]">
                  {SUPPORTED_LANGS.map(l => (
                    <option key={l} value={l}>{LANG_LABELS[l]}</option>
                  ))}
                </select>

                <label className="mb-0.5 mt-5 block text-[11px] font-semibold text-ink">{t('settings.theme')}</label>
                <p className="mb-2 text-[10px] text-tri">{t('settings.themeDesc')}</p>
                <select
                  value={theme}
                  onChange={e => { const v = e.target.value as ThemeMode; setThemeState(v); setTheme(v) }}
                  className="input-pill w-full px-2.5 py-1.5 text-[11px]">
                  {THEME_MODES.map(m => (
                    <option key={m} value={m}>{t(`settings.theme_${m}`)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
