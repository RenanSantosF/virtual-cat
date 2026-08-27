import { chromium } from 'playwright'
const out = process.argv[2]
const b = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const p = await b.newPage({ viewport: { width: 400, height: 850 }, deviceScaleFactor: 2 })
const errs = []
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message))
p.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE: ' + m.text()) })

await p.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' })
await p.screenshot({ path: `${out}/ui-adopt.png` })

await p.fill('input', 'Nina')
await p.click('button.btn')
await p.waitForTimeout(2500)
await p.screenshot({ path: `${out}/ui-game.png` })

// Percorre cada painel e cada ação do dock.
for (const [label, file] of [['Comida','ui-food'], ['Loja','ui-shop'], ['Saúde','ui-health'], ['Perfil','ui-profile']]) {
  await p.click(`button.act:has-text("${label}")`)
  await p.waitForTimeout(500)
  await p.screenshot({ path: `${out}/${file}.png` })
  await p.keyboard.press('Escape').catch(() => {})
  await p.click('.scrim', { position: { x: 200, y: 40 } })
  await p.waitForTimeout(350)
}

// Ações diretas.
for (const label of ['Água', 'Caixa', 'Bote']) {
  await p.click(`button.act:has-text("${label}")`)
  await p.waitForTimeout(400)
}
// Serve ração e confirma que o pote encheu.
await p.click('button.act:has-text("Comida")')
await p.waitForTimeout(400)
await p.click('.row:has-text("Ração seca") button.btn')
await p.waitForTimeout(300)
await p.click('.scrim', { position: { x: 200, y: 40 } })
await p.waitForTimeout(300)

// Carinho: toque e arraste sobre o gato.
const box = await p.$eval('canvas', (c) => { const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
await p.mouse.move(box.x + box.w / 2, box.y + box.h * 0.55)
await p.mouse.down()
for (let i = 0; i < 12; i++) {
  await p.mouse.move(box.x + box.w / 2 + Math.sin(i) * 20, box.y + box.h * 0.55 + i)
  await p.waitForTimeout(90)
}
await p.mouse.up()
await p.waitForTimeout(600)
await p.screenshot({ path: `${out}/ui-pet.png` })

const state = await p.evaluate(() => JSON.parse(localStorage.getItem('virtual-cat:save:v1')))
console.log('bowl.food=', Math.round(state.bowl.food), 'water=', Math.round(state.bowl.water),
            'coins=', Math.round(state.inventory.coins), 'behavior=', state.behavior,
            'affection=', Math.round(state.needs.affection), 'bond=', state.bond.toFixed(1))
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 10).join('\n') : 'no errors')
await b.close()
