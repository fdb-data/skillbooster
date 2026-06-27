import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { SecurityFinding, SecurityCategory, SecuritySeverity } from '../contracts/ipc-types'
import { useSceneStore } from '../store/sceneStore'
import { Close, Shield, Download, Refresh, Eraser, Play } from './Icons'

const SEV_ORDER: Record<SecuritySeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const SEV_COLOR: Record<SecuritySeverity, string> = {
  critical: 'bg-red-100 text-red-700 border-red-300',
  high: 'bg-orange-100 text-orange-700 border-orange-300',
  medium: 'bg-amber-100 text-amber-700 border-amber-300',
  low: 'bg-sky-100 text-sky-700 border-sky-300'
}

const CAT_KEY: Record<SecurityCategory, string> = {
  poisoning: 'workbench.securityCatPoisoning',
  suspiciousLink: 'workbench.securityCatSuspiciousLink',
  suspiciousScript: 'workbench.securityCatSuspiciousScript',
  sensitiveData: 'workbench.securityCatSensitiveData',
  abnormalContent: 'workbench.securityCatAbnormalContent',
  attachmentIssue: 'workbench.securityCatAttachmentIssue'
}

const SEV_KEY: Record<SecuritySeverity, string> = {
  critical: 'workbench.securitySevCritical',
  high: 'workbench.securitySevHigh',
  medium: 'workbench.securitySevMedium',
  low: 'workbench.securitySevLow'
}

function locationLabel(f: SecurityFinding): string {
  const loc = f.location
  if (!loc) return ''
  const parts: string[] = []
  if (loc.entryId) parts.push(loc.entryType ? `${loc.entryType}#${loc.entryId.slice(0, 8)}` : loc.entryId.slice(0, 8))
  if (loc.referenceId) parts.push(`ref#${loc.referenceId.slice(0, 8)}`)
  if (loc.attachmentId) parts.push(`file#${loc.attachmentId.slice(0, 8)}`)
  if (loc.field) parts.push(loc.field)
  return parts.join(' · ')
}

