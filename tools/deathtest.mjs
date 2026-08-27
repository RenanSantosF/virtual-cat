import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 400, height: 850 }, deviceScaleFactor: 2, serviceWorkers: 'block' })
const p = await ctx.newPage()
const errs = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })

function save(o) {
  const now = Date.now(), MS_DAY = 86400000
  return {
    version: 1, name: o.name || 'Tigre', seed: o.seed ?? 42,
    birth: now - (o.ageDays ?? 200) * MS_DAY,
    lastTick: now - (o.awayHours ?? 0) * 3600000,
    personality: { sociability:.7, energy:.5, timidity:.2, gluttony:.6, curiosity:.6, vocality:.4, independence:.3 },
    needs: { hunger: o.hunger ?? 70, thirst: o.thirst ?? 70, energy: 60, bladder: 70, hygiene: o.hygiene ?? 80, affection: 50, stimulation: 60 },
    health: o.health ?? 95, stress: o.stress ?? 20, bond: o.bond ?? 60,
    illnesses: o.illnesses ?? [], lastVetVisit: now - 30 * MS_DAY,
    died: o.died ?? null, causeOfDeath: o.cause ?? null, observed: [],
    bowl: { food: o.food ?? 150, foodKind: 'kibble', servedAt: now, water: o.water ?? 300, waterFilledAt: now },
    litter: { uses: 0, lastCleaned: now },
    inventory: { coins: o.coins ?? 500, items: { kibble: 3, dewormer: 1, hairballPaste: 1, brush: 1, wand: 1, litter: 2 } },
    behavior: o.behavior ?? 'sit', behaviorSince: now,
    pos: [0,0], target: null, facing: 0,
    stats: { meals: 240, plays: 31, pets: 88, vetVisits: 2, daysCaredFor: 47, lastDailyBonus: 0 },
  }
}

async function scene(name, o, act) {
  await p.addInitScript((s) => {
    localStorage.setItem('virtual-cat:save:v1', JSON.stringify(s))
    localStorage.setItem('virtual-cat:quality', 'low')
  }, save(o))
  await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
  await p.waitForTimeout(3500)
  if (act) await act()
  await p.screenshot({ path: `${out}/d-${name}.png` })
  const st = await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('virtual-cat:save:v1'))
    return { health: Math.round(c.health), died: !!c.died, cause: c.causeOfDeath,
             ill: c.illnesses.map(i => i.kind).join(',') || '-', beh: c.behavior }
  })
  console.log(name.padEnd(16), JSON.stringify(st))
}

// 1. Gato doente: a interface não pode nomear a doença em lugar nenhum.
await scene('doente', {
  health: 48, hygiene: 30, stress: 55,
  illnesses: [{ kind: 'hairball', since: Date.now() - 86400000, severity: 0.55 }],
}, async () => {
  const body = await p.textContent('body')
  const leaked = ['Bola de pelo', 'Vermes', 'Infecção urinária', 'Desidratação', 'Indigestão', 'Resfriado']
    .filter(w => body.includes(w))
  console.log('  diagnóstico vazado no HUD:', leaked.length ? leaked.join(',') : 'nenhum')
})

// 2. Painel de exame: mostra sinais, não nomes.
await scene('exame', {
  health: 40,
  illnesses: [{ kind: 'uti', since: Date.now() - 172800000, severity: 0.7 }],
}, async () => {
  await p.click('button.act:has-text("Saúde")')
  await p.waitForTimeout(600)
  const sheet = await p.textContent('.sheet')
  const leaked = ['Infecção urinária'].filter(w => sheet.includes(w))
  console.log('  nome da doença no exame:', leaked.length ? leaked.join(',') : 'nenhum (correto)')
  console.log('  emergência oferecida:', sheet.includes('emergência') ? 'sim' : 'não')
})

// 3. Consulta: aí sim o nome aparece.
await scene('consulta', {
  health: 45, coins: 900,
  illnesses: [{ kind: 'worms', since: Date.now() - 86400000, severity: 0.5 }],
}, async () => {
  await p.click('button.act:has-text("Saúde")')
  await p.waitForTimeout(500)
  await p.click('.row:has-text("Consulta e diagnóstico") button.btn')
  await p.waitForTimeout(800)
  const toast = await p.textContent('.toast').catch(() => '')
  console.log('  veterinário disse:', JSON.stringify(toast))
})

// 4. Morte: memorial, sem volta.
await scene('memorial', { died: Date.now() - 3600000, cause: 'Desidratação', health: 0 }, async () => {
  const mem = await p.$('.memorial')
  console.log('  memorial exibido:', mem ? 'sim' : 'NÃO')
  const txt = mem ? await p.textContent('.memorial') : ''
  console.log('  traz personalidade:', /Grudento|Elétrico|Curioso|Guloso|Corajoso|Falante/.test(txt) ? 'sim' : 'não')
})

// 5. Depois do memorial, a adoção lembra do anterior.
await p.click('.memorial .btn')
await p.waitForTimeout(1200)
const adopt = await p.textContent('body')
console.log('adoção lembra:', /Antes dele|gatos antes/.test(adopt) ? 'sim' : 'NÃO')

console.log(errs.length ? 'ERROS:\n' + errs.slice(0, 6).join('\n') : 'sem erros')
await b.close()
