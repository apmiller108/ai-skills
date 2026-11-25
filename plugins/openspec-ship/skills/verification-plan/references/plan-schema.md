# Plan JSON schema

One file holds the whole plan. `scripts/build.mjs` validates it, renders the
Markdown doc, and injects it into `assets/runner.html`. The full worked example
is `examples/settings-export.plan.json`: read its `items` for the level of
detail steps should have.

## Contents

- Top level
- Platforms
- Items (cases)
- Steps, expected results, fields
- Using a recorded value in a later step
- Order and phases
- Exit criteria
- Findings and run log
- Rules that keep results intact

## Top level

| Key | Type | Notes |
|---|---|---|
| `id` | kebab-case string | Required. Also namespaces the runner's local storage. Never change it after publishing. |
| `title` | string | Required. Markdown H1 and the runner's header. |
| `pageTitle` | string | Browser tab and artifact gallery name: 2–4 words, e.g. `Settings Export Verification`. |
| `subtitle` | inline md | Runner header subline. |
| `target` | object | `{kind: "openspec" \| "branch" \| "feature", ref, hub?}`. Recorded for provenance. |
| `artifactUrl` | string | Set after the first publish so later runs republish to the same URL. |
| `intro` | md | Paragraph(s) under the H1: what the plan is for, where findings go. |
| `scope` | md | What must be true before shipping; what is out of scope. |
| `covered` | `[{layer, what, where}]` | Automated coverage table: unit, E2E dev, E2E packaged, manual already done. |
| `coveredGap` | md | The gap the manual pass closes. Say it plainly. |
| `setup` | md | Setup prose for the Markdown doc. Actionable setup also goes in as items (section `S`) so the runner walks through it. |
| `platforms` | array | See below. |
| `risks` | `{R1: "text", …}` | Every risk should be cited by at least one item. The Markdown risk matrix is derived from the citations. |
| `sections` | `{S: "Setup", A: "…", …}` | Letter → name, in display order. |
| `sectionNotes` | `{A: md}` | Optional prose above a section's table. |
| `items` | array | The cases. See below. |
| `order` | `{platId: [itemId…]}` | Run order per platform. Must list every item that applies to that platform. |
| `phases` | `{platId: [{name, start}]}` | Sidebar groups; `start` is the first item id of the phase in that platform's order. |
| `exit` | array | Exit criteria, evaluated live in the runner. See below. |
| `extra` | `[{heading, body}]` | Extra Markdown sections (e.g. "Beta tester ask"). |
| `runLog` | `[{date, platform, build, cases, findings}]` | Earlier runs. |
| `findings` | `[{n, title, ref, body}]` | Pre-run findings (e.g. from code reading). New ones get numbers after these. |

## Platforms

```json
{ "id": "win", "label": "Windows VM", "short": "Win",
  "log": "Settings → **Show log files** (`%APPDATA%\\MyApp\\logs\\main.log`)",
  "meta": [{ "label": "Commit", "item": "SW1", "field": "commit" }] }
```

- `id`: short and stable (`mac`, `win`, `linux`). Result docs are keyed `<plat>-<item>`.
- `log`: shown under any step list that mentions a log.
- `meta`: values pulled from item fields into the export header (build commit, CI run).

One platform is fine; the switcher hides itself.

## Items

```json
{
  "id": "E5", "sec": "E", "title": "Overwrite while another app holds the file open",
  "type": "check",
  "plats": { "mac": "req", "win": "req" },
  "prior": { "mac": "✓ dev 2026-09-26" },
  "risks": ["R6"],
  "why": "One or two sentences: what could break and why this case exists.",
  "notes": { "mac": "Platform-specific callout shown as a highlighted note." },
  "steps": [ … ], "expect": [ … ], "fields": [ … ]
}
```

- `type`:
  - `check`: the tester judges it against `expect`. Pass / Fail / Blocked / Skip.
  - `observe`: the tester records values in `fields`. Recorded / Finding / Blocked / Skip. Use it for measurements (timings, counts), probes whose answer decides something, and decisions.
