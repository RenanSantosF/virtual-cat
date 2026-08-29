import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 380, height: 340 }, deviceScaleFactor: 1.4, serviceWorkers: 'block' })
const p = await ctx.newPage()
p.on('pageerror', e => console.log('ERR', e.message))
p.on('console', m => { if (m.type()==='error') console.log('CONSOLE', m.text()) })
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
  behavior: 'idle', behaviorSince: now, pos: [0, 0], target: null, facing: 1.2,
  stats: { meals: 0, plays: 0, pets: 0, vetVisits: 0, daysCaredFor: 3, lastDailyBonus: 0 },
})
await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.waitForFunction(() => !!window.__catScene, { timeout: 60000 })
await p.waitForTimeout(6000)
await p.addStyleTag({ content: '.hud,.dock,.toast,.bubble,.loading,.notif-ask{display:none!important}' })
console.log('clipes:', await p.evaluate(() => window.__catScene.clipes.join(' ')))
await p.evaluate(() => { window.__catScene.setCamera(1.5, 0.16, 1.5); window.__catScene.setHour(11) })

// sequência pedida: em pé -> dormindo, capturando o caminho inteiro
const seq = JSON.parse(process.argv[3] || '["idle","sleep","idle"]')
const passos = Number(process.argv[4] || 14)
let n = 0
for (const beh of seq) {
  await p.evaluate((x) => window.__catScene.freeze(x), beh)
  for (let i = 0; i < passos; i++) {
    await p.waitForTimeout(260)
    const clipe = await p.evaluate(() => window.__catScene.clipeAtual)
    await p.screenshot({ path: `${out}/seq-${String(n).padStart(2,'0')}-${clipe}.png` })
    n++
  }
}
console.log('ok', n, 'quadros')
await b.close()
