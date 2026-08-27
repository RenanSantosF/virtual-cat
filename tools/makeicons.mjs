import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
for (const size of [192, 512]) {
  const ctx = await b.newContext(Object.assign({ viewport: { width: 512, height: 512 } }, { serviceWorkers: 'block' }))
const p = await ctx.newPage()
  await p.goto('file://' + process.cwd() + '/tools/icon.html')
  const el = await p.$('.i')
  await el.screenshot({ path: `public/icon-${size}.png`, scale: 'css' })
  if (size !== 512) {
    await p.setViewportSize({ width: size, height: size })
  }
  await p.close()
}
console.log('icons written')
await b.close()
