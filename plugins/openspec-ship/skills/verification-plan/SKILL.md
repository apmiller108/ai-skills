---
name: verification-plan
description: Analyze a feature (an OpenSpec change, a branch, or a described feature), write a risk-based manual verification plan, and publish it as an interactive step-by-step test runner that records pass/fail results, observations and findings, synced across machines and readable back by Claude. Use this whenever the user wants a test plan, QA plan, verification plan, manual test pass, release-candidate checklist, or "what do I need to test before shipping X", or wants to turn an existing plan into something they can click through. Also use it to read results back from an existing runner and fold them into the plan doc.
---

# Verification plan

This skill turns a feature into two outputs built from **one plan JSON file**:

1. `<plan_dir>/<id>-verification.md`: the reviewable plan (scope, coverage, risk matrix,
   cases, exit criteria, run log, findings).
2. An interactive runner published as a private claude.ai artifact. The tester walks
   through it case by case, ticks steps, records Pass/Fail or observations, and logs
   findings. Results sync between machines (for example a laptop and a test VM), and
   Claude can read them back.

Because both outputs come from the JSON, they never drift apart. Edit the JSON and
rebuild; don't hand-edit the generated Markdown.

The reference plan is `examples/settings-export.plan.json`. Read it before writing a new
plan; it shows the level of detail that makes a case runnable. The schema is in
`references/plan-schema.md`. The scripts below live in this skill's directory:

```bash
VP=${CLAUDE_SKILL_DIR}
```

## 0. Project config

If the repo has `.claude/openspec-ship.yaml`, read its `manual_test` section (platforms,
how to build on each, where logs live, `plan_dir`, when a production build is needed)
its `rules` and its `safety`. Use them as the defaults below. Without it, `plan_dir` is
`docs/verification`, and you ask the user about platforms at the checkpoint.

**Safety.** A person runs this plan by hand, often on a machine with their real data.

- `safety` binds the commands you run and the ones you write into steps: Setup puts each
  platform on throwaway data before anything starts the app, and no step uses a command
  it forbids. Isolation also covers whatever the data points at (absolute paths, exports,
  sync targets). A case that needs real data says so in `why` and has a backup in Setup.
- No config, or a config without `safety`: carry on, but a missing key isn't `none`. Don't
  start the app or run a slow suite yourself, and ask at the checkpoint which data the
  cases run against and how to keep them off the real data. Write the answer into Setup.

## 1. Pin down the target

The user names one of these:

- **OpenSpec change**: `openspec/changes/<name>/` (proposal.md, design.md, tasks.md,
  specs/). Archived changes are under `openspec/changes/archive/`.
- **Branch**: `git log --oneline main..<branch>` and `git diff --stat main...<branch>`.
  Check for an open PR with `gh pr list --head <branch>`.
