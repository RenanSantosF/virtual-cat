import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 480, height: 480 }, deviceScaleFactor: 1.8, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
const now = Date.now()
await p.addInitScript((s) => {
  localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
  localStorage.setItem('virtual-cat:quality', 'high')
}, {
  version: 1, name: 'M', seed: 11, birth: now - 400 * 86400000, lastTick: now,
  personality: { sociability:.6, energy:.5, timidity:.3, gluttony:.5, curiosity:.6, vocality:.5, independence:.4 },
  needs: { hunger: 70, thirst: 70, energy: 70, bladder: 80, hygiene: 85, affection: 60, stimulation: 70 },
  health: 95, stress: Number(process.argv[3] ?? 15), bond: 60, illnesses: [], lastVetVisit: now,
  died: null, causeOfDeath: null, observed: [],
  bowl: { food: 120, foodKind: 'kibble', servedAt: now, water: 300, waterFilledAt: now },
  litter: { uses: 0, lastCleaned: now },
  inventory: { coins: 300, items: { kibble: 5 } },
  behavior: 'sit', behaviorSince: now, pos: [0, 0.2], target: null, facing: 0,
  stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
})
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => !!window.__catScene, { timeout: 60000 })
await p.waitForTimeout(5000)
await p.addStyleTag({ content: '.hud,.dock,.toast,.bubble,.loading,.notif-ask{display:none!important}' })
await p.evaluate(() => { window.__catScene.freeze('sit'); window.__catScene.setHour(12) })
await p.waitForTimeout(1200)
await p.evaluate(() => window.__catScene.setCamera(0.25, 0.12, 0.55))
// Vários instantes seguidos: o piscar é rápido e só aparece se amostrarmos.
for (let i = 0; i < 6; i++) {
  await p.waitForTimeout(520)
  await p.screenshot({ path: `${out}/face-${i}.png` })
}
console.log('ok')
await b.close()
