// node --test usage.test.mjs
// Transcripts here are made up; only their shape matches Claude Code's.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'usage.mjs')
const at = s => new Date(Date.UTC(2026, 0, 1) + s * 1000).toISOString()
const user = (s, extra = {}) => ({ type: 'user', timestamp: at(s), message: { role: 'user', content: 'hi' }, ...extra })
// One API response as Claude Code writes it: a line per block, same id and usage.
const reply = (s, id, [input, write, read, output], blocks = ['text'], stop = 'tool_use') => blocks.map((type, n) => ({
  type: 'assistant', timestamp: at(s + n), requestId: `req_${id}`,
  message: {
    id, model: 'claude-test', stop_reason: stop, content: [{ type, id: `${id}-${n}` }],
    usage: { input_tokens: input, cache_creation_input_tokens: write, cache_read_input_tokens: read, output_tokens: output },
  },
}))

function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const write = (f, lines, tail = '') => {
    const p = path.join(root, '-proj', f)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, lines.flat().map(l => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n' + tail)
  }
  const agent = (session, id, lines, meta, tail) => {
    write(`${session}/subagents/agent-${id}.jsonl`, lines, tail)
    if (meta) write(`${session}/subagents/agent-${id}.meta.json`, [meta])
  }
  const run = (...args) => {
    const r = spawnSync(process.execPath, [script, '--root', root, ...args], { encoding: 'utf8' })
    const json = args.includes('--json') && r.status === 0 ? JSON.parse(r.stdout) : null
    return { ...r, json, row: id => json.rows.find(x => x.agent === id) }
  }
  // s1: the orchestrator, a wrapper with a nested agent, and a fork.
  write('s1.jsonl', [user(0), reply(1, 'm1', [1, 10, 0, 5], ['text', 'tool_use']), user(90), reply(91, 'm2', [2, 20, 11, 7], ['text'], 'end_turn')])
  agent('s1', 'aaa', [
    user(10), reply(11, 'a1', [3, 100, 0, 10], ['thinking', 'tool_use', 'tool_use']),
    '{ not json', 'null',
    user(15), reply(16, 'a2', [4, 50, 100, 20], ['text'], 'end_turn'),
    user(76), reply(78, 'a3', [5, 30, 150, 30], ['text'], 'end_turn'), // resumed after 60s idle
  ], { description: 'Wrap | it', spawnDepth: 1 }, '{"type":"assistant","mess')
  agent('s1', 'bbb', [user(12), reply(13, 'b1', [1, 1, 1, 1])], { description: 'Nested', parentAgentId: 'aaa', spawnDepth: 2 })
  agent('s1', 'fff', [reply(1, 'm1', [1, 10, 0, 5], ['text', 'tool_use']), reply(20, 'f1', [6, 6, 6, 6])], { description: 'Fork', spawnDepth: 1 })
  // s2: a resumed run, with an agent that has no meta file.
  write('s2.jsonl', [user(1000), reply(1001, 'n1', [1, 1, 1, 1])])
  agent('s2', 'ccc', [user(1002), reply(1003, 'c1', [0, 7, 8, 9])])
  return { root, run, write }
}

test('counts each response once, whatever its number of lines', t => {
  const u = setup(t).run('--session', 's1', '--json').row('aaa').usage
  assert.deepEqual([u.apiCalls, u.toolCalls, u.input, u.cacheWrite, u.cacheRead, u.output], [3, 2, 12, 180, 250, 60])
  assert.equal(u.finalContext, 5 + 30 + 150 + 30)
})

test('active time leaves out the wait before a resume', t => {
  const u = setup(t).run('--session', 's1', '--json').row('aaa').usage
  assert.deepEqual([u.wallMs, u.activeMs], [68000, 8000])
})

test('nests agents under their parent and keeps a forked message with the parent', t => {
  const { run } = setup(t)
  const r = run('--session', 's1', '--json')
  assert.deepEqual(r.json.rows.map(x => [x.agent, x.depth]), [['aaa', 0], ['bbb', 1], ['fff', 0], ['main session', 0]])
  assert.deepEqual([r.row('fff').usage.apiCalls, r.row('fff').usage.toolCalls], [1, 0])
  assert.equal(r.json.total.apiCalls, 3 + 1 + 1 + 2)
  assert.match(run('--session', 's1').stdout, /\| ↳ Nested \(bbb\)/)
  assert.match(run('--session', 's1').stdout, /Wrap \\\| it/)
})

