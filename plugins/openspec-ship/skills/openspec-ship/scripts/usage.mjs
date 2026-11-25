#!/usr/bin/env node
// Token usage per agent, read from Claude Code transcripts.
//
//   node usage.mjs --state <state.md> [--save] [--json]
//   node usage.mjs --session <id>[@<since>] … --agent <id>=<label> … [--json]
//
// --state takes both lists from a ship's state file (`sessions:` and `agents:`);
// --save also writes the table to its `usage:` block.
// --session adds that session's main agent (the orchestrator). `@<since>`, an ISO
// time, ignores what the session did before then.
// --agent limits the table to these agents and the ones they spawned. Without it,
// every agent in the sessions is listed.
// --root overrides ~/.claude/projects.
//
// One API response is written as several transcript lines (one per content block),
// each repeating the same message id and usage, so usage is counted once per id. A
// forked agent's transcript also repeats a message of its parent; that stays with the
// parent. Missing transcripts give "usage unavailable" and exit 0.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function usageError(msg) {
  console.error(`error: ${msg}\nusage: node usage.mjs [--state file [--save]] [--session id[@since]]… [--agent id=label]… [--json] [--root dir]`)
  process.exit(2)
}

// ---------- Arguments ----------
let root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'projects')
let stateFile, save = false, asJson = false
const sessions = new Map() // id -> since (ms)
const wanted = new Map() // agent id -> label
function addSession(id, since, bad = usageError) {
  if (!/^[\w-]+$/.test(id)) return bad(`bad session id ${id}`)
  const ms = since ? Date.parse(since) : 0
  if (Number.isNaN(ms)) return bad(`bad time ${since}`)
  sessions.set(id, sessions.has(id) ? Math.min(sessions.get(id), ms) : ms)
}
function addAgent(id, label, bad = usageError) {
  if (!/^[\w-]+$/.test(id)) return bad(`bad agent id ${id}`)
  if (!wanted.has(id) || label) wanted.set(id, label || '')
}
const argv = process.argv.slice(2)
while (argv.length) {
  const a = argv.shift()
  const value = () => (argv.length && !argv[0].startsWith('--') ? argv.shift() : usageError(`${a} needs a value`))
  if (a === '--json') asJson = true
  else if (a === '--save') save = true
  else if (a === '--root') root = value()
  else if (a === '--state') stateFile = value()
  else if (a === '--session') { const [id, since] = value().split(/@(.*)/s); addSession(id, since) }
  else if (a === '--agent') { const [id, label] = value().split(/=(.*)/s); addAgent(id, label) }
  else usageError(`unknown argument ${a}`)
}
if (save && !stateFile) usageError('--save needs --state')
if (stateFile) {
  const skip = msg => console.error(`note: skipped a line in ${stateFile}: ${msg}`)
  let block = ''
  let text
  try { text = fs.readFileSync(stateFile, 'utf8') } catch (e) { usageError(`can't read ${stateFile}: ${e.code}`) }
  for (const line of text.split(/\r?\n/)) {
    const key = line.match(/^([\w-]+):/)
    if (key) { block = key[1]; continue }
    const item = line.match(/^\s*-\s+(.*?)\s*(?:#.*)?$/)
    if (!item) continue
    const words = item[1].split(/\s+/)
    if (block === 'sessions') addSession(words[0], words[1] === 'since' ? words[2] : undefined, skip)
    if (block === 'agents' && words.length >= 3) {
      const session = words.pop()
      const id = words.pop()
      addAgent(id, words.join(' '), skip)
      if (!sessions.has(session)) addSession(session, undefined, skip)
    }
  }
}
if (!sessions.size && !wanted.size) {
  if (!stateFile) usageError('pass --state, --session or --agent')
  console.log('usage unavailable: no sessions or agents recorded in the state file')
  process.exit(0)
}

// ---------- Find transcripts ----------
const list = d => { try { return fs.readdirSync(d) } catch { return [] } }
const read = f => { try { return fs.readFileSync(f, 'utf8') } catch { return null } }
const readJson = f => { try { return JSON.parse(read(f)) || {} } catch { return {} } }
const projects = list(root).map(p => path.join(root, p))

const found = new Map() // agent id -> {files, meta, session}
const mainFiles = new Map() // session id -> files
function loadSession(id) {
  if (mainFiles.has(id)) return
  mainFiles.set(id, projects.map(p => path.join(p, `${id}.jsonl`)).filter(f => fs.existsSync(f)))
  for (const p of projects) {
    const dir = path.join(p, id, 'subagents')
    for (const f of list(dir)) {
      const m = f.match(/^agent-([\w-]+)\.jsonl$/)
      if (!m) continue
      const agent = found.get(m[1]) || { files: [], meta: {}, session: id }
      agent.files.push(path.join(dir, f))
      Object.assign(agent.meta, readJson(path.join(dir, `agent-${m[1]}.meta.json`)))
      found.set(m[1], agent)
    }
  }
}
for (const id of sessions.keys()) loadSession(id)
// An agent whose session is unknown or recorded wrong: look in every session.
const missing = [...wanted.keys()].filter(id => !found.has(id))
if (missing.length) {
  for (const p of projects) for (const s of list(p)) {
    if (missing.some(id => fs.existsSync(path.join(p, s, 'subagents', `agent-${id}.jsonl`)))) loadSession(s)
  }
}

// ---------- Read usage ----------
const owner = new Map() // message id -> the transcript that counts it
const FIELDS = { cacheWrite: 'cache_creation_input_tokens', cacheRead: 'cache_read_input_tokens', input: 'input_tokens', output: 'output_tokens' }
function readUsage(key, files, since = 0) {
  const texts = files.map(read).filter(t => t !== null)
  if (!texts.length) return null
  const calls = new Map()
  const tools = new Set()
  const times = []
  for (const line of texts.join('\n').split('\n')) {
    let d
    try { d = JSON.parse(line) } catch { continue } // blank, corrupt or still being written
    if (!d || (d.type !== 'user' && d.type !== 'assistant')) continue
    const msg = d.message || {}
    const at = Date.parse(d.timestamp)
    let ends = d.toolEndsTurn === true
    if (d.type === 'assistant') {
      const id = msg.id || d.requestId || d.uuid
      if (!owner.has(id)) owner.set(id, key)
      if (owner.get(id) !== key || at < since) continue
      ends = !!msg.stop_reason && msg.stop_reason !== 'tool_use'
      if (msg.usage && msg.model !== '<synthetic>') {
        const c = calls.get(id) || { cacheWrite: 0, cacheRead: 0, input: 0, output: 0 }
        for (const [k, f] of Object.entries(FIELDS)) c[k] = Math.max(c[k], msg.usage[f] || 0)
        calls.set(id, c)
      }
      for (const b of Array.isArray(msg.content) ? msg.content : []) if (b && b.type === 'tool_use') tools.add(b.id)
    }
    if (at >= since) times.push([at, ends])
  }
  const u = { apiCalls: calls.size, toolCalls: tools.size, cacheWrite: 0, cacheRead: 0, input: 0, output: 0, finalContext: 0, wallMs: 0, activeMs: 0 }
  for (const c of calls.values()) {
    for (const k of Object.keys(FIELDS)) u[k] += c[k]
    u.finalContext = c.cacheWrite + c.cacheRead + c.input + c.output
  }
  times.sort((a, b) => a[0] - b[0])
  if (times.length) {
    u.startedAt = new Date(times[0][0]).toISOString()
    u.wallMs = times[times.length - 1][0] - times[0][0]
    // Active leaves out the wait between a finished turn and the next message.
    for (let i = 1; i < times.length; i++) if (!times[i - 1][1]) u.activeMs += times[i][0] - times[i - 1][0]
  }
  return u
}

const rows = []
// Main transcripts first, then parents before children, so a forked agent's copy of its
// parent's message is recognised as a copy.
for (const [id, files] of mainFiles) {
  const u = readUsage(id, files, sessions.get(id))
  if (sessions.has(id)) rows.push({ kind: 'main', label: 'orchestrator', agent: sessions.size > 1 ? `main session (${id.slice(0, 8)})` : 'main session', session: id, depth: 0, usage: u })
}
const usageOf = new Map()
for (const [id, a] of [...found].sort((x, y) => (x[1].meta.spawnDepth || 1) - (y[1].meta.spawnDepth || 1))) usageOf.set(id, readUsage(id, a.files))

const children = id => [...found.keys()].filter(c => found.get(c).meta.parentAgentId === id).sort(byStart)
const byStart = (a, b) => String(usageOf.get(a)?.startedAt).localeCompare(String(usageOf.get(b)?.startedAt))
const shown = new Set()
function addRow(id, label, depth) {
  if (shown.has(id)) return
  shown.add(id)
  const a = found.get(id)
  rows.push({ kind: 'agent', label, agent: id, description: a?.meta.description, parent: a?.meta.parentAgentId, session: a?.session, depth, usage: usageOf.get(id) || null })
  if (a) for (const c of children(id)) addRow(c, label, depth + 1)
}
const inScope = id => {
  const a = found.get(id)
  return sessions.has(a.session) && !(Date.parse(usageOf.get(id)?.startedAt) < sessions.get(a.session))
}
const roots = [...found.keys()].filter(id => !found.has(found.get(id).meta.parentAgentId) && inScope(id)).sort(byStart)
if (wanted.size) for (const [id, label] of wanted) addRow(id, label, 0)
else for (const id of roots) addRow(id, '', 0)
const unlisted = wanted.size ? roots.filter(id => !shown.has(id)) : []
// The orchestrator reads better last, under the steps it ran.
rows.sort((a, b) => (a.kind === 'main') - (b.kind === 'main'))

const total = { apiCalls: 0, toolCalls: 0, cacheWrite: 0, cacheRead: 0, input: 0, output: 0 }
for (const r of rows) if (r.usage) for (const k of Object.keys(total)) total[k] += r.usage[k]
const available = rows.some(r => r.usage)

// ---------- Output ----------
const cell = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()
const num = n => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n))
const time = ms => {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const p = n => String(n).padStart(2, '0')
  return h ? `${h}h ${p(Math.floor(s / 60) % 60)}m` : `${Math.floor(s / 60)}m ${p(s % 60)}s`
}
const tokens = u => [u.cacheWrite, u.cacheRead, u.input, u.output].map(num).join(' | ')
function markdown() {
  if (!available) return `usage unavailable: no transcripts found under ${root}`
  const out = [
    '| Step | Agent | API calls | Tool calls | Cache write | Cache read | Uncached input | Output | Final context | Wall | Active |',
    '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|',
  ]
  for (const r of rows) {
    const name = `${r.depth ? '↳ '.repeat(r.depth) : ''}${cell(r.description ? `${r.description} (${r.agent})` : r.agent)}`
    const u = r.usage
    out.push(`| ${cell(r.label)} | ${name} | ${u
      ? `${u.apiCalls} | ${u.toolCalls} | ${tokens(u)} | ${num(u.finalContext)} | ${time(u.wallMs)} | ${time(u.activeMs)}`
      : 'usage unavailable | | | | | | | |'} |`)
  }
  out.push(`| **Total** | | ${total.apiCalls} | ${total.toolCalls} | ${tokens(total)} | | | |`)
  out.push('', '↳ is nested in the agent above it. Wall times overlap, so they have no total.')
  if (unlisted.length) out.push(`Not listed: ${unlisted.length} other agent(s) in these sessions (${unlisted.join(', ')}).`)
  return out.join('\n')
}
const md = markdown()
console.log(asJson ? JSON.stringify({ available, rows, total, unlisted }, null, 2) : md)

if (save && available) {
  const lines = fs.readFileSync(stateFile, 'utf8').replace(/\n+$/, '').split('\n')
  const at = lines.findIndex(l => /^usage:/.test(l))
  if (at >= 0 && rows.some(r => !r.usage)) {
    console.error('note: some transcripts are gone, so the saved usage was left as it was')
  } else {
    if (at >= 0) {
      let end = at + 1
      while (end < lines.length && !/^\S/.test(lines[end])) end++
      lines.splice(at, end - at)
    }
    lines.push('usage: |', ...md.split('\n').map(l => (l ? `  ${l}` : '')))
    fs.writeFileSync(stateFile, lines.join('\n') + '\n')
  }
}
