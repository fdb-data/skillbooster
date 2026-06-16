import { describe, it, expect, vi } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('electron', () => ({ app: { getPath: vi.fn().mockReturnValue('/tmp/skillbooster') }, dialog: {} }))
vi.mock('archiver', () => ({ default: vi.fn() }))
vi.mock('better-sqlite3', () => ({ default: vi.fn() }))

import { summarizeEval, slugifySkillName, buildFrontmatter, validateFrontmatter, planPackageEntries } from '../../electron/main/packager'
import type { ValidationResult, Reference, Attachment } from '../../src/contracts/ipc-types'

function ref(filename: string, storedPath: string, include = true): Reference {
  return { id: filename, filename, storedPath, extractedText: '', includeInPackage: include }
}
function att(kind: 'script' | 'asset', filename: string, storedPath: string, include = true): Attachment {
  return { id: filename, kind, filename, storedPath, includeInPackage: include }
}

function res(verdict: 'helpful' | 'no_difference' | 'worse' | null, bareTok: number, skillTok: number): ValidationResult {
  return {
    bare: 'a', withSkill: 'b',
    verdict: verdict ? { verdict, summary: '', dimensions: [] } : null,
    bareTokens: { promptTokens: 0, completionTokens: 0, totalTokens: bareTok },
    skillTokens: { promptTokens: 0, completionTokens: 0, totalTokens: skillTok },
    control: { model: 'm', temperature: 0.7 }
  }
}

describe('summarizeEval - cross-case win rate', () => {
  it('tallies win/tie/loss from per-case verdicts and sums tokens', () => {
    const cases = [
      { result: res('helpful', 100, 160) },
      { result: res('helpful', 80, 140) },
      { result: res('no_difference', 50, 90) },
      { result: res('worse', 70, 130) }
    ]
    const s = summarizeEval(cases)
    expect(s.win).toBe(2)
    expect(s.tie).toBe(1)
    expect(s.loss).toBe(1)
    expect(s.bareTokens).toBe(300)
    expect(s.skillTokens).toBe(520)
  })

  it('skips cases without a verdict but still counts their tokens', () => {
    const cases = [
      { result: res('helpful', 10, 20) },
      { result: res(null, 5, 15) }
    ]
    const s = summarizeEval(cases)
    expect(s.win).toBe(1)
    expect(s.tie).toBe(0)
    expect(s.loss).toBe(0)
    expect(s.bareTokens).toBe(15)
    expect(s.skillTokens).toBe(35)
  })

  it('handles an empty test set', () => {
    const s = summarizeEval([])
    expect(s).toEqual({ win: 0, tie: 0, loss: 0, bareTokens: 0, skillTokens: 0 })
  })
})

describe('slugifySkillName - SKILL.md name compliance', () => {
  it('lowercases and hyphenates ascii names', () => {
    expect(slugifySkillName('My Cool Skill', 'sid')).toBe('my-cool-skill')
  })

  it('collapses non-alnum runs and trims hyphens', () => {
    expect(slugifySkillName('  Foo__Bar!! ', 'sid')).toBe('foo-bar')
  })

  it('falls back to skill-<id> for pure non-ascii names', () => {
    expect(slugifySkillName('高级单页面设计', 'abc123def456')).toBe('skill-abc123de')
  })

  it('caps at 64 chars without trailing hyphen', () => {
    const out = slugifySkillName('a'.repeat(80), 'sid')
    expect(out.length).toBeLessThanOrEqual(64)
    expect(out.endsWith('-')).toBe(false)
  })

  it('always produces a name matching the spec regex', () => {
    const re = /^[a-z0-9]+(-[a-z0-9]+)*$/
    expect(re.test(slugifySkillName('!!!', 'xyz789ab'))).toBe(true)
    expect(re.test(slugifySkillName('Normal Name', 'sid'))).toBe(true)
  })
})

describe('validateFrontmatter - health gate', () => {
  it('passes a compliant frontmatter', () => {
    const { name, description } = buildFrontmatter('Demo Scene', 'sid', 'en')
    expect(validateFrontmatter(name, description, 'en')).toEqual([])
  })

  it('flags a missing name', () => {
    const w = validateFrontmatter('', 'desc', 'en')
    expect(w.some(x => x.code === 'INVALID_FRONTMATTER' && x.severity === 'error')).toBe(true)
  })

  it('flags an invalid name (uppercase / leading hyphen)', () => {
    expect(validateFrontmatter('Bad-Name', 'd', 'en').length).toBeGreaterThan(0)
    expect(validateFrontmatter('-bad', 'd', 'en').length).toBeGreaterThan(0)
    expect(validateFrontmatter('a--b', 'd', 'en').length).toBeGreaterThan(0)
  })

  it('flags a name over 64 chars', () => {
    const w = validateFrontmatter('a'.repeat(65), 'd', 'en')
    expect(w.some(x => x.code === 'INVALID_FRONTMATTER')).toBe(true)
  })

  it('flags a missing description', () => {
    const w = validateFrontmatter('ok', '  ', 'en')
    expect(w.some(x => x.code === 'INVALID_FRONTMATTER')).toBe(true)
  })

  it('flags a description over 1024 chars', () => {
    const w = validateFrontmatter('ok', 'x'.repeat(1025), 'en')
    expect(w.some(x => x.code === 'INVALID_FRONTMATTER')).toBe(true)
  })
})

describe('planPackageEntries - standard directory layout', () => {
  const exists = () => true

  it('always wraps everything under {skillName}/ with SKILL.md and the sidecar card', () => {
    const e = planPackageEntries('my-skill', 'md', 'json', [], [], [], exists)
    const names = e.map(x => x.name)
    expect(names).toContain('my-skill/SKILL.md')
    expect(names).toContain('my-skill/experience-card.json')
    expect(names.every(n => n.startsWith('my-skill/'))).toBe(true)
  })

  it('includes references/scripts/assets that are flagged and present', () => {
    const e = planPackageEntries(
      'sk', 'md', 'json',
      [ref('doc.pdf', '/r/doc.pdf')],
      [att('script', 'run.py', '/s/run.py')],
      [att('asset', 'tpl.docx', '/a/tpl.docx')],
      exists
    )
    const names = e.map(x => x.name)
    expect(names).toContain('sk/references/doc.pdf')
    expect(names).toContain('sk/scripts/run.py')
    expect(names).toContain('sk/assets/tpl.docx')
  })

  it('omits scripts/ and assets/ entries when nothing is flagged for packaging', () => {
    const e = planPackageEntries(
      'sk', 'md', 'json', [],
      [att('script', 'run.py', '/s/run.py', false)],
      [att('asset', 'tpl.docx', '/a/tpl.docx', false)],
      exists
    )
    const names = e.map(x => x.name)
    expect(names.some(n => n.startsWith('sk/scripts/'))).toBe(false)
    expect(names.some(n => n.startsWith('sk/assets/'))).toBe(false)
  })

  it('skips flagged files that no longer exist on disk', () => {
    const missing = (p: string) => p !== '/s/gone.py'
    const e = planPackageEntries(
      'sk', 'md', 'json', [],
      [att('script', 'gone.py', '/s/gone.py'), att('script', 'here.py', '/s/here.py')],
      [], missing
    )
    const names = e.map(x => x.name)
    expect(names).toContain('sk/scripts/here.py')
    expect(names).not.toContain('sk/scripts/gone.py')
  })
})
