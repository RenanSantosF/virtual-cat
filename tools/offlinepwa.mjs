import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const ctx = await b.newContext({ viewport: { width: 400, height: 850 } })
const p = await ctx.newPage()
await p.goto('http://127.0.0.1:4190/', { waitUntil: 'networkidle' })
await p.fill('input', 'Offline')
await p.click('button.btn')
await p.waitForTimeout(6000)
// Espera o service worker terminar de guardar tudo em cache.
await p.evaluate(() => navigator.serviceWorker.ready)
await p.waitForTimeout(3000)

await ctx.setOffline(true)
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await p.waitForTimeout(6000)
const ok = await p.evaluate(() => ({
  temGato: !!document.querySelector('.hud-name'),
  cena: !!window.__catScene,
}))
console.log('sem rede — app abre:', ok.temGato ? 'sim' : 'NÃO', '| cena 3D:', ok.cena ? 'sim' : 'NÃO')
await b.close()
