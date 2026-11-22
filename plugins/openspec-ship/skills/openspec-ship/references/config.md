# Project config: `.claude/openspec-ship.yaml`

Everything project-specific that the ship flow and `verification-plan` need lives in one
committed file at the repo root: `.claude/openspec-ship.yaml`. The skills hold the
process; this file holds the project's commands, paths and rules.

## Creating it

On the first run in a repo, the file won't exist. Don't guess silently and don't ask the
user to write YAML. Draft it yourself:

1. Read what the repo already says:
   - `package.json` scripts, `Makefile`, `justfile`, `Taskfile.yml`, `pyproject.toml`,
     `Cargo.toml`: lint, test and slower full-suite commands.
   - `.github/workflows/` (or other CI config): which commands CI runs, so the local gate
     matches it.
   - `CLAUDE.md` / `AGENTS.md`: gotchas, code style, vocabulary rules. Copy the ones an
     agent could break into `rules`, citing the file rather than pasting all of it.
   - The source tree: where UI code lives (`src/renderer/`, `app/`, `web/`, `components/`),
     and any `DESIGN.md` or copy guide.
   - `git log --oneline -20`: commit subject style. `gh repo view --json
     mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`: merge method.
2. Write the draft to the scratchpad and show it to the user in one block, with a line
   per key you couldn't infer (for example "no full-suite command found; leaving `full`
   out").
3. Ask once: write it as shown, or edit first. Apply edits, then write the file.
4. Commit it on the change branch together with the proposal, as `Adds openspec-ship
   config`. It ships with the first change and every later run reads it.

When the file exists, read it at the start of every run. If a command in it fails because
the command doesn't exist (not because tests are red), say so and offer to fix the config.

## Keys

Only `commands.lint` and `commands.test` are required. Leave out any section that doesn't
apply. A missing `ui` hides the UI review steps; a missing `manual_test` limits the manual
test choice to Light and None.

```yaml
base: main                # branch PRs target. Default: main
merge: merge              # merge | squash | rebase. Default: the repo's only allowed method, else ask

commands:
  lint: npm run lint      # required: runs after every step that changes code
  test: npm test          # required: the unit suite, same gate
  test_paths: npx vitest run <paths>   # optional: run only some specs (apply agent)
  full: npm run test:e2e  # optional: slow suite, run before the PR (in the background)

# Changes under these paths re-run `full` after a fix, once the PR exists.
full_after_changes_in: [src/server/, migrations/]

ui:                       # optional: enables overdrive, critique, polish, design audit
  paths: [src/app/]       # what counts as a UI change
  design_doc: DESIGN.md   # the visual source of truth, if any
  copy_guide: docs/voice.md   # vocabulary rules for UI strings, if any
  run: npm run dev        # starts the app for agents to look at
  view: |                 # how an agent sees and screenshots the running UI
    Open http://localhost:5173 with the Playwright MCP tools; screenshot each state.
  skip: [mobile breakpoints, touch targets]   # review items that don't apply

manual_test:              # optional: enables the Full test runner
  plan_dir: docs/verification   # where verification-plan writes reviewable docs
  packaged_when: native modules, workers, installer paths  # when to test a production build
  platforms:              # the first one is primary: every case is required there
    - id: linux
      label: Linux
      machine: this machine
      log: "`~/.config/MyApp/logs/`"
      build: |
        Dev: `npm run dev`. Packaged: `npm run package`, then `dist/linux-unpacked/myapp`.
    - id: mac
      label: macOS
      machine: the user's Mac, a separate checkout
      log: "`~/Library/Logs/MyApp/`"
      build: |
        `git fetch origin && git switch <change> && git pull`, then `npm ci`.
        Packaged: `npm run package:mac`, then open the app from Finder.
  require_when: file paths, dialogs, permissions, fonts and layout  # required on non-primary platforms only then

# Project rules every agent gets, verbatim. Keep each one short and checkable.
rules: |
  - Read CLAUDE.md first; its code style and Gotchas apply.
  - All SQL is parameterised; check table and column names against db/schema.sql.

# Extra outcomes that count as a critical bug in code review (added to the built-in list).
critical: |
  - a broken migration, or schema drift against db/schema.sql

commits:
  style: Third-person present tense subjects under ~60 chars ("Implements …", "Fixes …")
  never: [.env, dist/, coverage/]   # paths a run may produce that must never be committed
```

## How the skills use it

| Key | Used by |
|---|---|
| `commands.lint`, `commands.test` | every spec gate; every agent that edits |
| `commands.full`, `full_after_changes_in` | the pre-PR gate, and re-runs after later fixes |
| `ui.*` | the menu (UI review question), agents F, G1, G2, H, I |
| `manual_test.*` | agent E, and the `verification-plan` skill |
| `rules` | pasted into every agent prompt as `<rules>` |
| `critical` | the review rubric |
| `commits.*` | every commit; `never` is checked before staging |
