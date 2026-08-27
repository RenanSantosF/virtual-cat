import { chromium } from 'playwright'
const URL_BASE = 'http://127.0.0.1:4190/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 400, height: 850 }, deviceScaleFactor: 2 })
const p = await ctx.newPage()
const errs = [], failed = []
p.on('pageerror', e => errs.push(e.message))
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
p.on('requestfailed', r => failed.push(r.url().slice(-60) + ' :: ' + r.failure()?.errorText))
p.on('response', r => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(-60)) })

await p.goto('http://127.0.0.1:4190/', { waitUntil: 'networkidle' })
await p.fill('input', 'Teste')
await p.click('button.btn')
await p.waitForTimeout(6000)
const st = await p.evaluate(() => ({
  scene: !!window.__catScene,
  sw: !!navigator.serviceWorker.controller || navigator.serviceWorker.getRegistrations !== undefined,
}))
console.log('cena 3D:', st.scene ? 'ok' : 'FALHOU')
const regs = await p.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.map(x => x.scope)))
console.log('service worker:', regs.length ? regs.join(',') : 'nenhum')
await p.screenshot({ path: process.argv[2] + '/pages-check.png' })
console.log('requisições com falha:', failed.length ? failed.slice(0, 5).join(' | ') : 'nenhuma')
console.log('erros:', errs.length ? errs.slice(0, 4).join(' | ') : 'nenhum')
await b.close()
