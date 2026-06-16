import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { ArrowLeft } from '../components/Icons'
import { setLanguage, SUPPORTED_LANGS, LANG_LABELS } from '../i18n'
import type { Lang } from '../i18n'
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

  useEffect(() => { loadLLMConfig(); loadLLMProviders() }, [loadLLMConfig, loadLLMProviders])

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
      const success = await testConnection(config)
      setTestResult({ success, error: success ? undefined : 'Connection failed' })
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
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 28px', height: 56, borderBottom: '1px solid var(--line)' }}>
        <button onClick={() => setCurrentPage('home')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--ink)' }}><ArrowLeft size={16} /></button>
        <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 8 }}>{t('settings.title')}</span>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{ width: 180, borderRight: '1px solid var(--line)', padding: '16px 12px', flexShrink: 0 }}>
          {(['general', 'llm', 'agents'] as SettingsTab[]).map(tabKey => (
            <button key={tabKey} onClick={() => setTab(tabKey)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px',
                border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                background: tab === tabKey ? 'var(--accent-soft)' : 'transparent',
                color: tab === tabKey ? 'var(--accent)' : 'var(--sub)', fontWeight: tab === tabKey ? 600 : 400,
                marginBottom: 2
              }}>
              {{ llm: t('settings.tabLlm'), agents: t('settings.tabAgents'), general: t('settings.tabGeneral') }[tabKey]}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, padding: 24, overflow: 'auto' }}>
          {tab === 'llm' && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t('settings.providerList')}</h3>
              {providers.map((p, i) => (
                <div key={p.id} onClick={() => setSelectedProvider(i)}
                  style={{
                    padding: '8px 12px', borderRadius: 8, marginBottom: 4, cursor: 'pointer',
                    background: i === selectedProvider ? 'var(--accent-soft)' : '#fff',
                    border: i === selectedProvider ? '1px solid var(--accent-edge)' : '1px solid var(--line)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)' }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: 'var(--tri)', marginLeft: 8 }}>{t('settings.modelsCount', { count: p.models.length })}</span>
                  </div>
                  <span style={{
                    fontSize: 9, padding: '1px 6px', borderRadius: 4,
                    background: p.status === 'ok' ? '#dcfce7' : p.status === 'fail' ? '#fee2e2' : 'var(--canvas)',
                    color: p.status === 'ok' ? '#16a34a' : p.status === 'fail' ? '#dc2626' : 'var(--tri)'
                  }}>
                    {p.status === 'ok' ? t('common.connected') : p.status === 'fail' ? t('common.failed') : t('common.unknown')}
                  </span>
                </div>
              ))}
              <button onClick={handleAddProvider} className="btn-ghost" style={{ padding: '6px 12px', fontSize: 10, marginTop: 4 }}>{t('settings.addProvider')}</button>

              {providers.length > 0 && (
                <div style={{ marginTop: 20, padding: 16, border: '1px solid var(--line)', borderRadius: 10 }}>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--sub)', marginBottom: 3 }}>{t('settings.name')}</label>
                    <input value={providers[selectedProvider]?.name || ''} onChange={e => handleProviderChange('name', e.target.value)}
                      className="input-pill" style={{ width: '100%', fontSize: 11 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--sub)', marginBottom: 3 }}>Base URL</label>
                    <input value={providers[selectedProvider]?.baseUrl || ''} onChange={e => handleProviderChange('baseUrl', e.target.value)}
                      placeholder="https://api.example.com/v1" className="input-pill" style={{ width: '100%', fontSize: 11 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--sub)', marginBottom: 3 }}>API Key</label>
                    <input type="password" value={providers[selectedProvider]?.apiKey || ''} onChange={e => handleProviderChange('apiKey', e.target.value)}
                      className="input-pill" style={{ width: '100%', fontSize: 11 }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--sub)', marginBottom: 3 }}>{t('settings.modelList')}</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {(providers[selectedProvider]?.models || []).map((m, j) => (
                        <span key={j} style={{
                          padding: '2px 8px', borderRadius: 4, fontSize: 9,
                          background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 4
                        }}>
                          <input value={m} onChange={e => handleModelChange(j, e.target.value)}
                            style={{ border: 'none', background: 'transparent', fontSize: 9, color: 'var(--accent)', width: 80, outline: 'none' }} />
                          <button onClick={() => handleRemoveModel(j)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tri)', fontSize: 10 }}>×</button>
                        </span>
                      ))}
                      <button onClick={handleAddModel} className="btn-ghost" style={{ padding: '2px 6px', fontSize: 8 }}>+</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={handleSave} className="btn-primary" style={{ padding: '6px 16px', fontSize: 10 }}>{t('common.save')}</button>
                    <button onClick={handleTest} disabled={testing} className="btn-ghost" style={{ padding: '6px 16px', fontSize: 10 }}>
                      {testing ? t('common.testing') : t('settings.testConnection')}
                    </button>
                  </div>
                  {testResult && (
                    <div style={{
                      marginTop: 8, padding: 8, borderRadius: 6, fontSize: 10,
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
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t('settings.agentTitle')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {agentCards.map(agent => {
                  const cfg = agentConfigs[agent.key]
                  const selectedProviderIdx = cfg ? providers.findIndex(p => p.name.toLowerCase().includes(cfg.provider.toLowerCase())) : 0
                  const currentProvider = providers[selectedProviderIdx] || providers[0]
                  return (
                    <div key={agent.key} style={{ padding: 16, border: '1px solid var(--line)', borderRadius: 10 }}>
                      <h4 style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>{agent.label}</h4>
                      <p style={{ fontSize: 10, color: 'var(--sub)', marginBottom: 8 }}>{agent.desc}</p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: 9, color: 'var(--tri)', width: 40 }}>Provider</label>
                        <select value={selectedProviderIdx} onChange={async e => {
                          const idx = Number(e.target.value)
                          const p = providers[idx]
                          if (p) {
                            const newCfg: AgentConfig = { agentKey: agent.key, provider: p.name, apiKey: p.apiKey, model: p.models[0] || 'gpt-4o', baseUrl: p.baseUrl || undefined }
                            setAgentConfigs(prev => ({ ...prev, [agent.key]: newCfg }))
                            await window.api.settings.saveAgentConfig(newCfg)
                          }
                        }} className="input-pill" style={{ fontSize: 10, padding: '4px 8px' }}>
                          {providers.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
                        </select>
                        <label style={{ fontSize: 9, color: 'var(--tri)', width: 30 }}>Model</label>
                        <select value={cfg?.model || currentProvider?.models[0] || ''} onChange={async e => {
                          const newCfg: AgentConfig = { agentKey: agent.key, provider: cfg?.provider || currentProvider?.name || '', apiKey: cfg?.apiKey || currentProvider?.apiKey || '', model: e.target.value, baseUrl: cfg?.baseUrl || currentProvider?.baseUrl || undefined }
                          setAgentConfigs(prev => ({ ...prev, [agent.key]: newCfg }))
                          await window.api.settings.saveAgentConfig(newCfg)
                        }} className="input-pill" style={{ fontSize: 10, padding: '4px 8px' }}>
                          {(currentProvider?.models || []).map((m, i) => <option key={i}>{m}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                        <label style={{ fontSize: 9, color: 'var(--tri)' }}>{t('settings.driverPrompt')}</label>
                        <span style={{ fontSize: 9, padding: '2px 6px', background: 'var(--canvas)', borderRadius: 4, color: 'var(--sub)' }}>{agent.promptFile}</span>
                        <button onClick={async () => { await window.api.settings.openPromptFile(agent.promptFile) }} className="btn-ghost" style={{ padding: '2px 8px', fontSize: 8 }}>{t('common.view')}</button>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                            if (!result) { alert(t('settings.connectionFailed')) }
                            else { alert(t('settings.connectionOk')) }
                          } catch (err) { alert((err as Error).message) }
                          finally { setAgentTesting(null) }
                        }} disabled={agentTesting === agent.key} className="btn-soft" style={{ padding: '4px 10px', fontSize: 9 }}>
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
              <h3 style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>{t('settings.generalTitle')}</h3>
              <div style={{ maxWidth: 320 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{t('settings.language')}</label>
                <p style={{ fontSize: 10, color: 'var(--tri)', margin: '0 0 6px' }}>{t('settings.languageDesc')}</p>
                <select
                  value={i18n.language === 'zh' ? 'zh' : 'en'}
                  onChange={e => setLanguage(e.target.value as Lang)}
                  className="input-pill" style={{ fontSize: 11, padding: '6px 10px' }}>
                  {SUPPORTED_LANGS.map(l => (
                    <option key={l} value={l}>{LANG_LABELS[l]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Settings
