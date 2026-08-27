import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 420, height: 760 }, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
const now = Date.now()
const ageDays = Number(process.argv[2] ?? 400)
await p.addInitScript((s) => {
  localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
  localStorage.setItem('virtual-cat:quality', 'low')
}, {
  version: 1, name: 'M', seed: 11, birth: now - ageDays * 86400000, lastTick: now,
  personality: { sociability:.6, energy:.6, timidity:.2, gluttony:.6, curiosity:.6, vocality:.4, independence:.3 },
  // Com fome e o pote cheio: ele tem de atravessar a sala até comer.
  needs: { hunger: 20, thirst: 70, energy: 80, bladder: 80, hygiene: 85, affection: 60, stimulation: 70 },
  health: 95, stress: 10, bond: 60, illnesses: [], lastVetVisit: now,
  died: null, causeOfDeath: null, observed: [],
  bowl: { food: 200, foodKind: 'kibble', servedAt: now, water: 300, waterFilledAt: now },
  litter: { uses: 0, lastCleaned: now },
  inventory: { coins: 300, items: { kibble: 5 } },
  behavior: 'sit', behaviorSince: now,
  pos: [-1.9, 1.6], target: null, facing: 0,
  stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
})
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => !!window.__catScene, { timeout: 60000 })
await p.waitForTimeout(4000)
console.log(`idade ${ageDays}d   t     pos            gait   vel   passada  comport.`)
for (let i = 0; i < 26; i++) {
  const d = await p.evaluate(() => {
    const s = window.__catScene, c = s.cat
    return { pos: c.pos.map(n => +n.toFixed(2)), beh: c.behavior,
             gait: s.motionDebug.gait, speed: +s.motionDebug.speed.toFixed(2),
             stride: +s.motionDebug.stridePhase.toFixed(2), hunger: Math.round(c.needs.hunger) }
  })
  console.log(String(i * 0.7).padStart(10), JSON.stringify(d.pos).padEnd(15),
    d.gait.padEnd(6), String(d.speed).padStart(5), String(d.stride).padStart(8), '  ' + d.beh)
  await p.waitForTimeout(700)
}
await b.close()
