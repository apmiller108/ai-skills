#!/usr/bin/env node
// Build a verification plan's Markdown doc and interactive runner from one
// plan JSON file, so the two never drift.
//
//   node build.mjs <plan.json> [--md <out.md>] [--html <out.html>] [--results <dir>] [--max-cases <n>] [--summary]
//
// --results reads docs saved by `ArtifactData list ... out_dir=<dir>` (the
// results/ and findings/ collections) and fills the Markdown status cells.
// --max-cases warns when the plan has more than n cases. Setup (section S) doesn't count.
// --summary prints each case's recorded verdict, values and notes.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const planPath = args.find(a => !a.startsWith('--') && !isFlagValue(a))
function isFlagValue(a) { const i = args.indexOf(a); return i > 0 && args[i - 1].startsWith('--') }
const flag = n => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined }

if (!planPath) {
  console.error('usage: node build.mjs <plan.json> [--md out.md] [--html out.html] [--results dir] [--max-cases n] [--summary]')
  process.exit(2)
}
const maxCases = args.includes('--max-cases') ? Number(flag('max-cases')) : Infinity
if (maxCases !== Infinity && !(Number.isInteger(maxCases) && maxCases > 0)) {
  console.error('error: --max-cases needs a positive whole number')
  process.exit(2)
}
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))

