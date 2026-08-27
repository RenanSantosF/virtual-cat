import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 400, height: 850 } })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })

async function scenario(name, hoursAway, setup) {
  // O save precisa entrar antes de qualquer script da página: o flush do
  // pagehide da carga anterior sobrescreveria um localStorage escrito depois.
  await p.addInitScript(([h, s]) => {
    const now = Date.now(), MS_DAY = 86400000
    const save = {
      version: 1, name: 'T', seed: 7, birth: now - 90 * MS_DAY,
      lastTick: now - h * 3600000,
      personality: { sociability:.5, energy:.5, timidity:.3, gluttony:.5, curiosity:.5, vocality:.5, independence:.5 },
      needs: { hunger: 90, thirst: 90, energy: 80, bladder: 90, hygiene: 90, affection: 70, stimulation: 80 },
      health: 100, stress: 20, bond: 50, illnesses: [], lastVetVisit: now - 10 * MS_DAY,
      bowl: { food: s.food, foodKind: 'kibble', servedAt: now - h * 3600000, water: s.water, waterFilledAt: now - h * 3600000 },
      litter: { uses: 0, lastCleaned: now - h * 3600000 },
      inventory: { coins: 100, items: {} },
      behavior: 'sit', behaviorSince: now - h * 3600000,
      pos: [0,0], target: null, facing: 0,
      stats: { meals:0, plays:0, pets:0, vetVisits:0, daysCaredFor:0, lastDailyBonus:0 },
    }
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify(save))
    localStorage.setItem('virtual-cat:quality', 'low')
  }, [hoursAway, setup])
  await p.reload({ waitUntil: 'networkidle' })
  await p.waitForTimeout(1200)
  const r = await p.evaluate(() => {
    // Lê o estado vivo: o gravador em disco só roda a cada cinco segundos.
    const c = window.__catScene.cat
    return { hunger: Math.round(c.needs.hunger), thirst: Math.round(c.needs.thirst),
             energy: Math.round(c.needs.energy), bladder: Math.round(c.needs.bladder),
             health: Math.round(c.health), food: Math.round(c.bowl.food),
             water: Math.round(c.bowl.water), litter: c.litter.uses,
             ill: c.illnesses.map(i => i.kind).join(',') || '-' }
  })
  console.log(name.padEnd(34), JSON.stringify(r))
}

await scenario('8h fora, pote cheio', 8, { food: 300, water: 320 })
await scenario('24h fora, pote cheio', 24, { food: 300, water: 320 })
await scenario('24h fora, pote VAZIO', 24, { food: 0, water: 0 })
await scenario('72h fora, pote VAZIO', 72, { food: 0, water: 0 })
await scenario('7 dias fora, pote cheio', 168, { food: 800, water: 320 })
await scenario('12h fora, pote cheio', 12, { food: 200, water: 320 })
await scenario('36h fora, pote cheio', 36, { food: 400, water: 320 })
console.log(errs.length ? 'ERRORS: ' + errs.join('|') : 'no errors')
await b.close()
