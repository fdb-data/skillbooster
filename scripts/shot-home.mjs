import { _electron as electron } from 'playwright-core'
import * as path from 'node:path'
const bin = path.join(process.cwd(), 'node_modules/electron/dist/electron.exe')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const app = await electron.launch({ executablePath: bin, args: ['.'], timeout: 30000 })
await sleep(6000)
const page = app.windows().find(w => !w.url().startsWith('devtools://')) ?? await app.firstWindow()
await page.waitForLoadState('domcontentloaded').catch(()=>{})
await sleep(1500)
const onHome = () => page.evaluate(() => document.body.textContent.includes('把你的专业经验'))
for (let i=0;i<5 && !(await onHome());i++){ await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.querySelector('svg path[d^="M19 12H5"]'));if(b)b.click()}); await sleep(1200) }
await sleep(1200) // 等入场动画结束
await page.screenshot({ path: path.join(process.cwd(), '.shots', 'r-home.png') })
console.log('home', await onHome())
await app.close(); process.exit(0)