// ---------- Validate ----------
const errors = []
const warn = []
const platIds = (plan.platforms || []).map(p => p.id)
if (!plan.id || !/^[a-z0-9-]+$/.test(plan.id)) errors.push('plan.id must be kebab-case')
if (!plan.title) errors.push('plan.title is required')
if (!platIds.length) errors.push('plan.platforms needs at least one platform')
const ids = new Set()
for (const i of plan.items || []) {
  if (ids.has(i.id)) errors.push(`duplicate item id ${i.id}`)
  ids.add(i.id)
  if (!['check', 'observe'].includes(i.type)) errors.push(`${i.id}: type must be check or observe`)
  if (!i.plats || !Object.keys(i.plats).length) errors.push(`${i.id}: plats is empty`)
  for (const [p, v] of Object.entries(i.plats || {})) {
    if (!platIds.includes(p)) errors.push(`${i.id}: unknown platform ${p}`)
    if (!['req', 'opt'].includes(v)) errors.push(`${i.id}: plats.${p} must be req or opt`)
  }
  if (plan.sections && !plan.sections[i.sec]) errors.push(`${i.id}: unknown section ${i.sec}`)
  for (const r of i.risks || []) if (!(plan.risks || {})[r]) errors.push(`${i.id}: unknown risk ${r}`)
  const keys = new Set()
  for (const f of i.fields || []) {
    if (keys.has(f.k)) errors.push(`${i.id}: duplicate field ${f.k}`)
    keys.add(f.k)
    if (f.kind === 'select' && !Array.isArray(f.opts)) errors.push(`${i.id}.${f.k}: select needs opts`)
  }
  if (!(i.steps || []).length) warn.push(`${i.id}: no steps`)
  if (i.type === 'check' && !(i.expect || []).length && !(i.steps || []).length) warn.push(`${i.id}: check with no expected results`)
  if (i.type === 'observe' && !(i.fields || []).length) warn.push(`${i.id}: observe with no fields to record`)
}
for (const [p, list] of Object.entries(plan.order || {})) {
  if (!platIds.includes(p)) errors.push(`order: unknown platform ${p}`)
  for (const id of list) if (!ids.has(id)) errors.push(`order.${p}: unknown item ${id}`)
  const applicable = (plan.items || []).filter(i => i.plats[p]).map(i => i.id)
  for (const id of applicable) if (!list.includes(id)) errors.push(`order.${p} is missing ${id}, which applies to ${p}`)
}
for (const [p, phases] of Object.entries(plan.phases || {})) {
  const list = (plan.order && plan.order[p]) || (plan.items || []).map(i => i.id)
  let last = -1
  for (const ph of phases) {
    const k = list.indexOf(ph.start)
    if (k < 0) errors.push(`phases.${p}: ${ph.start} is not in the order`)
    else if (k <= last) errors.push(`phases.${p}: ${ph.name} starts before the previous phase`)
    last = k
  }
}
for (const c of plan.exit || []) {
  for (const r of [...(c.items || []), ...(c.fields || [])]) {
    const it = (plan.items || []).find(i => i.id === r.id)
    if (!it) errors.push(`exit "${c.text}": unknown item ${r.id}`)
    else if (!it.plats[r.plat]) errors.push(`exit "${c.text}": ${r.id} doesn't apply to ${r.plat}`)
    else if (r.field && !(it.fields || []).some(f => f.k === r.field)) errors.push(`exit "${c.text}": ${r.id} has no field ${r.field}`)
  }
}
for (const p of plan.platforms || []) for (const m of p.meta || []) {
  const it = (plan.items || []).find(i => i.id === m.item)
  if (!it || !(it.fields || []).some(f => f.k === m.field)) errors.push(`platforms.${p.id}.meta: ${m.item}.${m.field} doesn't exist`)
}
// {{ITEM.field}} references. Each must resolve on every platform that shows it, to a field
// recorded no later than the case that uses it. Anything else in {{ }} is literal text
// unless it starts like a case id. The runner has its own copy of REF and the lookup.
const REF = /(?<!\$)\{\{([\w-]+\.[\w-]+(?:\|[\w-]+\.[\w-]+)*)\}\}/g
const itemById = Object.fromEntries((plan.items || []).map(i => [i.id, i]))
const onlyFor = (x, p) => !x.only || [].concat(x.only).includes(p)
const refAlts = spec => spec.split('|').map(a => { const [id, k] = a.split('.'); return { id, k, f: ((itemById[id] || {}).fields || []).find(f => f.k === k) } })
const isRef = spec => refAlts(spec).some(a => itemById[a.id] || /^[A-Z]+\d+$/.test(a.id))
function checkRefs(i, text, plats) {
  for (const [m, spec] of String(text || '').matchAll(REF)) {
    if (!isRef(spec)) continue
    const bad = refAlts(spec).filter(a => !a.f)
    for (const a of bad) errors.push(`${i.id}: ${m}: ${itemById[a.id] ? `${a.id} has no field ${a.k}` : `unknown item ${a.id}`}`)
    if (bad.length) continue
    for (const a of refAlts(spec)) if (a.f.kind === 'area') errors.push(`${i.id}: ${m}: ${a.id}.${a.k} is an area field; a value used in steps needs a one-line field`)
    for (const p of plats) {
      const src = refAlts(spec).find(a => (itemById[a.id].plats || {})[p] && onlyFor(a.f, p))
      if (!src) { errors.push(`${i.id}: ${m} has no value on ${p}: add an alternative that applies there ({{A.x|B.x}}), or limit the step with only`); continue }
      const list = (plan.order && plan.order[p]) || plan.items.map(x => x.id)
      if (list.indexOf(src.id) > list.indexOf(i.id)) errors.push(`${i.id}: ${m}: ${src.id} runs after ${i.id} on ${p}`)
    }
  }
}
for (const i of plan.items || []) {
  const shown = x => Object.keys(i.plats || {}).filter(p => onlyFor(x, p))
  for (const s of i.steps || []) { checkRefs(i, s.t, shown(s)); checkRefs(i, s.cmd, shown(s)) }
  for (const e of i.expect || []) checkRefs(i, typeof e === 'string' ? e : e.t, shown(e))
  for (const [p, t] of Object.entries(i.notes || {})) checkRefs(i, t, (i.plats || {})[p] ? [p] : [])
}
const caseCount = (plan.items || []).filter(i => i.sec !== 'S').length
if (caseCount > maxCases) {
  warn.push(`${caseCount} cases, over the cap of ${maxCases}: remove the ${caseCount - maxCases} covering the least serious risks and report them as cut. Don't merge cases or move them to Setup to get under it`)
}
warn.forEach(w => console.warn('warn:', w))
if (errors.length) {
  errors.forEach(e => console.error('error:', e))
  process.exit(1)
}

// ---------- Results (optional) ----------
const results = {}
const newFindings = []
const resultsDir = flag('results')
if (resultsDir) {
  const read = sub => {
    const dir = path.join(resultsDir, sub)
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
      return doc && doc.data && typeof doc.data === 'object' ? doc.data : doc
    })
  }
  for (const r of read('results')) if (r.plat && r.id) results[`${r.plat}-${r.id}`] = r
  newFindings.push(...read('findings').sort((a, b) => a.n - b.n))
}

