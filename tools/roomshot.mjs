import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 480, height: 760 }, deviceScaleFactor: 1.6, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
const now = Date.now()
await p.addInitScript((s) => {
  localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
  localStorage.setItem('virtual-cat:quality', 'high')
}, {
  version: 1, name: 'Miro', seed: 11, birth: now - 400 * 86400000, lastTick: now,
  personality: { sociability:.6, energy:.6, timidity:.3, gluttony:.5, curiosity:.7, vocality:.5, independence:.4 },
  needs: { hunger: 70, thirst: 70, energy: 70, bladder: 80, hygiene: 85, affection: 60, stimulation: 70 },
  health: 95, stress: 15, bond: 60, illnesses: [], lastVetVisit: now,
  died: null, causeOfDeath: null, observed: [],
  bowl: { food: 120, foodKind: 'kibble', servedAt: now, water: 300, waterFilledAt: now },
  litter: { uses: 0, lastCleaned: now },
  inventory: { coins: 300, items: { kibble: 5, wand: 1, brush: 1 } },
  behavior: 'sit', behaviorSince: now, pos: [0, 0], target: null, facing: 0,
  stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
})
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => !!window.__catScene, { timeout: 60000 })
await p.waitForTimeout(6000)
await p.addStyleTag({ content: '.hud,.dock,.toast,.bubble,.loading,.notif-ask{display:none!important}' })
await p.evaluate(() => window.__catScene.freeze('sit'))
await p.waitForTimeout(1500)
// Vistas amplas do cômodo, para julgar a ambientação e não só o gato.
for (const [name, yaw, pitch, dist] of [
  ['wide', 0.7, 0.35, 3.4],
  ['corner', 2.4, 0.30, 3.2],
  ['window', 3.05, 0.22, 2.8],
  ['closecat', 0.5, 0.12, 1.1],
]) {
  await p.evaluate(([y, pi, d]) => window.__catScene.setCamera(y, pi, d), [yaw, pitch, dist])
  await p.waitForTimeout(1200)
  await p.screenshot({ path: `${out}/room-${name}.png` })
}
console.log('ok')
await b.close()