- `plats`: `req` or `opt` per platform. Leave a platform out when the case doesn't apply to it; the Markdown shows `—`.
- `prior`: evidence from an earlier run, shown as a chip and in the Markdown status cell until a new result replaces it.
- `sec`: a key of `sections`. Setup items conventionally use `S` with ids like `SM1` / `SW1`.

## Steps, expected results, fields

```json
"steps": [
  { "t": "Settings → **Change location…** → a folder on `D:\\`." },
  { "t": "Count streaming entries.", "only": "mac", "cmd": "grep -cE 'Kind=\"Unknown Format\"[^>]*Size=\"0\"' export.xml" }
],
"expect": ["Written on `D:\\`", { "t": "The relocated notice shows", "only": "win" }],
"fields": [
  { "k": "wall", "label": "Wall time", "mono": true, "ph": "e.g. 4.2 s" },
  { "k": "decision", "label": "Decision", "kind": "select", "opts": ["Accept for beta", "Fix first", "Undecided"] },
  { "k": "hes", "label": "Hesitations", "kind": "area" }
]
```

- Text supports `` `code` ``, `**bold**`, `*italic*`. Nothing else.
- `only`: a platform id or an array of them. It works on steps, expect entries and fields.
- `cmd`: a copyable block. Put one command per line. For a value the tester records in a field, use `{{ITEM.field}}` (below). Use a placeholder like `<run-id>` only for a one-off value that no field records.
- Step indices are stored with results. Append new steps at the end of a case once testing has started; inserting in the middle shifts the saved ticks.
- `fields[].kind`: `text` (default), `area`, `select`. `mono` for paths, SHAs and log lines.

## Using a recorded value in a later step

```json
{ "id": "S1", …, "fields": [{ "k": "track", "label": "Test track ID", "mono": true }] }
{ "id": "A1", …, "steps": [{ "t": "Check the row for `{{S1.track}}`.", "cmd": "sqlite3 app.db \"SELECT * FROM tracks WHERE id = '{{S1.track}}'\"" }] }
```

`{{ITEM.field}}` shows what the tester recorded in that field, on the same platform, and the Copy button copies it filled in. Until it's recorded, the step shows `<Test track ID from S1>` and links to S1.

- Works in step `t` and `cmd`, in `expect` and in `notes`. Nowhere else.
- The field can be in an earlier case or in the same one. The build rejects a reference to a case that runs later, an unknown item or field, or an `area` field.
- When each platform records it in its own item, list them: `{{SL1.track|SM1.track}}` uses the one that applies.
- The value goes in as typed, with no escaping: quote it in the command, and say in the field's `ph` what form it takes (an absolute path: `~` doesn't expand inside quotes).
- Adding references to an existing plan is safe; only the item id and field key are stored.

## Order and phases

The order is the tester's path through the run. Put first-launch-only checks first and destructive steps (replace, remove, reset) after everything that needs the data they destroy. A platform may list items in a different order from another platform. Phases just group the sidebar. If `phases` is absent, the runner groups by section.

## Exit criteria

```json
{ "text": "CI green on the RC commit", "kind": "pass", "items": [{ "plat": "mac", "id": "SM5" }] }
{ "text": "Every required case has a status", "kind": "allRequired" }
{ "text": "Every ✗ is fixed or deferred with a reason", "kind": "failuresResolved" }
{ "text": "B5 and G2 decided", "kind": "fields", "fields": [{ "plat": "win", "id": "B5", "field": "decision", "label": "B5", "notIn": ["Undecided"] }] }
{ "text": "Release notes reviewed", "kind": "manual", "detail": "Check by hand." }
```

`failuresResolved` and `manual` are informational (shown as `•`); the rest are ✓/✗.

## Rules that keep results intact

Results live in the artifact's store, keyed by `<plat>-<itemId>`, and survive republishing. So:

- Never renumber or reuse an item id. To retire a case, delete the item (its old results are simply ignored) and give any replacement a new id.
- Never change `plan.id` or a platform `id` after the first publish.
- Field keys (`k`) are stored too. Rename the label, not the key.
