import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ serviceWorkers: 'block' })
p.on('pageerror', e => console.log('ERR', e.message))
await p.goto('http://127.0.0.1:4173/analyze.html', { waitUntil: 'networkidle' })
await p.waitForFunction(() => window.__ready === true, { timeout: 40000 })
const a = await p.evaluate(() => window.__an)
console.log('depth', a.depth, 'height', a.height, 'verts', a.verts, 'z', a.minZ, '..', a.maxZ)
console.log('feet', JSON.stringify(a.feet))
console.log('idx     z     n     w     h   top   bot    cy   low')
for (const r of a.table) {
  console.log(String(r.i).padStart(3), String(r.z).padStart(7), String(r.n).padStart(5),
              String(r.w).padStart(6), String(r.h).padStart(6), String(r.top).padStart(6),
              String(r.bot).padStart(6), String(r.cy).padStart(6), String(r.low).padStart(5))
}
await b.close()
