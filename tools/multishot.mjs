import { chromium } from 'playwright'
const [outDir, spec] = process.argv.slice(2)
const shots = JSON.parse(spec)
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 420, height: 760 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
for (const s of shots) {
  await page.evaluate((o) => {
    const now = Date.now(), MS_DAY = 86400000
    localStorage.setItem('virtual-cat:quality', o.quality || 'high')
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify({
      version: 1, name: 'Miro', seed: o.seed ?? 11, birth: now - (o.age ?? 400) * MS_DAY, lastTick: now,
      personality: { sociability: .6, energy: .6, timidity: .3, gluttony: .5, curiosity: .7, vocality: .5, independence: .4 },
      needs: { hunger: 70, thirst: 70, energy: 70, bladder: 80, hygiene: 85, affection: 60, stimulation: 70 },
      health: 95, stress: o.stress ?? 15, bond: 60, illnesses: [], lastVetVisit: now,
      bowl: { food: 120, foodKind: 'kibble', servedAt: now, water: 200, waterFilledAt: now },
      litter: { uses: 0, lastCleaned: now },
      inventory: { coins: 300, items: { kibble: 5, wand: 1, brush: 1 } },
      behavior: o.behavior || 'sit', behaviorSince: now,
      pos: [0, 0], target: null, facing: o.facing ?? 0,
      stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
    }))
  }, s)
  await page.reload({ waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '.hud,.dock,.toast,.bubble{display:none!important}' })
  await page.waitForTimeout(s.wait ?? 1800)
  await page.evaluate((b) => window.__catScene?.freeze(b), s.behavior || 'idle')
  await page.waitForTimeout(900)
  if (s.cam) {
    await page.evaluate((c) => window.__catScene?.setCamera(c[0], c[1], c[2]), s.cam)
    await page.waitForTimeout(700)
  }
  await page.screenshot({ path: `${outDir}/${s.name}.png` })
}
console.log(errors.length ? errors.slice(0,8).join('\n') : 'ok')
await browser.close()
