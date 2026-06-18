import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSceneStore } from '../store/sceneStore'
import { generateId } from '../utils/uuid'
import type { ValidationVerdict, ValidationResult, VerdictResult, OverallVerdict, TestCase, EvalCaseExport } from '../contracts/ipc-types'
import PageNav from '../components/PageNav'
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 10, background: VERDICT_COLOR[v.verdict].bg, borderRadius: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: VERDICT_COLOR[v.verdict].fg, padding: '2px 10px', background: '#fff', borderRadius: 6, flexShrink: 0 }}>{verdictLabel(v.verdict)}</span>
        <span style={{ fontSize: 11, color: VERDICT_COLOR[v.verdict].fg, lineHeight: 1.5 }}>{v.summary}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {v.dimensions.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span style={{ flexShrink: 0, width: 64, fontSize: 10, fontWeight: 700, color: 'var(--ink)' }}>{d.dimension}</span>
            <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: RESULT_COLOR[d.result].fg, background: RESULT_COLOR[d.result].bg, padding: '1px 8px', borderRadius: 10 }}>{resultLabel(d.result)}</span>
            <span style={{ fontSize: 10, color: 'var(--sub)', lineHeight: 1.5 }}>{d.evidence}</span>
          </div>
        ))}
      </div>
    </div>
  )

  const ABPane = ({ title, accent, text }: { title: string; accent: boolean; text: string }): React.ReactElement => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, border: `1px solid ${accent ? 'var(--accent-edge)' : 'var(--line)'}`, borderRadius: 10, background: accent ? 'var(--accent-soft)' : '#fff' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: accent ? 'var(--accent)' : 'var(--sub)', padding: '8px 12px', borderBottom: '1px solid var(--line)' }}>{title}</div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {text
          ? <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{text}{running && <span style={{ color: 'var(--accent)' }}>▍</span>}</p>
          : running
            ? <div>{Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ height: 10, borderRadius: 4, background: 'var(--canvas)', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />)}</div>
            : <p style={{ fontSize: 11, color: 'var(--tri)', margin: 0 }}>{t('validate.waitingRun')}</p>}
      </div>
    </div>
  )

  const ABStatic = ({ bare, withSkill }: { bare: string; withSkill: string }): React.ReactElement => (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: '#fff' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--sub)', marginBottom: 6 }}>{t('validate.colA')}</div>
        <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{bare}</p>
      </div>
      <div style={{ flex: 1, minWidth: 0, border: '1px solid var(--accent-edge)', borderRadius: 8, padding: 10, background: 'var(--accent-soft)' }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{t('validate.colB')}</div>
        <p style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{withSkill}</p>
      </div>
    </div>
  )

  const TabButton = ({ id, label }: { id: 'compare' | 'report'; label: string }): React.ReactElement => (
    <button onClick={() => setTab(id)} style={{
      background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '8px 4px', marginRight: 20,
      fontWeight: tab === id ? 700 : 500, color: tab === id ? 'var(--accent)' : 'var(--sub)',
      borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent'
    }}>{label}</button>
  )

  const SubTabButton = ({ id, label }: { id: 'single' | 'testset'; label: string }): React.ReactElement => (
    <button onClick={() => setSubTab(id)} style={{
      cursor: 'pointer', fontSize: 11, padding: '5px 14px', borderRadius: 16,
      border: `1px solid ${subTab === id ? 'var(--accent)' : 'var(--line)'}`,
      background: subTab === id ? 'var(--accent-soft)' : '#fff',
      color: subTab === id ? 'var(--accent)' : 'var(--sub)', fontWeight: subTab === id ? 700 : 500
    }}>{label}</button>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* 统一主头部：返回图标 + 场景名 + 居中导航 */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', height: 56, borderBottom: '1px solid var(--line)', background: '#fff', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setCurrentPage('workbench')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--ink)' }}><ArrowLeft size={16} /></button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{currentScene?.name}</span>
        </div>
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          <PageNav current="validate" />
        </div>
        <div />
      </div>

      {/* 第二行：验证标题 + 内部 tab（对比/报告） */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 28px', height: 44, borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginRight: 16 }}>{t('validate.title')}</span>
        <TabButton id="compare" label={t('validate.tabCompare')} />
        <TabButton id="report" label={t('validate.tabReport')} />
      </div>

      {tab === 'compare' ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '14px 28px 0' }}>
          {/* 受控条件 */}
          <div style={{ padding: '7px 12px', background: 'var(--canvas)', borderRadius: 8, fontSize: 10, color: 'var(--sub)', flexShrink: 0 }}>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{t('validate.controlLabel')}</span>{' '}
            {control ? t('validate.controlBar', { model: control.model, temp: control.temperature }) : t('validate.controlBarPending')}
          </div>

          {/* A/B 两栏实时输出 */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12, padding: '12px 0' }}>
            <ABPane title={t('validate.colA')} accent={false} text={bareResult} />
            <ABPane title={t('validate.colB')} accent text={skillResult} />
          </div>
          {analyzing && (
            <div style={{ padding: 8, marginBottom: 8, background: '#EFF6FF', borderRadius: 8, fontSize: 10, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ animation: 'pulse 1.2s ease-in-out infinite' }}>●</span> {t('validate.analyzing')}
            </div>
          )}

          {/* 底部输入区：子 tab */}
          <div style={{ borderTop: '1px solid var(--line)', padding: '12px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <SubTabButton id="single" label={t('validate.subSingle')} />
              <SubTabButton id="testset" label={t('validate.subTestset')} />
            </div>

            {subTab === 'single' ? (
              <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
                <textarea value={instruction} onChange={e => setInstruction(e.target.value)}
                  placeholder={t('validate.inputPlaceholder')} disabled={running}
                  rows={3}
                  style={{ flex: 1, fontSize: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} />
                <button onClick={handleRunSingle} disabled={running || !instruction.trim()} className="btn-primary" style={{ padding: '0 22px', fontSize: 12, flexShrink: 0 }}>
                  {running ? t('validate.running') : t('validate.runCompare')}
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <button onClick={handleGenerate} disabled={busy} className="btn-primary" style={{ padding: '6px 14px', fontSize: 11 }}>
                    {generating ? t('validate.testset.generating') : t('validate.testset.generate')}
                  </button>
                  <button onClick={openAdd} disabled={busy || cases.length >= MAX_CASES} className="btn-soft" style={{ padding: '6px 12px', fontSize: 11 }}>{t('validate.testset.add')}</button>
                  <span style={{ fontSize: 10, color: 'var(--tri)' }}>{t('validate.testset.counter', { count: cases.length, max: MAX_CASES })}</span>
                  <span style={{ flex: 1 }} />
                  <button onClick={runAllCases} disabled={busy || cases.filter(c => c.instruction.trim()).length === 0} className="btn-primary" style={{ padding: '6px 14px', fontSize: 11 }}>
                    {runAll ? t('validate.testset.running', { done: runAll.done, total: runAll.total }) : t('validate.testset.runAll')}
                  </button>
                </div>

                {cases.length === 0 ? (
                  <p style={{ fontSize: 11, color: 'var(--tri)', lineHeight: 1.6, padding: '4px 0' }}>{t('validate.testset.empty')}</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflow: 'auto' }}>
                    {cases.map((c, idx) => {
                      const r = caseResults[c.id]
                      const isRunning = runningCaseId === c.id
                      return (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 8, background: isRunning ? 'var(--accent-soft)' : '#fff' }}>
                          <span style={{ fontSize: 10, color: 'var(--tri)', width: 14, flexShrink: 0 }}>{idx + 1}</span>
                          <button onClick={() => openEdit(c)} title={t('validate.testset.edit')} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: c.instruction ? 'var(--ink)' : 'var(--tri)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: 0 }}>
                            {c.instruction || t('validate.testset.modalPlaceholder')}
                          </button>
                          {r?.verdict && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: VERDICT_COLOR[r.verdict.verdict].fg, background: VERDICT_COLOR[r.verdict.verdict].bg, padding: '1px 8px', borderRadius: 10 }}>{verdictLabel(r.verdict.verdict)}</span>}
                          <button onClick={() => moveCase(c.id, -1)} disabled={idx === 0 || busy} title="↑" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--tri)', flexShrink: 0 }}>↑</button>
                          <button onClick={() => moveCase(c.id, 1)} disabled={idx === cases.length - 1 || busy} title="↓" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--tri)', flexShrink: 0 }}>↓</button>
                          <button onClick={() => runOneCase(c)} disabled={busy || !c.instruction.trim()} className="btn-soft" style={{ padding: '3px 10px', fontSize: 9, flexShrink: 0 }}>
                            {isRunning ? t('validate.running') : (r ? t('validate.testset.rerun') : t('validate.testset.run'))}
                          </button>
                          <button onClick={() => deleteCase(c.id)} disabled={busy} title={t('validate.testset.delete')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--tri)', flexShrink: 0 }}><Close size={12} /></button>
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
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px' }}>
          {/* 汇总结果 */}
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, background: '#FAFAFB', padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)' }}>{t('validate.report.summaryTitle')}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleExport('json')} disabled={agg.count === 0} className="btn-soft" style={{ padding: '4px 12px', fontSize: 9 }}>{t('validate.export.json')}</button>
                <button onClick={() => handleExport('markdown')} disabled={agg.count === 0} className="btn-soft" style={{ padding: '4px 12px', fontSize: 9 }}>{t('validate.export.markdown')}</button>
              </div>
            </div>
            {agg.count > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: VERDICT_COLOR[agg.verdict].fg, background: VERDICT_COLOR[agg.verdict].bg, padding: '3px 12px', borderRadius: 6 }}>{verdictLabel(agg.verdict)}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{t('validate.summary.winRate', { win: agg.win, tie: agg.tie, loss: agg.loss })}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--sub)' }}>
                  {t('validate.numbers.tokens', { bare: agg.bareTok, skill: agg.skillTok })}{' · '}
                  {t('validate.numbers.tokenDiff', { diff: agg.skillTok - agg.bareTok })}
                </div>
              </>
            ) : (
              <p style={{ fontSize: 11, color: 'var(--tri)', margin: 0 }}>{t('validate.summary.noResults')}</p>
            )}
          </div>

          {/* 逐条结果 */}
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>{t('validate.report.detailTitle')}</div>
          {reportEntries.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--tri)', lineHeight: 1.6 }}>{t('validate.report.empty')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {reportEntries.map(e => {
                const open = expanded[e.id]
                const v = e.result.verdict
                return (
                  <div key={e.id} style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                    <button onClick={() => setExpanded(prev => ({ ...prev, [e.id]: !open }))} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ color: 'var(--tri)', display: 'flex', alignItems: 'center' }}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.instruction}</span>
                      {v && <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, color: VERDICT_COLOR[v.verdict].fg, background: VERDICT_COLOR[v.verdict].bg, padding: '2px 10px', borderRadius: 10 }}>{verdictLabel(v.verdict)}</span>}
                    </button>
                    {open && (
                      <div style={{ padding: '0 12px 12px' }}>
                        {v ? <VerdictView v={v} /> : e.result.diffSummary ? <div style={{ fontSize: 10, color: 'var(--sub)', whiteSpace: 'pre-wrap' }}>{e.result.diffSummary}</div> : null}
                        <div style={{ marginTop: 10 }}><ABStatic bare={e.result.bare} withSkill={e.result.withSkill} /></div>
                        {(e.result.bareTokens || e.result.skillTokens) && (
                          <div style={{ marginTop: 6, fontSize: 9, color: 'var(--tri)' }}>
                            {t('validate.numbers.tokens', { bare: e.result.bareTokens?.totalTokens ?? 0, skill: e.result.skillTokens?.totalTokens ?? 0 })}
                            {e.result.bareLatencyMs != null && e.result.skillLatencyMs != null && ` · ${t('validate.numbers.latency', { a: e.result.bareLatencyMs, b: e.result.skillLatencyMs })}`}
                          </div>
                        )}
                        {e.id === 'single' && (
                          <div style={{ marginTop: 8 }}>
                            <button onClick={handleSaveSingle} disabled={savedSingle} className="btn-soft" style={{ padding: '4px 12px', fontSize: 9 }}>{savedSingle ? t('validate.saved') : t('validate.save')}</button>
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
        <div onClick={closeModal} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={ev => ev.stopPropagation()} style={{ width: 560, maxWidth: '90vw', background: '#fff', borderRadius: 12, padding: 18, boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>{t('validate.testset.editTitle')}</div>
            <textarea value={editing.text} onChange={e => setEditing({ ...editing, text: e.target.value })}
              placeholder={t('validate.testset.modalPlaceholder')} autoFocus rows={7}
              style={{ width: '100%', fontSize: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={closeModal} className="btn-soft" style={{ padding: '6px 16px', fontSize: 11 }}>{t('validate.testset.cancel')}</button>
              <button onClick={saveModal} disabled={!editing.text.trim()} className="btn-primary" style={{ padding: '6px 16px', fontSize: 11 }}>{t('validate.testset.saveCase')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Validate
