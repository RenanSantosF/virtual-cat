import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 500, height: 500 }, deviceScaleFactor: 1.6 })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type()==='error') errs.push(m.text()) })
await p.goto('http://127.0.0.1:4173/glbview.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, { timeout: 30000 }).catch(()=>{})
console.log(JSON.stringify(await p.evaluate(() => window.__info)))
const views = [['side',1.5708,0.05],['q34',2.2,0.25],['top',1.5708,1.4]]
for (const [n,y,pi] of views) {
  await p.evaluate((v) => window.__setOpacity(v), 0.28)
  await p.evaluate(([y,pi]) => window.__render(y,pi), [y,pi])
  await p.waitForTimeout(150)
  await p.screenshot({ path: `${out}/glb-${n}.png` })
}
console.log(errs.length ? 'ERR: '+errs.slice(0,5).join('|') : 'ok')
await b.close()
