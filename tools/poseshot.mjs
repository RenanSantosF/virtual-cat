import { chromium } from 'playwright'
const [out, spec] = process.argv.slice(2)
const shots = JSON.parse(spec)
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 560, height: 560 }, deviceScaleFactor: 1.5, serviceWorkers: 'block' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type()==='error') errs.push(m.text()) })
await p.goto('http://127.0.0.1:4173/poseview.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, { timeout: 60000 })
console.log(JSON.stringify(await p.evaluate(() => window.__info)))
for (const s of shots) {
  await p.evaluate(([b,t,st]) => window.__pose(b,t,st), [s.behavior, s.t ?? 0, s.stride ?? 0])
  await p.evaluate(([y,pi,d]) => window.__render(y,pi,d), [s.cam[0], s.cam[1], s.cam[2]])
  await p.waitForTimeout(120)
  await p.screenshot({ path: `${out}/pose-${s.name}.png` })
}
console.log(errs.length ? 'ERR: '+errs.slice(0,6).join(' | ') : 'ok')
await b.close()
