import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 440, height: 780 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
const now = Date.now()
// O estado exato da tela do usuário: filhote de oito semanas, apavorado —
// que é quando as orelhas vão ao máximo para trás e a deformação aparecia.
await p.addInitScript((s) => {
  localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
  localStorage.setItem('virtual-cat:quality', 'high')
}, {
  version: 1, name: 'Bob', seed: 11, birth: now - 56 * 86400000, lastTick: now,
  personality: { sociability:.5, energy:.5, timidity:.6, gluttony:.5, curiosity:.5, vocality:.5, independence:.5 },
  needs: { hunger: 4, thirst: 70, energy: 6, bladder: 45, hygiene: 80, affection: 75, stimulation: 4 },
  health: 90, stress: 88, bond: 4, illnesses: [], lastVetVisit: now,
  died: null, causeOfDeath: null, observed: [],
  bowl: { food: 0, foodKind: 'kibble', servedAt: now, water: 300, waterFilledAt: now },
  litter: { uses: 0, lastCleaned: now },
  inventory: { coins: 79, items: {} },
  behavior: 'sleep', behaviorSince: now, pos: [0, 0], target: null, facing: 0.4,
  stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 0, lastDailyBonus: 0 },
})
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => !!window.__catScene, { timeout: 60000 })
await p.waitForTimeout(6000)
await p.addStyleTag({ content: '.hud,.dock,.toast,.bubble,.loading,.notif-ask{display:none!important}' })
await p.evaluate(() => { window.__catScene.freeze('sleep'); window.__catScene.setHour(13) })
// O alvo da câmera persegue o corpo com atraso: precisa de tempo para chegar.
await p.waitForTimeout(3000)
for (const [name, yaw, pitch, dist] of [
  ['cara', 0.35, 0.22, 0.9],
  ['lado', 1.6, 0.20, 1.0],
]) {
  await p.evaluate(([y, pi, d]) => window.__catScene.setCamera(y, pi, d), [yaw, pitch, dist])
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `${out}/bug-${name}.png` })
}
console.log('ok')
await b.close()
