// Headless check of a built runner: renders, records a verdict, exports.
//   NODE_PATH=<node_modules with jsdom> node smoke.cjs <runner.html>
const { JSDOM } = require('jsdom')
const fs = require('fs')
const html = fs.readFileSync(process.argv[2], 'utf8')
const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'dangerously', url: 'https://smoke.test/' })
const w = dom.window, d = w.document
const errs = []
w.addEventListener('error', e => errs.push(e.message))
setTimeout(() => {
  const q = s => d.querySelector(s)
  const fail = m => { console.error('FAIL:', m, errs); process.exit(1) }
  if (!q('h1')) fail('no case rendered')
  const plats = [...d.querySelectorAll('#platBar button')]
  for (const b of plats.length ? plats : [null]) {
    if (b) b.click()
    const n = d.querySelectorAll('.nav-item[data-go]:not([data-go="__summary"])').length
    console.log(`${b ? b.textContent.trim() : 'single platform'}: ${n} cases, first "${q('h1').textContent}"`)
  }
  q('[data-verdict]').click()
  q('[data-go="__summary"]').click()
  const exp = q('#exportText') && q('#exportText').value
  if (!exp || !/\| ✓ pass|\| recorded/.test(exp)) fail('export missing the recorded verdict')
  console.log(`exit criteria: ${d.querySelectorAll('.crit li').length}, export ${exp.length} chars`)
  if (errs.length) fail('script errors')
  console.log('ok')
}, 50)
