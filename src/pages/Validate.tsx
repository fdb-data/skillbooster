import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { generateId } from '../utils/uuid'
import type { ValidationVerdict, ValidationResult, VerdictResult, OverallVerdict, TestCase, EvalCaseExport } from '../contracts/ipc-types'
import PageNav from '../components/PageNav'
import Markdown from '../components/Markdown'
import { ArrowLeft, Close, ChevronDown, ChevronRight } from '../components/Icons'

const MAX_CASES = 10

const RESULT_COLOR: Record<VerdictResult, { bg: string; fg: string }> = {
  win: { bg: '#DCFCE7', fg: '#166534' },
  tie: { bg: '#F1F5F9', fg: '#475569' },
  loss: { bg: '#FEE2E2', fg: '#991B1B' }
}
const VERDICT_COLOR: Record<OverallVerdict, { bg: string; fg: string }> = {
  helpful: { bg: '#DCFCE7', fg: '#166534' },
  no_difference: { bg: '#F1F5F9', fg: '#475569' },
  worse: { bg: '#FEE2E2', fg: '#991B1B' }
}

interface ReportEntry { id: string; instruction: string; result: ValidationResult }

const Validate: React.FC = () => {
  const { t } = useTranslation()
  const currentScene = useSceneStore(s => s.currentScene)
  const setCurrentPage = useSceneStore(s => s.setCurrentPage)
  const sceneId = currentScene?.id

  const [tab, setTab] = useState<'compare' | 'report'>('compare')
  const [subTab, setSubTab] = useState<'single' | 'testset'>('single')

  // 测试集（用例列表本身单独持久化，保留在组件本地）
  const [cases, setCases] = useState<TestCase[]>([])
  const [generating, setGenerating] = useState(false)
  const [editing, setEditing] = useState<{ id: string | null; text: string } | null>(null)

  // 纯视图态：展开/单条输入/已保存标记
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [instruction, setInstruction] = useState('')
  const [savedSingle, setSavedSingle] = useState(false)

  // 验证运行/流/结果状态由 store 持有，切页不丢
  const bareResult = useSceneStore(s => s.valBare)
  const skillResult = useSceneStore(s => s.valSkill)
  const running = useSceneStore(s => s.valRunning)
  const analyzing = useSceneStore(s => s.valAnalyzing)
  const control = useSceneStore(s => s.valControl)
  const caseResults = useSceneStore(s => s.valCaseResults)
  const singleEntry = useSceneStore(s => s.valSingleEntry)
  const runningCaseId = useSceneStore(s => s.valRunningCaseId)
  const runAll = useSceneStore(s => s.valRunAll)
  const valLoadResults = useSceneStore(s => s.valLoadResults)
  const valRunSingle = useSceneStore(s => s.valRunSingle)
  const valRunCase = useSceneStore(s => s.valRunCase)
  const valRunAllCases = useSceneStore(s => s.valRunAllCases)
  const valDeleteCaseResult = useSceneStore(s => s.valDeleteCaseResult)
  const valClearCaseResults = useSceneStore(s => s.valClearCaseResults)

  useEffect(() => {
    if (!sceneId) return
    window.api.validation.listCases(sceneId).then(r => { if (r.success && r.data) setCases(r.data) })
    valLoadResults(sceneId)
  }, [sceneId, valLoadResults])

  // ---------- 测试集 CRUD（整集替换持久化） ----------
  const persist = async (next: TestCase[]): Promise<void> => {
    setCases(next)
    if (sceneId) await window.api.validation.saveCases(sceneId, next)
  }
  const reindex = (arr: TestCase[]): TestCase[] => arr.map((c, i) => ({ ...c, sortOrder: i }))

  const handleGenerate = async (): Promise<void> => {
    if (!sceneId || generating) return
    setGenerating(true)
    try {
      const r = await window.api.validation.generateCases(sceneId)
      if (r.success && r.data) {
        const next = r.data.slice(0, MAX_CASES).map((text, i) => ({ id: generateId(), instruction: text, sortOrder: i }))
        await persist(next)
        if (sceneId) valClearCaseResults(sceneId)
      }
    } finally {
      setGenerating(false)
    }
  }

  const openAdd = (): void => { if (cases.length < MAX_CASES) setEditing({ id: null, text: '' }) }
  const openEdit = (c: TestCase): void => setEditing({ id: c.id, text: c.instruction })
  const closeModal = (): void => setEditing(null)
  const saveModal = (): void => {
    if (!editing) return
    const text = editing.text.trim()
    if (editing.id === null) {
      if (text && cases.length < MAX_CASES) persist(reindex([...cases, { id: generateId(), instruction: text, sortOrder: cases.length }]))
    } else {
      persist(cases.map(c => (c.id === editing.id ? { ...c, instruction: text } : c)))
    }
    setEditing(null)
  }
  const deleteCase = (id: string): void => {
    persist(reindex(cases.filter(c => c.id !== id)))
    if (sceneId) valDeleteCaseResult(sceneId, id)
  }
  const moveCase = (id: string, dir: -1 | 1): void => {
    const idx = cases.findIndex(c => c.id === id)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= cases.length) return
    const next = [...cases]
    ;[next[idx], next[to]] = [next[to], next[idx]]
    persist(reindex(next))
  }

  // ---------- 运行（编排在 store，脱离本组件生命周期，切页不丢） ----------
  const runOneCase = async (c: TestCase): Promise<void> => {
    if (!sceneId || !c.instruction.trim()) return
    await valRunCase(sceneId, c.id, c.instruction.trim())
    setExpanded(prev => ({ ...prev, [c.id]: true })); setTab('report')
  }

  const runAllCases = async (): Promise<void> => {
    if (!sceneId) return
    const valid = cases.filter(c => c.instruction.trim())
    if (valid.length === 0) return
    await valRunAllCases(sceneId, valid.map(c => ({ id: c.id, instruction: c.instruction.trim() })))
    setTab('report')
  }

  const handleRunSingle = async (): Promise<void> => {
    if (!instruction.trim() || !sceneId) return
    setSavedSingle(false)
    await valRunSingle(sceneId, instruction.trim())
    setTab('report')
  }

  const handleSaveSingle = async (): Promise<void> => {
    if (!sceneId || !singleEntry) return
    const v = singleEntry.result.verdict
    const diff = v ? v.summary : (singleEntry.result.diffSummary ?? '')
    const msg = t('validate.recordTemplate', { instruction: singleEntry.instruction, bare: singleEntry.result.bare, skill: singleEntry.result.withSkill, diff })
    await window.api.extraction.runTurn(sceneId, msg)
    setSavedSingle(true)
  }

  // ---------- 报告聚合 ----------
  const reportEntries: ReportEntry[] = useMemo(() => {
    const fromCases = cases.filter(c => caseResults[c.id]).map(c => ({ id: c.id, instruction: c.instruction, result: caseResults[c.id] }))
    return singleEntry ? [singleEntry, ...fromCases] : fromCases
  }, [cases, caseResults, singleEntry])

  const agg = useMemo(() => {
    let win = 0, tie = 0, loss = 0, bareTok = 0, skillTok = 0
    for (const e of reportEntries) {
      const v = e.result.verdict
      if (v) { if (v.verdict === 'helpful') win++; else if (v.verdict === 'worse') loss++; else tie++ }
      bareTok += e.result.bareTokens?.totalTokens ?? 0
      skillTok += e.result.skillTokens?.totalTokens ?? 0
    }
    const verdict: OverallVerdict = win > loss ? 'helpful' : loss > win ? 'worse' : 'no_difference'
    return { win, tie, loss, bareTok, skillTok, count: reportEntries.length, verdict }
  }, [reportEntries])

  const handleExport = async (format: 'json' | 'markdown'): Promise<void> => {
    if (!sceneId || reportEntries.length === 0) return
    const payloadCases: EvalCaseExport[] = reportEntries.map(e => ({ instruction: e.instruction, result: e.result }))
    await window.api.validation.exportResults(sceneId, format, { cases: payloadCases })
  }

  const resultLabel = (r: VerdictResult): string => t(`validate.result.${r}`)
  const verdictLabel = (v: OverallVerdict): string => t(`validate.verdict.${v}`)
  const busy = running || generating || runAll !== null || runningCaseId !== null

  // ---------- 子组件 ----------
  const VerdictView = ({ v }: { v: ValidationVerdict }): React.ReactElement => (
    <div>
      <div className="mb-2 flex items-center gap-2.5 rounded-lg p-2.5" style={{ background: VERDICT_COLOR[v.verdict].bg }}>
        <span className="shrink-0 rounded-md bg-surface px-2.5 py-0.5 text-[11px] font-extrabold" style={{ color: VERDICT_COLOR[v.verdict].fg }}>{verdictLabel(v.verdict)}</span>
        <span className="text-[11px] leading-normal" style={{ color: VERDICT_COLOR[v.verdict].fg }}>{v.summary}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {v.dimensions.map((d, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className="w-16 shrink-0 text-[10px] font-bold text-ink">{d.dimension}</span>
            <span className="shrink-0 rounded-full px-2 py-px text-[9px] font-bold" style={{ color: RESULT_COLOR[d.result].fg, background: RESULT_COLOR[d.result].bg }}>{resultLabel(d.result)}</span>
            <span className="text-[10px] leading-normal text-sub">{d.evidence}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const ABPane = ({ title, accent, text }: { title: string; accent: boolean; text: string }): React.ReactElement => (
    <div className={`flex min-w-0 flex-1 flex-col rounded-card border ${accent ? 'border-accent-edge bg-accent-soft' : 'border-line bg-surface'}`}>
      <div className={`border-b border-line px-3 py-2 text-[10px] font-bold ${accent ? 'text-accent' : 'text-sub'}`}>{title}</div>
      <div className="flex-1 overflow-auto p-3">
        {text
          ? <div className="text-[11px] leading-relaxed text-ink"><Markdown text={text} />{running && <span className="text-accent">▍</span>}</div>
          : running
            ? <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} className="mb-1.5 h-2.5 rounded bg-canvas" style={{ animation: 'pulse 1.5s ease-in-out infinite' }} />)}</div>
            : <p className="text-[11px] text-tri">{t('validate.waitingRun')}</p>}
      </div>
    </div>
  )

  const ABStatic = ({ bare, withSkill }: { bare: string; withSkill: string }): React.ReactElement => (
    <div className="flex gap-3">
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-2.5">
        <div className="mb-1.5 text-[9px] font-bold text-sub">{t('validate.colA')}</div>
        <div className="text-[11px] leading-relaxed text-ink"><Markdown text={bare} /></div>
      </div>
      <div className="min-w-0 flex-1 rounded-lg border border-accent-edge bg-accent-soft p-2.5">
        <div className="mb-1.5 text-[9px] font-bold text-accent">{t('validate.colB')}</div>
        <div className="text-[11px] leading-relaxed text-ink"><Markdown text={withSkill} /></div>
      </div>
    </div>
  )

  const TabButton = ({ id, label }: { id: 'compare' | 'report'; label: string }): React.ReactElement => (
    <button onClick={() => setTab(id)}
      className={`mr-5 cursor-pointer border-b-2 px-1 py-2 text-xs ${tab === id ? 'border-accent font-bold text-accent' : 'border-transparent font-medium text-sub hover:text-ink'}`}>{label}</button>
  )

  const SubTabButton = ({ id, label }: { id: 'single' | 'testset'; label: string }): React.ReactElement => (
    <button onClick={() => setSubTab(id)}
      className={`cursor-pointer rounded-2xl border px-3.5 py-1.5 text-[11px] ${subTab === id ? 'border-accent bg-accent-soft font-bold text-accent' : 'border-line bg-surface font-medium text-sub hover:border-accent-edge'}`}>{label}</button>
  )

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* 统一主头部：返回图标 + 场景名 + 居中导航（grid 三栏稳健居中） */}
      <div className="grid h-14 shrink-0 grid-cols-3 items-center border-b border-line bg-surface px-4">
        <div className="flex items-center gap-2 justify-self-start">
          <button onClick={() => setCurrentPage('workbench')} className="flex cursor-pointer items-center text-ink hover:text-accent"><ArrowLeft size={16} /></button>
          <span className="text-[13px] font-bold text-ink">{currentScene?.name}</span>
        </div>
        <div className="justify-self-center">
          <PageNav current="validate" />
        </div>
        <div />
      </div>

      {/* 第二行：验证标题 + 内部 tab（对比/报告） */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-7">
        <span className="mr-4 text-xs font-bold text-ink">{t('validate.title')}</span>
        <TabButton id="compare" label={t('validate.tabCompare')} />
        <TabButton id="report" label={t('validate.tabReport')} />
      </div>

      {tab === 'compare' ? (
        <div className="flex min-h-0 flex-1 flex-col px-7 pt-3.5">
          {/* 受控条件 */}
          <div className="shrink-0 rounded-lg bg-canvas px-3 py-2 text-[10px] text-sub">
            <span className="font-bold text-ink">{t('validate.controlLabel')}</span>{' '}
            {control ? t('validate.controlBar', { model: control.model, temp: control.temperature }) : t('validate.controlBarPending')}
          </div>

          {/* A/B 两栏实时输出 */}
          <div className="flex min-h-0 flex-1 gap-3 py-3">
            <ABPane title={t('validate.colA')} accent={false} text={bareResult} />
            <ABPane title={t('validate.colB')} accent text={skillResult} />
          </div>
          {analyzing && (
            <div className="mb-2 flex shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-[10px]" style={{ background: '#EFF6FF', color: '#1E40AF' }}>
              <span style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>●</span> {t('validate.analyzing')}
            </div>
          )}

          {/* 底部输入区：子 tab */}
          <div className="shrink-0 border-t border-line py-3">
            <div className="mb-2.5 flex gap-2">
              <SubTabButton id="single" label={t('validate.subSingle')} />
              <SubTabButton id="testset" label={t('validate.subTestset')} />
            </div>

            {subTab === 'single' ? (
              <div className="flex items-stretch gap-2.5">
                <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
                  placeholder={t('validate.inputPlaceholder')} disabled={running}
                  rows={3}
                  className="flex-1 resize-y rounded-card border border-line px-3 py-2.5 font-[inherit] text-xs leading-normal outline-none focus:border-accent" />
                <button onClick={handleRunSingle} disabled={running || !instruction.trim()} className="btn-primary shrink-0 px-5 text-xs">
                  {running ? t('validate.running') : t('validate.runCompare')}
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <button onClick={handleGenerate} disabled={busy} className="btn-primary px-3.5 py-1.5 text-[11px]">
                    {generating ? t('validate.testset.generating') : t('validate.testset.generate')}
                  </button>
                  <button onClick={openAdd} disabled={busy || cases.length >= MAX_CASES} className="btn-soft px-3 py-1.5 text-[11px]">{t('validate.testset.add')}</button>
                  <span className="text-[10px] text-tri">{t('validate.testset.counter', { count: cases.length, max: MAX_CASES })}</span>
                  <span className="flex-1" />
                  <button onClick={runAllCases} disabled={busy || cases.filter(c => c.instruction.trim()).length === 0} className="btn-primary px-3.5 py-1.5 text-[11px]">
                    {runAll ? t('validate.testset.running', { done: runAll.done, total: runAll.total }) : t('validate.testset.runAll')}
                  </button>
                </div>

                {cases.length === 0 ? (
                  <p className="py-1 text-[11px] leading-relaxed text-tri">{t('validate.testset.empty')}</p>
                ) : (
                  <div className="flex max-h-[180px] flex-col gap-1.5 overflow-auto">
                    {cases.map((c, idx) => {
                      const r = caseResults[c.id]
                      const isRunning = runningCaseId === c.id
                      return (
                        <div key={c.id} className={`flex items-center gap-1.5 rounded-lg border border-line px-2 py-1.5 ${isRunning ? 'bg-accent-soft' : 'bg-surface'}`}>
                          <span className="w-3.5 shrink-0 text-[10px] text-tri">{idx + 1}</span>
                          <button onClick={() => openEdit(c)} title={t('validate.testset.edit')} className={`min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-none bg-none text-left text-[11px] ${c.instruction ? 'text-ink' : 'text-tri'}`}>
                            {c.instruction || t('validate.testset.modalPlaceholder')}
                          </button>
                          {r?.verdict && <span className="shrink-0 rounded-full px-2 py-px text-[9px] font-bold" style={{ color: VERDICT_COLOR[r.verdict.verdict].fg, background: VERDICT_COLOR[r.verdict.verdict].bg }}>{verdictLabel(r.verdict.verdict)}</span>}
                          <button onClick={() => moveCase(c.id, -1)} disabled={idx === 0 || busy} title="↑" className="shrink-0 cursor-pointer border-none bg-none text-[11px] text-tri hover:text-sub">↑</button>
                          <button onClick={() => moveCase(c.id, 1)} disabled={idx === cases.length - 1 || busy} title="↓" className="shrink-0 cursor-pointer border-none bg-none text-[11px] text-tri hover:text-sub">↓</button>
                          <button onClick={() => runOneCase(c)} disabled={busy || !c.instruction.trim()} className="btn-soft shrink-0 px-2.5 py-0.5 text-[9px]">
                            {isRunning ? t('validate.running') : (r ? t('validate.testset.rerun') : t('validate.testset.run'))}
                          </button>
                          <button onClick={() => deleteCase(c.id)} disabled={busy} title={t('validate.testset.delete')} className="flex shrink-0 cursor-pointer items-center border-none bg-none text-tri hover:text-sub"><Close size={12} /></button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ===== 验证报告 tab ===== */
        <div className="flex-1 overflow-auto px-7 py-4">
          {/* 汇总结果 */}
          <div className="mb-3.5 rounded-card border border-line bg-canvas p-3.5">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-extrabold text-ink">{t('validate.report.summaryTitle')}</span>
              <div className="flex gap-1.5">
                <button onClick={() => handleExport('json')} disabled={agg.count === 0} className="btn-soft px-3 py-1 text-[9px]">{t('validate.export.json')}</button>
                <button onClick={() => handleExport('markdown')} disabled={agg.count === 0} className="btn-soft px-3 py-1 text-[9px]">{t('validate.export.markdown')}</button>
              </div>
            </div>
            {agg.count > 0 ? (
              <>
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="rounded-md px-3 py-0.5 text-xs font-extrabold" style={{ color: VERDICT_COLOR[agg.verdict].fg, background: VERDICT_COLOR[agg.verdict].bg }}>{verdictLabel(agg.verdict)}</span>
                  <span className="text-xs font-bold text-ink">{t('validate.summary.winRate', { win: agg.win, tie: agg.tie, loss: agg.loss })}</span>
                </div>
                <div className="text-[10px] text-sub">
                  {t('validate.numbers.tokens', { bare: agg.bareTok, skill: agg.skillTok })}{' · '}
                  {t('validate.numbers.tokenDiff', { diff: agg.skillTok - agg.bareTok })}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-tri">{t('validate.summary.noResults')}</p>
            )}
          </div>

          {/* 逐条结果 */}
          <div className="mb-2 text-xs font-extrabold text-ink">{t('validate.report.detailTitle')}</div>
          {reportEntries.length === 0 ? (
            <p className="text-[11px] leading-relaxed text-tri">{t('validate.report.empty')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {reportEntries.map(e => {
                const open = expanded[e.id]
                const v = e.result.verdict
                return (
                  <div key={e.id} className="rounded-card border border-line">
                    <button onClick={() => setExpanded(prev => ({ ...prev, [e.id]: !open }))} className="flex w-full cursor-pointer items-center gap-2 border-none bg-none px-3 py-2.5 text-left">
                      <span className="flex items-center text-tri">{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink">{e.instruction}</span>
                      {v && <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-bold" style={{ color: VERDICT_COLOR[v.verdict].fg, background: VERDICT_COLOR[v.verdict].bg }}>{verdictLabel(v.verdict)}</span>}
                    </button>
                    {open && (
                      <div className="px-3 pb-3">
                        {v ? <VerdictView v={v} /> : e.result.diffSummary ? <div className="whitespace-pre-wrap text-[10px] text-sub">{e.result.diffSummary}</div> : null}
                        <div className="mt-2.5"><ABStatic bare={e.result.bare} withSkill={e.result.withSkill} /></div>
                        {(e.result.bareTokens || e.result.skillTokens) && (
                          <div className="mt-1.5 text-[9px] text-tri">
                            {t('validate.numbers.tokens', { bare: e.result.bareTokens?.totalTokens ?? 0, skill: e.result.skillTokens?.totalTokens ?? 0 })}
                            {e.result.bareLatencyMs != null && e.result.skillLatencyMs != null && ` · ${t('validate.numbers.latency', { a: e.result.bareLatencyMs, b: e.result.skillLatencyMs })}`}
                          </div>
                        )}
                        {e.id === 'single' && (
                          <div className="mt-2">
                            <button onClick={handleSaveSingle} disabled={savedSingle} className="btn-soft px-3 py-1 text-[9px]">{savedSingle ? t('validate.saved') : t('validate.save')}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* 编辑测试指令弹窗 */}
      {editing && (
        <div onClick={closeModal} className="fixed inset-0 z-50 flex items-center justify-center bg-black/35">
          <div onClick={ev => ev.stopPropagation()} className="w-[560px] max-w-[90vw] rounded-xl bg-surface p-[18px] shadow-[0_10px_40px_rgba(0,0,0,0.2)]">
            <div className="mb-3 text-[13px] font-bold text-ink">{t('validate.testset.editTitle')}</div>
            <textarea value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
              placeholder={t('validate.testset.modalPlaceholder')} autoFocus rows={7}
              className="box-border w-full resize-y rounded-card border border-line px-3 py-2.5 font-[inherit] text-xs leading-normal outline-none focus:border-accent" />
            <div className="mt-3.5 flex justify-end gap-2">
              <button onClick={closeModal} className="btn-soft px-4 py-1.5 text-[11px]">{t('validate.testset.cancel')}</button>
              <button onClick={saveModal} disabled={!editing.text.trim()} className="btn-primary px-4 py-1.5 text-[11px]">{t('validate.testset.saveCase')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Validate