// ---------- Markdown ----------
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
// The Markdown covers every platform, so a reference shows where its value comes from.
const refNames = (s, open = '‹', close = '›') => String(s ?? '').replace(REF, (m, spec) => {
  if (!isRef(spec)) return m
  const alts = refAlts(spec)
  return `${open}${alts[0].f.label || alts[0].k} from ${alts.map(a => a.id).join('/')}${close}`
})
const date = iso => (iso || '').slice(0, 10)
function statusCell(item, p) {
  if (!item.plats[p]) return '—'
  const r = results[`${p}-${item.id}`]
  if (r && r.status) {
    const d = date(r.at)
    return {
      pass: `✓ ${d}`, recorded: `✓ ${d}`, fail: `✗${r.finding ? ` → finding ${r.finding}` : ''}`,
      finding: `✗${r.finding ? ` → finding ${r.finding}` : ''}`, blocked: `blocked ${d}`, skip: 'skipped'
    }[r.status]
  }
  if (item.prior && item.prior[p]) return item.prior[p]
  return item.plats[p] === 'opt' ? '○' : ''
}
const expectText = i => (i.expect || []).map(e => {
  if (typeof e === 'string') return refNames(e)
  const only = e.only ? ` (${[].concat(e.only).map(p => labelOf(p)).join(', ')})` : ''
  return refNames(e.t) + only
}).join('; ')
const labelOf = p => { const x = plan.platforms.find(q => q.id === p); return x.short || x.label }
const platCols = platIds.map(labelOf)

let md = `# ${plan.title}\n\n<!-- Generated by the verification-plan skill from ${path.basename(planPath)}. Edit the JSON and rebuild; hand edits here are overwritten. -->\n\n`
if (plan.intro) md += `${plan.intro.trim()}\n\n`
if (plan.scope) md += `## Scope\n\n${plan.scope.trim()}\n\n`
if ((plan.covered || []).length) {
  md += `## Already covered\n\n| Layer | What | Runs where |\n|---|---|---|\n`
  plan.covered.forEach(c => { md += `| ${cell(c.layer)} | ${cell(c.what)} | ${cell(c.where)} |\n` })
  md += '\n'
  if (plan.coveredGap) md += `${plan.coveredGap.trim()}\n\n`
}
const riskIds = Object.keys(plan.risks || {})
if (riskIds.length) {
  md += `## Risks and where each is tested\n\n| # | Risk | ${platCols.join(' | ')} |\n|---|---|${platIds.map(() => '---|').join('')}\n`
  for (const r of riskIds) {
    const marks = platIds.map(p => {
      const its = plan.items.filter(i => (i.risks || []).includes(r) && i.plats[p])
      if (its.some(i => i.plats[p] === 'req')) return '●'
      return its.length ? '○' : ''
    })
    md += `| ${r} | ${cell(plan.risks[r])} | ${marks.join(' | ')} |\n`
  }
  md += `\n● required, ○ optional. Derived from the cases that cite each risk.\n\n`
}
if (plan.setup) md += `## Setup\n\n${plan.setup.trim()}\n\n`

