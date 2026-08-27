import { chromium } from 'playwright'

const args = process.argv.slice(2)
const out = args[0] || 'shot.png'
const opts = JSON.parse(args[1] || '{}')

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message))

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })

// Adota o gato com estado controlado.
if (opts.seed !== undefined || opts.age !== undefined || opts.behavior) {
  await page.evaluate((o) => {
    const now = Date.now()
    const MS_DAY = 86400000
    const seed = o.seed ?? 12345
    const save = {
      version: 1, name: o.name || 'Miro', seed,
      birth: now - (o.age ?? 56) * MS_DAY,
      lastTick: now,
      personality: { sociability: .6, energy: .6, timidity: .3, gluttony: .5, curiosity: .7, vocality: .5, independence: .4 },
      needs: { hunger: 70, thirst: 70, energy: 70, bladder: 80, hygiene: 85, affection: 60, stimulation: 70, ...(o.needs||{}) },
      health: 95, stress: o.stress ?? 20, bond: o.bond ?? 60,
      illnesses: [], lastVetVisit: now,
      bowl: { food: 120, foodKind: 'kibble', servedAt: now, water: 200, waterFilledAt: now },
      litter: { uses: 0, lastCleaned: now },
      inventory: { coins: 300, items: { kibble: 5, wet: 2, litter: 3, wand: 1, brush: 1 } },
      behavior: o.behavior || 'sit', behaviorSince: now,
      pos: [0, 0], target: null, facing: o.facing ?? 0,
      stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
    }
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify(save))
    localStorage.setItem('virtual-cat:quality', o.quality || 'high')
  }, opts)
  await page.reload({ waitUntil: 'networkidle' })
} else {
  await page.fill('input', 'Miro')
  await page.click('button.btn')
}

await page.waitForTimeout(opts.wait ?? 2500)

// Trava a câmera num ângulo escolhido para poder comparar entre execuções.
if (opts.cam) {
  await page.evaluate((c) => window.__catScene?.setCamera(c[0], c[1], c[2]), opts.cam)
  await page.waitForTimeout(700)
}
if (opts.hideUi) {
  await page.addStyleTag({ content: '.hud,.dock,.toast,.bubble{display:none!important}' })
}

await page.screenshot({ path: out })
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'no console errors')
await browser.close()
