import type { ReplayReport, ReplayResult } from '../contracts/ipc-types'

interface ReplayReportViewProps {
  report: ReplayReport | null
  loading: boolean
}

function ResultRow({ result }: { result: ReplayResult }) {
  return (
    <div className={`rounded-block border p-3 ${result.hit ? 'border-green-200 bg-green-50 dark:bg-green-900/20' : 'border-red-200 bg-red-50 dark:bg-red-900/20'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink">{result.instruction}</span>
        <span className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${result.hit ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
          {result.hit ? '命中' : '未命中'}
        </span>
      </div>
      {result.expectedAnswer && (
        <div className="mt-2 text-[11px] text-sub">
          <span className="font-medium text-ink">期望：</span>{result.expectedAnswer}
        </div>
      )}
      <div className="mt-1 text-[11px] text-sub">
        <span className="font-medium text-ink">AI 输出：</span>{result.actualAnswer}
      </div>
      <div className="mt-1 text-[10px] text-tri">{result.reason}</div>
    </div>
  )
}

export function ReplayReportView({ report, loading }: ReplayReportViewProps) {
  if (loading) return <div className="p-4 text-center text-[13px] text-sub">正在运行验证回放...</div>
  if (!report) return <div className="p-4 text-center text-[13px] text-tri">选择案例并点击运行</div>

  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-3">
          <div className="text-[11px] text-sub">总命中率</div>
          <div className="text-[24px] font-bold text-ink">{(report.hitRate * 100).toFixed(1)}%</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-sub">命中 / 未命中</div>
          <div className="text-[24px] font-bold text-ink">{report.hitCount} / {report.missCount}</div>
        </div>
        <div className="card p-3">
          <div className="text-[11px] text-sub">总案例数</div>
          <div className="text-[24px] font-bold text-ink">{report.totalCases}</div>
        </div>
      </div>

      {Object.keys(report.byDifficulty).length > 0 && (
        <div className="card p-3">
          <div className="mb-2 text-[13px] font-medium text-ink">按难度</div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-sub">
            {Object.entries(report.byDifficulty).map(([k, v]) => (
              <div key={k}>
                {k}: {(v.rate * 100).toFixed(0)}% ({v.hit}/{v.total})
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(report.byConfidence).length > 0 && (
        <div className="card p-3">
          <div className="mb-2 text-[13px] font-medium text-ink">按置信度</div>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-sub">
            {Object.entries(report.byConfidence).map(([k, v]) => (
              <div key={k}>
                {k}: {(v.rate * 100).toFixed(0)}% ({v.hit}/{v.total})
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[13px] font-medium text-ink">详细结果</div>
        {report.results.map(r => <ResultRow key={r.caseId} result={r} />)}
      </div>
    </div>
  )
}
