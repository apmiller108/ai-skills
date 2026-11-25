// Headless check of a built runner: renders, fills in recorded
// values, records a verdict, exports.
//   NODE_PATH=<node_modules with jsdom> node smoke.cjs <runner.html>
const { JSDOM } = require('jsdom')
const fs = require('fs')
const html = fs.readFileSync(process.argv[2], 'utf8')
const dom = new JSDOM(`<!doctype html><body>${html}</body>`, { runScripts: 'dangerously', url: 'https://smoke.test/' })
const w = dom.window, d = w.document
const errs = []
let copied = ''
Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: async t => { copied = t } } })
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
  // Every {{ITEM.field}} reference: record its field, then look for the value in the
  // case that uses it and in what its Copy button copies.
  let checked = 0
  for (const b of plats.length ? plats : [null]) {
    if (b) b.click()
    const ids = [...d.querySelectorAll('.nav-item[data-go]:not([data-go="__summary"])')].map(n => n.dataset.go)
    const go = id => q(`.nav-item[data-go="${id}"]`).click()
    for (const id of ids) {
      go(id)
      for (const spec of new Set([...d.querySelectorAll('[data-ref]')].map(e => e.dataset.ref))) {
        let input
        for (const alt of spec.split('|')) {
          const [src, k] = alt.split('.')
          if (!ids.includes(src)) continue
          go(src)
          if ((input = q(`[data-field="${k}"]`))) break
        }
        if (!input) fail(`${id}: no field to record for {{${spec}}}`)
        const value = input.tagName === 'SELECT' ? input.options[input.options.length - 1].value : 'smoke $& value'
        input.value = value
        input.dispatchEvent(new w.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
        go(id)
        for (const e of d.querySelectorAll(`[data-ref="${spec}"]`)) {
          if (e.textContent !== value) fail(`${id}: {{${spec}}} shows "${e.textContent}"`)
          const cmd = e.closest('.cmd')
          if (!cmd) continue
          cmd.querySelector('[data-copy]').click()
          if (!copied.includes(value)) fail(`${id}: Copy left out {{${spec}}}: ${copied}`)
        }
        checked++
      }
    }
  }
  if (checked) console.log(`references filled: ${checked}`)
  q('[data-verdict]').click()
  q('[data-go="__summary"]').click()
  const exp = q('#exportText') && q('#exportText').value
  if (!exp || !/\| ✓ pass|\| recorded/.test(exp)) fail('export missing the recorded verdict')
  console.log(`exit criteria: ${d.querySelectorAll('.crit li').length}, export ${exp.length} chars`)
  if (errs.length) fail('script errors')
  console.log('ok')
}, 50)