md += `## Test cases\n\nIDs are stable; add, don't renumber. Status: \`✓ date\` passed, \`✗ → finding #\`, \`—\` not applicable, \`○\` optional, blank = not run. Run the cases in the interactive runner; it holds the steps and records results.\n\n`
for (const [sec, name] of Object.entries(plan.sections || { _: 'Cases' })) {
  const its = plan.items.filter(i => (i.sec || '_') === sec)
  if (!its.length) continue
  md += `### ${sec === '_' ? '' : sec + '. '}${name}\n\n`
  if (plan.sectionNotes && plan.sectionNotes[sec]) md += `${plan.sectionNotes[sec].trim()}\n\n`
  md += `| ID | Case | Expected | ${platCols.join(' | ')} |\n|---|---|---|${platIds.map(() => '---|').join('')}\n`
  its.forEach(i => { md += `| ${i.id} | ${cell(i.title)} | ${cell(expectText(i) || (i.type === 'observe' ? 'Record: ' + (i.fields || []).map(f => f.label).join(', ') : ''))} | ${platIds.map(p => statusCell(i, p)).join(' | ')} |\n` })
  md += `\n<details><summary>Steps</summary>\n\n`
  its.forEach(i => {
    md += `**${i.id}. ${i.title}**${i.why ? ` ${i.why}` : ''}\n\n`
    ;(i.steps || []).forEach((s, n) => {
      const only = s.only ? ` *(${[].concat(s.only).map(labelOf).join(', ')})*` : ''
      md += `${n + 1}. ${refNames(s.t)}${only}\n`
      if (s.cmd) md += `   \`\`\`\n${refNames(s.cmd, '<', '>').split('\n').map(l => '   ' + l).join('\n')}\n   \`\`\`\n`
    })
    md += '\n'
  })
  md += `</details>\n\n`
}
if (plan.order && platIds.length) {
  md += `## Run order\n\n`
  platIds.forEach(p => {
    const phases = (plan.phases && plan.phases[p]) || []
    const list = plan.order[p]
    md += `**${labelOf(p)}:** ${phases.length ? phases.map((ph, k) => {
      const s = list.indexOf(ph.start); const e = k + 1 < phases.length ? list.indexOf(phases[k + 1].start) : list.length
      return `${ph.name} (${list.slice(s, e).join(', ')})`
    }).join(' → ') : list.join(', ')}\n\n`
  })
}
for (const x of plan.extra || []) md += `## ${x.heading}\n\n${x.body.trim()}\n\n`
if ((plan.exit || []).length) {
  md += `## Exit criteria\n\n`
  plan.exit.forEach(c => { md += `- [ ] ${c.text}\n` })
  md += '\n'
}
md += `## Run log\n\n| Date | Platform | Build (commit) | Cases | Findings |\n|---|---|---|---|---|\n`
;(plan.runLog || []).forEach(r => { md += `| ${cell(r.date)} | ${cell(r.platform)} | ${cell(r.build)} | ${cell(r.cases)} | ${cell(r.findings)} |\n` })
md += `\n## Findings\n\nNumbered; referenced from the status cells.\n\n`
;[...(plan.findings || []), ...newFindings].forEach(f => {
  md += `${f.n}. **${f.title}**${f.ref ? ` (${f.plat ? labelOf(f.plat) + ' ' : ''}${f.ref})` : ''}. ${String(f.body || '').replace(/\n+/g, ' ')}\n`
})

// ---------- HTML ----------
const template = fs.readFileSync(path.join(here, '..', 'assets', 'runner.html'), 'utf8')
const json = JSON.stringify(plan).replace(/</g, '\\u003c').replace(/[\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16))
const htmlTitle = (plan.pageTitle || plan.title).replace(/[<&]/g, '')
if (!template.includes('/*__PLAN__*/null')) { console.error('error: runner.html lost its /*__PLAN__*/ marker'); process.exit(1) }
const html = template.replace('__TITLE__', htmlTitle).replace('/*__PLAN__*/null', () => json)

const mdOut = flag('md')
const htmlOut = flag('html')
if (mdOut) fs.writeFileSync(mdOut, md)
if (htmlOut) fs.writeFileSync(htmlOut, html)
const counts = platIds.map(p => `${labelOf(p)} ${plan.items.filter(i => i.plats[p] === 'req').length} req / ${plan.items.filter(i => i.plats[p] === 'opt').length} opt`).join(', ')
console.log(`ok: ${plan.items.length} cases (${counts})${resultsDir ? `, ${Object.keys(results).length} results, ${newFindings.length} new findings` : ''}`)
if (mdOut) console.log(`md:   ${mdOut}`)
if (htmlOut) console.log(`html: ${htmlOut}`)
if (!mdOut && !htmlOut && !args.includes('--summary')) console.log('(validated only; pass --md and/or --html to write files)')

// --summary: one line per case and platform, then findings, for an
// orchestrator that needs the verdicts without the whole Markdown doc.
if (args.includes('--summary')) {
  const order = p => (plan.order && plan.order[p]) || plan.items.map(i => i.id)
  const byId = Object.fromEntries(plan.items.map(i => [i.id, i]))
  for (const p of platIds) for (const id of order(p)) {
    const i = byId[id]
    if (!i || !i.plats[p]) continue
    const r = results[`${p}-${id}`] || {}
    const vals = (i.fields || []).filter(f => (r.fields || {})[f.k]).map(f => `${f.k}=${cell(r.fields[f.k])}`).join('; ')
    const extra = [vals, r.notes && `notes: ${cell(r.notes)}`].filter(Boolean).join(' | ')
    console.log(`${labelOf(p)} ${id} [${i.plats[p]}] ${r.status || 'open'}${r.at ? ' ' + r.at : ''}${extra ? ' — ' + extra : ''}`)
  }
  newFindings.forEach(f => console.log(`finding ${f.n}${f.ref ? ` (${f.ref})` : ''}: ${cell(f.title)} — ${cell(f.body)}`))
}
