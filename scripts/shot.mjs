import { _electron as electron } from 'playwright-core'
import * as fs from 'node:fs'
import * as path from 'node:path'

const APP_DIR = process.cwd()
const SHOT_DIR = path.join(APP_DIR, '.shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })
const bin = path.join(APP_DIR, 'node_modules/electron/dist/electron.exe')

const app = await electron.launch({ executablePath: bin, args: ['.'], timeout: 30000 })
await new Promise(r => setTimeout(r, 6000))
const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow()
await page.waitForLoadState('domcontentloaded').catch(() => {})
await new Promise(r => setTimeout(r, 2000))

// 始终验证「多模态军用飞机识别框架」场景（流程/规则/洞察卡片齐全）
// 若已在画布，先点返回箭头回首页
if (await page.$('.react-flow')) {
  await page.evaluate(() => {
    const back = [...document.querySelectorAll('button')].find(b => b.querySelector('svg path[d^="M19 12H5"]'))
    if (back) back.click()
  })
  await new Promise(r => setTimeout(r, 1500))
}
const nav = await page.evaluate(() => {
  const card = [...document.querySelectorAll('div')].find(d => {
    const t = d.textContent || ''
    const r = d.getBoundingClientRect()
    return t.includes('多模态军用飞机') && r.width > 200 && r.height > 50 && r.height < 200
  })
  if (card) { card.click(); return 'ok' }
  return 'no-card'
})
console.log('nav:', nav)
await new Promise(r => setTimeout(r, 3000))

await page.screenshot({ path: path.join(SHOT_DIR, '02-canvas.png') })
console.log('shot canvas')

await app.close()
process.exit(0)