const SecurityCheckPanel: React.FC<{
  sceneId: string
  onStart: () => void
  onRerun: () => void
  onRemediate: (findings: SecurityFinding[]) => Promise<void>
  onClose: () => void
}> = ({ sceneId, onStart, onRerun, onRemediate, onClose }) => {
  const { t } = useTranslation()
  const result = useSceneStore(s => s.securityResult)
  const progress = useSceneStore(s => s.securityProgress)
  const phase = useSceneStore(s => s.securityPhase)
  const runId = useSceneStore(s => s.securityRunId)
  const setHighlightedEntries = useSceneStore(s => s.setHighlightedEntries)
  const [exporting, setExporting] = useState(false)
  const [exportMsg, setExportMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [refDialog, setRefDialog] = useState<SecurityFinding | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const running = phase === 'running'
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [progress])

  const loadSecurityResult = useSceneStore(s => s.loadSecurityResult)
  useEffect(() => { if (phase === 'idle' && !result) { void loadSecurityResult(sceneId) } }, [sceneId])

  const sorted = result && Array.isArray(result.findings) ? [...result.findings].sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.category.localeCompare(b.category)) : []
  const counts = { critical: 0, high: 0, medium: 0, low: 0 }
  if (result && Array.isArray(result.findings)) for (const f of result.findings) counts[f.severity]++

  const remediable = (f: SecurityFinding): boolean => !!f.location?.entryId || !!f.location?.referenceId
  const selectedFindings = sorted.filter(f => selected.has(f.id))
  const allRemediableSelected = sorted.filter(remediable).every(f => selected.has(f.id)) && sorted.some(remediable)

  const toggle = (id: string): void => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const toggleAllRemediable = (): void => {
    setSelected(allRemediableSelected ? new Set() : new Set(sorted.filter(remediable).map(f => f.id)))
  }

  const locate = (f: SecurityFinding): void => {
    if (!f.location?.entryId) return
    setHighlightedEntries([f.location.entryId])
    onClose()
  }
  const remediateOne = async (f: SecurityFinding): Promise<void> => {
    if (f.location?.referenceId) {
      setRefDialog(f)
      return
    }
    await onRemediate([f])
  }
  const remediateRefFix = async (): Promise<void> => {
    if (!refDialog?.location?.referenceId) return
    const refId = refDialog.location.referenceId
    setRefDialog(null)
    try {
      await window.api.references.fixText(sceneId, refId)
      removeFindingsFromResult([refDialog.id])
    } catch (e) { console.error('[security] fix ref failed:', e) }
  }
  const remediateRefDelete = async (): Promise<void> => {
    if (!refDialog?.location?.referenceId) return
    const refId = refDialog.location.referenceId
    const fid = refDialog.id
    setRefDialog(null)
    try {
      await window.api.references.remove(sceneId, refId)
      removeFindingsFromResult([fid])
    } catch (e) { console.error('[security] delete ref failed:', e) }
  }
  const removeFindingsFromResult = (ids: string[]): void => {
    const idSet = new Set(ids)
    useSceneStore.setState(s => {
      if (!s.securityResult) return s
      const remaining = s.securityResult.findings.filter(f => !idSet.has(f.id))
      const updated = {
        ...s.securityResult,
        findings: remaining,
        passed: !remaining.some(f => f.severity === 'critical' || f.severity === 'high')
      }
      try { void window.api.security.saveResults(s.currentScene?.id ?? '', updated) } catch { /* ignore */ }
      return { securityResult: updated }
    })
  }
  const remediateBatch = async (): Promise<void> => {
    const fs = selectedFindings.filter(remediable)
    if (fs.length === 0) return
    setSelected(new Set())
    await onRemediate(fs)
  }
  const abort = async (): Promise<void> => {
    if (runId) await window.api.agent.abort(runId)
  }
  const exportReport = async (): Promise<void> => {
    if (!result) return
    setExporting(true); setExportMsg(null)
    try {
      const res = await window.api.export.exportSecurityReport(sceneId, result)
      if (res.success && res.data) setExportMsg(t('workbench.securityReportExported', { path: res.data.filePath }))
      else setExportMsg(t('workbench.errorPrefix', { message: res.error?.message || t('workbench.exportFailed') }))
    } catch (err) {
      setExportMsg(t('workbench.errorPrefix', { message: (err as Error).message }))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <Shield size={16} className={result ? (result.passed ? 'text-emerald-600' : 'text-red-600') : 'text-tri'} />
            <span className="text-[14px] font-bold text-ink">{t('workbench.securityCheck')}</span>
            {result && !running && (
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${result.passed ? 'border-emerald-300 bg-emerald-100 text-emerald-700' : 'border-red-300 bg-red-100 text-red-700'}`}>
                {result.passed ? 'PASS' : 'RISK'}
              </span>
            )}
          </div>
          <button onClick={onClose} className="flex cursor-pointer items-center text-tri hover:text-sub"><Close size={16} /></button>
        </div>

        {running && (
          <div className="shrink-0 border-b border-line bg-canvas">
            <div className="h-1 w-full overflow-hidden bg-line">
              <div className="h-full w-1/3 animate-[security-bar_1.2s_ease-in-out_infinite] bg-accent" />
            </div>
            <div ref={logRef} className="max-h-[180px] overflow-auto px-5 py-2 font-mono text-[12px] leading-relaxed whitespace-pre-wrap text-sub">
              {progress || t('workbench.securityStarting')}
            </div>
            <div className="flex justify-end px-5 pb-2">
              <button onClick={abort} className="cursor-pointer rounded-full border border-line px-3 py-0.5 text-[11px] text-tri hover:bg-surface">
                {t('workbench.securityAbort')}
              </button>
            </div>
          </div>
        )}

        {!running && result && Array.isArray(result.findings) && (
          <div className="shrink-0 border-b border-line bg-canvas px-5 py-2 text-[12px] text-sub">
            {result.findings.length === 0
              ? (result.passed ? t('workbench.securityPassed') : t('workbench.securityClean'))
              : t('workbench.securityFailed', { count: result.findings.length, critical: counts.critical, high: counts.high, medium: counts.medium, low: counts.low })}
            <span className="ml-2 text-tri">
              {t('workbench.securityStats', {
                scanned: result.stats.contentsScanned,
                rules: result.stats.rulesChecked,
                llm: result.stats.llmReviewed ? t('workbench.securityLlmOn') : t('workbench.securityLlmOff')
              })}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-auto px-5 py-3">
          {running ? null : !result ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16">
              <Shield size={40} className="text-tri" />
              <p className="text-[13px] text-sub">{t('workbench.securityIdleHint')}</p>
              <button onClick={onStart} className="btn-primary flex items-center gap-2 px-5 py-2 text-[13px]">
                <Play size={14} />
                {t('workbench.securityStart')}
              </button>
            </div>
          ) : sorted.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-tri">{t('workbench.securityNoFindings')}</p>
          ) : (
            <>
              {sorted.some(remediable) && (
                <label className="mb-2 flex cursor-pointer items-center gap-2 text-[12px] text-sub">
                  <input type="checkbox" checked={allRemediableSelected} onChange={toggleAllRemediable} className="cursor-pointer" />
                  {t('workbench.securitySelectAllRemediable')}
                </label>
              )}
              <ul className="flex flex-col gap-2.5">
                {sorted.map(f => {
                  const canRemediate = remediable(f)
                  const checked = selected.has(f.id)
                  return (
                    <li key={f.id} className="rounded-card border border-line bg-canvas p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {canRemediate && (
                          <input type="checkbox" checked={checked} onChange={() => toggle(f.id)} className="cursor-pointer" />
                        )}
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${SEV_COLOR[f.severity]}`}>{t(SEV_KEY[f.severity])}</span>
                        <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-sub">{t(CAT_KEY[f.category])}</span>
                        <span className="rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-tri">{f.source === 'llm' ? t('workbench.securitySourceLlm') : t('workbench.securitySourceRule')}</span>
                        <span className="text-[13px] font-semibold text-ink">{f.title}</span>
                        <div className="ml-auto flex items-center gap-1.5">
                          {canRemediate && (
                            <button
                              onClick={() => remediateOne(f)}
                              className="flex cursor-pointer items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100"
                            >
                              <Eraser size={11} />
                              {t('workbench.securityRemediate')}
                            </button>
                          )}
                          {f.location?.entryId && (
                            <button
                              onClick={() => locate(f)}
                              className="cursor-pointer rounded border border-accent-edge bg-accent-soft px-2 py-0.5 text-[11px] text-accent hover:bg-accent hover:text-white"
                            >
                              {t('workbench.securityLocate')}
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-sub">{f.detail}</p>
                      {locationLabel(f) && (
                        <p className="mt-1 text-[11px] text-tri"><span className="font-medium">{t('workbench.securityLocation')}:</span> {locationLabel(f)}</p>
                      )}
                      {f.evidence && (
                        <p className="mt-1 text-[11px] text-tri"><span className="font-medium">{t('workbench.securityEvidence')}:</span> <code className="rounded bg-surface px-1 py-0.5">{f.evidence}</code></p>
                      )}
                      {f.suggestion && (
                        <p className="mt-1 text-[11px] text-emerald-700"><span className="font-medium">{t('workbench.securitySuggestion')}:</span> {f.suggestion}</p>
                      )}
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        {!running && result && Array.isArray(result.findings) && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-canvas px-5 py-2.5">
            <span className="flex-1 truncate text-[11px] text-sub">{exportMsg}</span>
            <div className="flex items-center gap-2">
              {selectedFindings.some(remediable) && (
                <button
                  onClick={remediateBatch}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-700 hover:bg-emerald-100"
                >
                  <Eraser size={13} />
                  {t('workbench.securityRemediateBatch', { count: selectedFindings.filter(remediable).length })}
                </button>
              )}
              <button
                onClick={exportReport}
                disabled={exporting}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-ink hover:bg-canvas disabled:opacity-50"
              >
                <Download size={13} />
                {exporting ? t('workbench.securityExporting') : t('workbench.securityExportReport')}
              </button>
              <button
                onClick={onRerun}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-ink hover:bg-canvas"
              >
                <Refresh size={13} />
                {t('workbench.securityRerun')}
              </button>
              <button
                onClick={onClose}
                className="cursor-pointer rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] text-sub hover:bg-canvas"
              >
                {t('workbench.securityClose')}
              </button>
            </div>
          </div>
        )}
      </div>

      {refDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setRefDialog(null)}>
          <div className="w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <Shield size={16} className="text-amber-600" />
              <span className="text-[14px] font-bold text-ink">参考文档风险处理</span>
            </div>
            <p className="mb-1 text-[13px] text-sub">
              风险：<span className="font-medium">{refDialog.title}</span>
            </p>
            <p className="mb-4 text-[12px] text-tri">
              位于参考文档 <code className="rounded bg-canvas px-1 py-0.5">{refDialog.location?.referenceId?.slice(0, 8)}</code>。请选择处理方式：
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setRefDialog(null)} className="cursor-pointer rounded-md border border-line bg-canvas px-3 py-1.5 text-[12px] text-sub hover:bg-surface">
                取消
              </button>
              <button onClick={remediateRefDelete} className="cursor-pointer rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-[12px] text-red-700 hover:bg-red-100">
                删除文档
              </button>
              <button onClick={remediateRefFix} className="flex cursor-pointer items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-700 hover:bg-emerald-100">
                <Eraser size={12} />
                修改内容
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SecurityCheckPanel