test('labels the given agents, adds their nested ones, names the rest', t => {
  const r = setup(t).run('--session', 's1', '--agent', 'aaa=5-review D', '--json')
  assert.deepEqual(r.json.rows.map(x => [x.agent, x.label]), [['aaa', '5-review D'], ['bbb', '5-review D'], ['main session', 'orchestrator']])
  assert.deepEqual(r.json.unlisted, ['fff'])
})

test('finds an agent given without its session, and leaves the orchestrator out', t => {
  const r = setup(t).run('--agent', 'ccc', '--json')
  assert.deepEqual(r.json.rows.map(x => x.agent), ['ccc'])
  assert.equal(r.row('ccc').usage.cacheWrite, 7)
})

test('@since drops what the session did earlier', t => {
  const r = setup(t).run('--session', `s1@${at(60)}`, '--json')
  assert.equal(r.row('main session').usage.output, 7)
  assert.deepEqual(r.json.rows.map(x => x.agent), ['main session'])
})

test('reads a state file across sessions and saves the table into it', t => {
  const { root, run } = setup(t)
  const state = path.join(root, 'change.md')
  fs.writeFileSync(state, [
    'step: 5-review', 'learnings: |', '  - not an agent at all s9', 'sessions:   # comment', `- s1 since ${at(0)}`, '- s2 since whenever', '- …', '- s2',
    'agents:', '- 2-apply A aaa s1', '- 6-manual E ccc s2', '- 5-review D gone s2', 'pr: 1', '',
  ].join('\n'))
  const r = run('--state', state, '--save', '--json')
  assert.deepEqual(r.json.rows.map(x => [x.label, x.agent, !!x.usage]), [
    ['2-apply A', 'aaa', true], ['2-apply A', 'bbb', true], ['6-manual E', 'ccc', true], ['5-review D', 'gone', false],
    ['orchestrator', 'main session (s1)', true], ['orchestrator', 'main session (s2)', true],
  ])
  const saved = fs.readFileSync(state, 'utf8')
  assert.match(saved, /pr: 1\nusage: \|\n {2}\| Step /)
  // A later run that can't see everything doesn't replace what was saved.
  assert.match(run('--state', state, '--save').stderr, /left as it was/)
  assert.equal(fs.readFileSync(state, 'utf8'), saved)
  // One that can replaces it and stays readable.
  fs.writeFileSync(state, saved.replace('- 5-review D gone s2\n', '') + 'late: key\n')
  run('--state', state, '--save')
  const again = fs.readFileSync(state, 'utf8')
  assert.equal(again.match(/^usage:/gm).length, 1)
  assert.match(again, /late: key\nusage: \|/)
  assert.doesNotMatch(again, /unavailable/)
})

test('a session recorded as unknown has no row and blocks nothing', t => {
  const { root, run } = setup(t)
  const state = path.join(root, 'change.md')
  fs.writeFileSync(state, ['sessions:', '- unknown since ' + at(0), '- s1', 'agents:', '- 2-apply A aaa s1', '- 6-manual E ccc unknown', ''].join('\n'))
  const r = run('--state', state, '--save', '--json')
  assert.deepEqual(r.json.rows.map(x => [x.agent, !!x.usage]), [['aaa', true], ['bbb', true], ['ccc', true], ['main session', true]])
  assert.equal(r.stderr, '')
  assert.equal(run('--state', state, '--save').stderr, '') // replaces the saved table
  const saved = fs.readFileSync(state, 'utf8')
  assert.equal(saved.match(/^usage:/gm).length, 1)
  assert.match(saved, /Not counted: the orchestrator/)
  fs.writeFileSync(state, 'sessions:\n- unknown\n')
  assert.match(run('--state', state).stdout, /^usage unavailable/)
})

test('missing transcripts are unavailable, not a failure', t => {
  const { root, run } = setup(t)
  for (const args of [['--session', 'nope'], ['--agent', 'nope=2-apply A'], ['--root', path.join(root, 'nowhere'), '--session', 's1']]) {
    const r = run(...args)
    assert.equal(r.status, 0)
    assert.match(r.stdout, /^usage unavailable/)
  }
})

test('bad arguments exit 2', t => {
  const { run } = setup(t)
  for (const args of [[], ['--session'], ['--session', '../x'], ['--session', 's1@later'], ['--bogus'], ['--save', '--session', 's1'], ['--state', '/nope/x.md']]) {
    assert.equal(run(...args).status, 2, args.join(' '))
  }
})
