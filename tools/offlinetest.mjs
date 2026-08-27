import { chromium } from 'playwright'

const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const errs = []

function save(hoursAway, s) {
  const now = Date.now(), MS_DAY = 86400000
  return {
    version: 1, name: 'T', seed: 7, birth: now - 90 * MS_DAY,
    lastTick: now - hoursAway * 3600000,
    personality: { sociability:.5, energy:.5, timidity:.3, gluttony:.5, curiosity:.5, vocality:.5, independence:.5 },
    needs: { hunger: 90, thirst: 90, energy: 80, bladder: 90, hygiene: 90, affection: 70, stimulation: 80 },
    health: 100, stress: 20, bond: 50, illnesses: [], lastVetVisit: now - 10 * MS_DAY,
    died: null, causeOfDeath: null, observed: [],
    bowl: { food: s.food, foodKind: 'kibble', servedAt: now - hoursAway * 3600000, water: s.water, waterFilledAt: now - hoursAway * 3600000 },
    litter: { uses: 0, lastCleaned: now - hoursAway * 3600000 },
    inventory: { coins: 100, items: {} },
    behavior: 'sit', behaviorSince: now - hoursAway * 3600000,
    pos: [0,0], target: null, facing: 0,
    stats: { meals:0, plays:0, pets:0, vetVisits:0, daysCaredFor:0, lastDailyBonus:0 },
  }
}

// Um contexto por cenário: o estado precisa entrar antes de qualquer script da
// página, e reaproveitar a aba deixava o save anterior sobreviver ao recarregar.
async function scenario(name, hoursAway, setup) {
  const ctx = await b.newContext({ serviceWorkers: 'block' })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => errs.push(e.message))
  await p.addInitScript((s) => {
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
    localStorage.setItem('virtual-cat:quality', 'low')
  }, save(hoursAway, setup))
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  // Um gato morto não tem cena: a tela vira memorial. O estado ainda está no
  // armazenamento, e é de lá que o teste lê nesse caso.
  const alive = await p
    .waitForFunction(() => !!window.__catScene, { timeout: 20000 })
    .then(() => true)
    .catch(() => false)
  if (!alive) {
    const c = await p.evaluate(() => JSON.parse(localStorage.getItem('virtual-cat:save:v1')))
    console.log(name.padEnd(30), JSON.stringify({ morto: true, causa: c.causeOfDeath, health: Math.round(c.health) }))
    await ctx.close()
    return
  }
  await p.waitForTimeout(1200)
  const r = await p.evaluate(() => {
    const c = window.__catScene.cat
    return { hunger: Math.round(c.needs.hunger), thirst: Math.round(c.needs.thirst),
             energy: Math.round(c.needs.energy), bladder: Math.round(c.needs.bladder),
             health: Math.round(c.health), food: Math.round(c.bowl.food),
             water: Math.round(c.bowl.water), litter: c.litter.uses,
             morto: !!c.died,
             ill: c.illnesses.map((i) => i.kind).join(',') || '-' }
  })
  console.log(name.padEnd(30), JSON.stringify(r))
  await ctx.close()
}

await scenario('8h fora, pote cheio', 8, { food: 300, water: 320 })
await scenario('24h fora, pote cheio', 24, { food: 300, water: 320 })
await scenario('24h fora, pote VAZIO', 24, { food: 0, water: 0 })
await scenario('72h fora, pote VAZIO', 72, { food: 0, water: 0 })
await scenario('120h fora, pote VAZIO', 120, { food: 0, water: 0 })
await scenario('7 dias fora, pote cheio', 168, { food: 800, water: 320 })
console.log(errs.length ? 'ERROS: ' + errs.slice(0, 4).join(' | ') : 'sem erros')
await b.close()