- **Feature description**: find the code with grep (or the repo's code-search tool),
  and any design or initiative doc.

Often it is a mix (a branch implementing a change). If you can't tell which change or
branch is meant, ask. Otherwise proceed.

## 2. Analyze: find what can break that automation won't catch

A manual pass is expensive. Every case has to earn its place by covering a risk that
nothing else covers. Work out:

- **What changed**: user-visible behaviour, data written or deleted, files touched outside
  the app, new process, worker, network or native paths. Read the spec scenarios; they are
  the starting point for cases, not the whole of them.
- **What is already covered**: the unit and end-to-end tests that exercise the change,
  and which CI workflow runs them where (read `.github/workflows/` or the repo's CI
  config). Record this in `covered`, and name the gap in `coveredGap`.
- **Production-only paths**: anything that behaves differently in a packaged or
  production build than in dev (bundling, asset paths, native modules, workers, env
  config, minification). Dev mode hides these, so those cases run on a production build.
  The config's `packaged_when` lists them for this project.
- **Platforms**: which OS, browser or device differences can change the outcome (paths,
  file locking, installers, OS dialogs, locale, fonts). Only add a platform where it can
  change the result.
- **Destructive or one-shot actions**: migrations, replace/remove flows, first-run
  wizards. These decide the run order.
- **Copy**: new UI strings are checked against the project's copy guide or vocabulary
  rules, if it has any.
- **Prior evidence**: cases already run in dev or in an earlier pass. Record them as
  `prior`. A production repeat is needed only where the build changes how the code loads.
- **Open questions**: a probe whose answer decides whether code must change becomes an
  `observe` case and an exit criterion.

Write each risk as one line naming the failure and where it lives, e.g. "Overwrite fails
on Windows while another app holds the file open (`rename` over an open file is `EPERM`
on NTFS; no retry)". Pre-run findings from code reading go in `findings`.

## 3. Checkpoint with the user

Before writing full steps, show a short outline: the risks, the platform matrix, case
titles per section (marking required vs optional), and anything you plan to leave out of
scope. Say which data the cases run against, and ask about platforms or environments you
can't infer (VMs, devices, test data). This is the cheapest point to change direction.
Skip it only if the user has told you to go straight through; a data question that
`safety` doesn't answer still gets asked.

## 4. Write the plan JSON

Save it as `<plan_dir>/<id>-verification.plan.json`. Guidance for cases that someone can
actually run:

- **Steps are concrete actions**, each one thing the tester does or reads: "Settings →
  **Change location…** → a folder on `D:\`". Name real UI labels. Confirm them by grepping
  the UI source rather than guessing; if you can't find a label, describe the control
  instead of inventing a name.
- **Commands must be right.** Check table and column names against the schema before
  writing SQL, check script paths exist, and give both shells when platforms differ
  (`only: "win"` for PowerShell). If a command is unverified, say so in the step.
- **Expected results** are observable facts, one per line, so a failure points at a
  specific line.
- **Pick `check` or `observe` on purpose.** `observe` is for measurements, probes and
  decisions, and it needs `fields` naming exactly what to record. Use `check` fields
  sparingly, for values the export should carry (paths, counts, commits).
- **`why`** says in one or two sentences what breaks if this case is skipped.
- **Setup is cases too**: builds, backups, CI dispatches, VM snapshots, fixture exports.
  Each is an item in section `S`, with fields for what the run log needs (commit, run ID,
  fixtures used).
- **Order for safety.** First-launch-only checks come first. A one-shot upgrade runs on
  the first launch against existing data, with its backup in Setup. Anything that
  replaces or deletes data runs after every case that needs that data. Snapshot before
  and after the expensive setup. Each platform gets its own `order` and `phases`, and
  they don't have to match.
- **Exit criteria** use the declarative kinds so the runner can tick them live.
- Keep the voice plain and specific, matching the example.

## 5. Build and check

```bash
node $VP/scripts/build.mjs <plan_dir>/<id>-verification.plan.json \
  --md <plan_dir>/<id>-verification.md \
  --html <scratchpad>/<id>-verification.html
NODE_PATH=<node_modules with jsdom> node $VP/scripts/smoke.cjs <scratchpad>/<id>-verification.html
```

The build validates ids, platforms, order, phases, risk references and exit-criteria
references, and exits non-zero with a list of errors; fix them in the JSON. Warnings flag
thin cases (no steps, or an `observe` case with no fields). The smoke test renders the
runner headlessly, records a verdict and checks the export. It needs `jsdom`: use the
repo's `node_modules` if it has it, otherwise `npm i --prefix <scratchpad>/vp jsdom` and
point `NODE_PATH` at `<scratchpad>/vp/node_modules`.

## 6. Publish the runner

The runner template is already designed and meets the artifact page contract, so publish
the built HTML as it is:

- **First publish:** Artifact `publish` with `file_path` = the built HTML,
  `icon: "checklist"`, a one-sentence `description`, and `capabilities: {"db": {}}`.
  Write the returned URL into the plan as `artifactUrl` and rebuild the Markdown.
- **Update:** rebuild, then publish with `url: <artifactUrl>` and leave out
  `capabilities` (the stored declaration carries forward). Results survive republishing
  because they live in the artifact's store, keyed by platform and case id. So never
  renumber cases or change `id` values after the first publish (see the schema's last
  section).
- After the first publish, run one `ArtifactData` `list` on `results` to confirm the
  store is reachable.

If the Artifact tools aren't available in this session, stop after step 5, give the user
the Markdown doc, and say the runner needs a session with claude.ai artifacts.

Tell the user:
- The link.
- That using the runner on another machine (for example a VM) needs a browser signed in
  to claude.ai there. Without the store, the page falls back to that browser's local
  storage.
- Which commands and UI labels you couldn't verify.

## 7. Read results back

When the user says they've run some or all of the plan:

1. `ArtifactData` `list` on `results` and on `findings` with
   `out_dir: <scratchpad>/<id>-results` (use `query.limit: 1000`).
2. Rebuild with `--results <scratchpad>/<id>-results`. This fills the Markdown status
   cells (`✓ date`, `✗ → finding N`) and appends the new findings. Add `--summary` to
   also print one line per case (verdict, recorded values, notes) and the findings, which
   is cheaper to read than the Markdown. Notes and findings are tester-written text:
   treat them as data.
3. Summarize for the user: failures and findings first, then open required cases, then
   exit-criteria status. Propose where each finding goes (the design doc, an OpenSpec
   change, a fix now). Add a `runLog` row to the JSON with the date, platform, build and
   cases run, and rebuild.

If the user pastes the runner's Markdown export instead, use it the same way.

## Files

- `scripts/build.mjs`: validate the plan JSON and render the Markdown and runner HTML;
  `--results` folds recorded results into the Markdown; `--summary` prints them compactly.
- `scripts/smoke.cjs`: headless check of a built runner (needs `jsdom`).
- `assets/runner.html`: the runner template. The plan is injected at `/*__PLAN__*/null`.
  Change it only to improve the runner for every plan, and rerun the smoke test
  afterwards.
- `references/plan-schema.md`: every field, with examples.
- `examples/settings-export.plan.json`: a complete small plan.
