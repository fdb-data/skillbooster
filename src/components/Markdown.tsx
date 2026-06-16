import React from 'react'

/** 行内格式：**加粗** 和 `代码` */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i}>{p.slice(2, -2)}</strong>
    }
    if (p.startsWith('`') && p.endsWith('`')) {
      return <code key={i} style={{ background: 'rgba(0,0,0,0.06)', padding: '0 3px', borderRadius: 3, fontSize: '0.95em' }}>{p.slice(1, -1)}</code>
    }
    return p
  })
}

function isTableLine(line: string): boolean {
  const t = line.trim()
  return t.startsWith('|') && t.endsWith('|') && t.length > 2
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim())
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

function renderTable(tableLines: string[], key: number): React.ReactNode {
  const rows = tableLines.filter(l => !isTableSeparator(l)).map(splitCells)
  if (rows.length === 0) return null
  const [header, ...body] = rows
  const cellStyle: React.CSSProperties = { border: '1px solid var(--line)', padding: '3px 8px', textAlign: 'left', verticalAlign: 'top' }
  return (
    <div key={key} style={{ overflowX: 'auto', margin: '6px 0' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.95em', width: '100%' }}>
        <thead>
          <tr>
            {header.map((c, i) => (
              <th key={i} style={{ ...cellStyle, background: 'rgba(0,0,0,0.03)', fontWeight: 600 }}>{renderInline(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((cells, r) => (
            <tr key={r}>
              {cells.map((c, i) => <td key={i} style={cellStyle}>{renderInline(c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * 轻量 Markdown 渲染：覆盖智能体回复常见的格式（加粗/分隔线/标题/无序列表/表格/行内代码），
 * 不引入完整 markdown 依赖。未识别的语法按纯文本原样展示。
 */
const Markdown: React.FC<{ text: string; style?: React.CSSProperties }> = ({ text, style }) => {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const trimmed = lines[i].trim()

    // 表格块：连续的 | 开头行（含分隔行）
    if (isTableLine(trimmed)) {
      const tableLines: string[] = []
      while (i < lines.length && isTableLine(lines[i].trim())) {
        tableLines.push(lines[i].trim())
        i++
      }
      blocks.push(renderTable(tableLines, i))
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={i} style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '8px 0' }} />)
    } else if (/^#{1,4}\s+/.test(trimmed)) {
      blocks.push(<div key={i} style={{ fontWeight: 700, margin: '6px 0 2px' }}>{renderInline(trimmed.replace(/^#{1,4}\s+/, ''))}</div>)
    } else if (/^[-*•]\s+/.test(trimmed)) {
      blocks.push(
        <div key={i} style={{ display: 'flex', gap: 6, margin: '1px 0' }}>
          <span style={{ flexShrink: 0 }}>•</span>
          <span style={{ flex: 1 }}>{renderInline(trimmed.replace(/^[-*•]\s+/, ''))}</span>
        </div>
      )
    } else if (trimmed === '') {
      blocks.push(<div key={i} style={{ height: 6 }} />)
    } else {
      blocks.push(<div key={i}>{renderInline(trimmed)}</div>)
    }
    i++
  }
  return <div style={{ fontSize: 11, color: 'var(--ink)', lineHeight: 1.6, ...style }}>{blocks}</div>
}

export default Markdown
