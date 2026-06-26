import { vi } from 'vitest'
// 确保 i18n 在所有测试中初始化（部分测试 mock 了 sceneStore，会绕过其副作用 import）
import '../src/i18n'

if (typeof window !== 'undefined' && !window.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn()
}

// theme.ts 在模块加载时调用 window.matchMedia（jsdom/happy-dom 默认没有）
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })) as unknown as typeof window.matchMedia
}

// @xyflow/react 需要 ResizeObserver（jsdom 没有）
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverMock {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}

const mockApi = {
  agent: {
    onEvent: vi.fn().mockReturnValue(() => {}),
    abort: vi.fn().mockResolvedValue({ success: true, data: { aborted: true } })
  },
  scenes: {
    list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    get: vi.fn().mockResolvedValue({ success: true, data: null }),
    create: vi.fn().mockImplementation((args: any) => Promise.resolve({ success: true, data: { id: 'test-scene', name: args?.name ?? 'Test', status: 'active', canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] }, references: [], scripts: [], assets: [], conversation: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })),
    update: vi.fn().mockResolvedValue({ success: true, data: {} }),
    delete: vi.fn().mockResolvedValue({ success: true, data: { success: true } })
  },
  references: {
    add: vi.fn().mockResolvedValue({ success: true, data: { id: 'ref-1', filename: 'test.txt', storedPath: '/tmp/test.txt', extractedText: 'test content', includeInPackage: true } }),
    remove: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
    list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    setInclude: vi.fn().mockResolvedValue({ success: true, data: { success: true } })
  },
  attachments: {
    add: vi.fn().mockResolvedValue({ success: true, data: { id: 'att-1', kind: 'script', filename: 'test.py', storedPath: '/tmp/test.py', includeInPackage: true } }),
    remove: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
    list: vi.fn().mockResolvedValue({ success: true, data: [] }),
    setInclude: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
    open: vi.fn().mockResolvedValue({ success: true, data: { success: true } })
  },
  skill: {
    pickImportPath: vi.fn().mockResolvedValue({ success: true, data: { path: null } }),
    import: vi.fn().mockResolvedValue({ success: true, data: { id: 'imported-scene', name: 'imported-skill', status: 'active', canvas: { flows: [], rules: [], insights: [], concepts: [], relations: [] }, references: [], scripts: [], assets: [], conversation: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } })
  },
  guide: {
    runTurn: vi.fn().mockResolvedValue({ success: true, data: { reply: 'Guide reply', options: ['opt1', 'opt2'], optionsMultiSelect: false, sceneDraft: { name: 'Test Scene', protagonist: 'User', trigger: 'Action', includes: [], excludes: [] }, projectName: 'Test Project', done: false } }),
    getDraft: vi.fn().mockResolvedValue({ success: true, data: { name: '', protagonist: '', trigger: '', includes: [], excludes: [], projectName: '', done: false } }),
    getMessages: vi.fn().mockResolvedValue({ success: true, data: [] })
  },
  extraction: {
    runTurn: vi.fn().mockResolvedValue({ success: true, data: { reply: 'Extraction reply', canvasUpdates: [], proposals: [] } }),
    draftFromDocs: vi.fn().mockResolvedValue({ success: true, data: { openingMessage: 'Draft ready', canvasUpdates: [] } })
  },
  validation: {
    run: vi.fn().mockResolvedValue({ success: true, data: { bare: 'bare result', withSkill: 'skill result', verdict: null, diffSummary: 'diff summary', control: { model: 'test-model', temperature: 0.7 } } }),
    runCase: vi.fn().mockResolvedValue({ success: true, data: { bare: 'bare result', withSkill: 'skill result', verdict: null, diffSummary: 'diff summary', control: { model: 'test-model', temperature: 0.7 } } }),
    listCases: vi.fn().mockResolvedValue({ success: true, data: [] }),
    generateCases: vi.fn().mockResolvedValue({ success: true, data: [] }),
    saveCases: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getResults: vi.fn().mockResolvedValue({ success: true, data: { caseResults: {}, singleEntry: null } }),
    saveResults: vi.fn().mockResolvedValue({ success: true, data: { saved: true } }),
    exportResults: vi.fn().mockResolvedValue({ success: true, data: { filePath: '/tmp/eval.json' } })
  },
  canvas: {
    update: vi.fn().mockResolvedValue({ success: true, data: {} })
  },
  export: {
    buildPackage: vi.fn().mockResolvedValue({ success: true, data: { filePath: '/tmp/package.zip' } }),
    healthCheck: vi.fn().mockResolvedValue({ success: true, data: { passed: true, warnings: [] } })
  },
  settings: {
    getLLM: vi.fn().mockResolvedValue({ success: true, data: { provider: 'custom', apiKey: 'test-key', model: 'test-model', baseUrl: 'https://api.test.com/v1' } }),
    setLLM: vi.fn().mockResolvedValue({ success: true, data: {} }),
    testConnection: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
    getAgentConfigs: vi.fn().mockResolvedValue({ success: true, data: [] }),
    saveAgentConfig: vi.fn().mockResolvedValue({ success: true, data: {} }),
    openPromptFile: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
    getLanguage: vi.fn().mockResolvedValue({ success: true, data: 'en' }),
    setLanguage: vi.fn().mockResolvedValue({ success: true, data: 'en' }),
    getTheme: vi.fn().mockResolvedValue({ success: true, data: 'system' }),
    setTheme: vi.fn().mockResolvedValue({ success: true, data: 'system' })
  },
  update: {
    onEvent: vi.fn().mockReturnValue(() => {}),
    getAutoUpdate: vi.fn().mockResolvedValue({ success: true, data: false }),
    setAutoUpdate: vi.fn().mockResolvedValue({ success: true, data: false }),
    check: vi.fn().mockResolvedValue({ success: true, data: null }),
    download: vi.fn().mockResolvedValue({ success: true, data: null }),
    install: vi.fn().mockResolvedValue({ success: true, data: null }),
    getVersion: vi.fn().mockResolvedValue({ success: true, data: '0.0.0' })
  }
}

;(globalThis as any).window.api = mockApi

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/skillbooster'),
    on: vi.fn(),
    whenReady: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn()
  },
  BrowserWindow: Object.assign(
    vi.fn().mockImplementation(() => ({
      loadURL: vi.fn(),
      on: vi.fn(),
      webContents: { openDevTools: vi.fn(), on: vi.fn() }
    })),
    { getAllWindows: vi.fn().mockReturnValue([]) }
  ),
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), send: vi.fn() },
  contextBridge: { exposeInMainWorld: vi.fn() },
  dialog: { showOpenDialog: vi.fn(), showSaveDialog: vi.fn() },
  shell: { openPath: vi.fn() }
}))

vi.mock('better-sqlite3', () => {
  const mockDb = {
    pragma: vi.fn(),
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(undefined),
      all: vi.fn().mockReturnValue([])
    }),
    close: vi.fn()
  }
  return { default: vi.fn().mockReturnValue(mockDb) }
})

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(''),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    copyFileSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => false, size: 0 })
  },
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(''),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  copyFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  statSync: vi.fn().mockReturnValue({ isDirectory: () => false, size: 0 })
}))

vi.mock('path', () => ({
  default: {
    join: vi.fn((...args: string[]) => args.join('/')),
    extname: vi.fn().mockReturnValue('.txt'),
    basename: vi.fn().mockReturnValue('test.txt'),
    dirname: vi.fn().mockReturnValue('/tmp')
  }
}))

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'pdf content' })
}))

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: 'docx content' })
  }
}))