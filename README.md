# ai-skills

A Claude Code plugin marketplace.

| Plugin | Skills | What it does |
|---|---|---|
| [`openspec-ship`](plugins/openspec-ship) | `openspec-ship`, `verification-plan` | Takes an [OpenSpec](https://github.com/Fission-AI/OpenSpec) change from proposal to merged PR, and writes risk-based manual test plans as an interactive runner. |

## Install

```
/plugin marketplace add apmiller108/ai-skills
/plugin install openspec-ship@ai-skills
```

From a local checkout (edits apply on `/reload-plugins`, no reinstall):

```
claude plugin marketplace add ~/dev/ai-skills
claude plugin install openspec-ship@ai-skills
```

## openspec-ship

### Requirements

| | |
|---|---|
| Claude Code ≥ 2.1.323 | the built-in `code-review` skill, and `${CLAUDE_SKILL_DIR}` in skills |
| [OpenSpec](https://github.com/Fission-AI/OpenSpec) CLI, with `openspec init` run in the repo | provides `openspec-apply-change` and `openspec-archive-change` |
| `gh`, authenticated | branch, PR, checks, merge |
| [impeccable](https://github.com/pbakaus/impeccable) *(optional)* | enables the UI review steps: overdrive, critique, polish, design audit. `/plugin marketplace add pbakaus/impeccable` |
| claude.ai artifacts *(optional)* | the Full manual test runner. Without them, the manual test is Light (PR checklist) or None |

impeccable isn't a hard dependency on purpose: its steps only apply to UI changes, it
installs a hook, and many repos already vendor it as a project skill.

### Project config

Each repo gets a committed `.claude/openspec-ship.yaml` with its lint and test commands,
where UI code lives, how to run and screenshot the app, which platforms to test on, and
project rules every agent should follow. You don't write it by hand: on the first run the
skill drafts it from `package.json`, CI config and `CLAUDE.md`, shows it to you, and
commits it with the change. See
[`references/config.md`](plugins/openspec-ship/skills/openspec-ship/references/config.md)
for every key.

### Use

```
/openspec-ship:openspec-ship add-settings-export
```

or just ask: "ship the add-settings-export change".
