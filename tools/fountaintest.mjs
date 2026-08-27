import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
for (const [label, items, water] of [
  ['7 dias, pote comum', {}, 320],
  ['7 dias, com fonte', { fountain: 1 }, 1200],
  ['10 dias, com fonte', { fountain: 1 }, 1200],
]) {
  const hours = label.startsWith('10') ? 240 : 168
  const ctx = await b.newContext({ serviceWorkers: 'block' })
  const p = await ctx.newPage()
  const now = Date.now()
  await p.addInitScript((s) => {
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
    localStorage.setItem('virtual-cat:quality', 'low')
  }, {
    version: 1, name: 'T', seed: 7, birth: now - 200 * 86400000, lastTick: now - hours * 3600000,
    personality: { sociability:.5, energy:.5, timidity:.3, gluttony:.5, curiosity:.5, vocality:.5, independence:.5 },
    needs: { hunger: 90, thirst: 90, energy: 80, bladder: 90, hygiene: 90, affection: 70, stimulation: 80 },
    health: 100, stress: 20, bond: 50, illnesses: [], lastVetVisit: now, died: null, causeOfDeath: null, observed: [],
    bowl: { food: 900, foodKind: 'kibble', servedAt: now - hours*3600000, water, waterFilledAt: now - hours*3600000 },
    litter: { uses: 0, lastCleaned: now - hours*3600000 },
    inventory: { coins: 100, items }, behavior: 'sit', behaviorSince: now,
    pos: [0,0], target: null, facing: 0,
    stats: { meals:0, plays:0, pets:0, vetVisits:0, daysCaredFor:0, lastDailyBonus:0 },
  })
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  // O estado vivo: o gravador em disco só roda a cada cinco segundos.
  const alive = await p.waitForFunction(() => !!window.__catScene, { timeout: 20000 })
    .then(() => true).catch(() => false)
  await p.waitForTimeout(1200)
  const c = alive
    ? await p.evaluate(() => window.__catScene.cat)
    : await p.evaluate(() => JSON.parse(localStorage.getItem('virtual-cat:save:v1')))
  console.log(label.padEnd(22), JSON.stringify({ morto: !!c.died, health: Math.round(c.health),
    sede: Math.round(c.needs.thirst), agua: Math.round(c.bowl.water) }))
  await ctx.close()
}
await b.close()
