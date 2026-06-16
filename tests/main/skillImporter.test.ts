import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('adm-zip', () => ({ default: vi.fn() }))
vi.mock('../../electron/main/i18n', () => ({ mt: (k: string) => k }))
vi.mock('../../electron/main/docParser', () => ({ parseDocument: vi.fn().mockResolvedValue('parsed text') }))

vi.mock('../../electron/main/store', () => ({
  createScene: vi.fn(),
  getSceneDir: vi.fn(() => '/scene/refs'),
  getAttachmentSceneDir: vi.fn(() => '/scene/scripts'),
  addReference: vi.fn(),
  addAttachment: vi.fn(),
  getScene: vi.fn(() => ({ id: 's1', name: 'my-skill', status: 'active', created_at: 't', updated_at: 't' })),
  loadCanvas: vi.fn(() => ({ flows: [], rules: [], insights: [], concepts: [], relations: [] })),
  listReferences: vi.fn(() => []),
  listAttachments: vi.fn(() => []),
  listConversation: vi.fn(() => [])
}))

vi.mock('fs', () => ({
  default: {
    statSync: vi.fn(() => ({ isDirectory: () => true, isFile: () => true })),
    readdirSync: vi.fn(() => ['SKILL.md']),
    readFileSync: vi.fn(() => '---\nname: my-skill\ndescription: "desc"\n---\nbody text'),
    existsSync: vi.fn(() => false),
    copyFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    mkdtempSync: vi.fn(() => '/tmp/x'),
    rmSync: vi.fn()
  }
}))

vi.mock('path', () => ({
  default: {
    join: vi.fn((...a: string[]) => a.join('/')),
    extname: vi.fn((p: string) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : '' }),
    basename: vi.fn((p: string) => p.split('/').pop()),
    dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/'))
  }
}))

import { importSkill, parseFrontmatter, ORIGINAL_SKILL_FILENAME } from '../../electron/main/skillImporter'
import * as store from '../../electron/main/store'

describe('parseFrontmatter - 最小 frontmatter 分隔器', () => {
  it('解析带引号的 name / description，并切出正文', () => {
    const md = '---\nname: "data-cleaning"\ndescription: \'clean it\'\n---\n# Body\ncontent'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.name).toBe('data-cleaning')
    expect(frontmatter.description).toBe('clean it')
    expect(body).toBe('# Body\ncontent')
  })

  it('跳过缩进的嵌套键（metadata 下的字段不会污染顶层）', () => {
    const md = '---\nname: foo\nmetadata:\n  version: "1.0"\n  name: nested\n---\nbody'
    const { frontmatter } = parseFrontmatter(md)
    expect(frontmatter.name).toBe('foo')
  })

  it('无 frontmatter 时原样返回正文，frontmatter 为空', () => {
    const md = '# Just a heading\nno frontmatter here'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.name).toBeUndefined()
    expect(frontmatter.description).toBeUndefined()
    expect(body).toBe(md)
  })

  it('兼容 CRLF 换行', () => {
    const md = '---\r\nname: win-skill\r\n---\r\nbody'
    const { frontmatter, body } = parseFrontmatter(md)
    expect(frontmatter.name).toBe('win-skill')
    expect(body).toBe('body')
  })
})

describe('importSkill - 原始 SKILL.md 改名进参考文档', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('建普通场景，并把原文以 original-skill.md 加进参考文档（默认打包）', async () => {
    await importSkill('/some/skill-folder')

    expect(store.createScene).toHaveBeenCalledWith(expect.any(String), 'my-skill')

    expect(store.addReference).toHaveBeenCalledTimes(1)
    const ref = (store.addReference as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as {
      filename: string; includeInPackage: boolean; extractedText: string
    }
    expect(ref.filename).toBe(ORIGINAL_SKILL_FILENAME)
    expect(ref.includeInPackage).toBe(true)
    expect(ref.extractedText).toBe('parsed text')
  })
})
