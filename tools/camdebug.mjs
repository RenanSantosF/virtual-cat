import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 400, height: 850 } })
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.fill('input', 'Nina'); await p.click('button.btn')
for (const t of [500, 2000, 5000]) {
  await p.waitForTimeout(t === 500 ? 500 : t - 500)
  const d = await p.evaluate(() => {
    const s = window.__catScene
    const cat = JSON.parse(localStorage.getItem('virtual-cat:save:v1'))
    return { cam: s.camera.position.toArray().map(n=>+n.toFixed(2)),
             tgt: s.camTarget.toArray().map(n=>+n.toFixed(2)),
             center: s.bodyCenter.toArray().map(n=>+n.toFixed(2)),
             pos: cat.pos.map(n=>+n.toFixed(2)), beh: cat.behavior }
  })
  console.log(t, JSON.stringify(d))
}
await b.close()
