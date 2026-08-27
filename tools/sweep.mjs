import { chromium } from 'playwright'
const [out, spec] = process.argv.slice(2)
const cases = JSON.parse(spec)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 420, height: 420 }, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:4173/poseview.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, { timeout: 60000 })
for (const c of cases) {
  await p.evaluate((o) => window.__poseRaw(o), c.params)
  await p.evaluate(([y,pi,d]) => window.__render(y,pi,d), c.cam)
  await p.waitForTimeout(90)
  await p.screenshot({ path: `${out}/sw-${c.name}.png` })
}
console.log('ok')
await b.close()
