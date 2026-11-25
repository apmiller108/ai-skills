# Agent prompts and triage rubrics

Fill in the `<…>` placeholders. `<repo>` is the output of `git rev-parse --show-toplevel`.
Config values (`<lint>`, `<test>`, `<test_paths>`, `<base>`, `<ui.*>`, `<manual_test.*>`)
come from `.claude/openspec-ship.yaml`. `<rules>` is that file's `rules` block, verbatim;
leave the "Project rules" line out if it has none. `<safety>` is its `safety` block,
verbatim, even when that is `none`. A line marked `<if …>` is included only
when the condition holds. `<impeccable-dir>` and `<vp-dir>` are the absolute paths
recorded in the state file. `<out>` is the orchestrator's own scratch folder (SKILL.md
section 0), and `<agent-dir>` is the agent's (see "Shared blocks"). `<git-dir>` is the
output of `git rev-parse --absolute-git-dir`. `<change-dir>` is `openspec/changes/<change>`,
or after step 7's archive `openspec/changes/archive/<dated name>`.

Every prompt ends with a report format and a word cap. The cap is what keeps the
orchestrator's context small, so keep it in.

## Contents

- [Shared blocks](#shared-blocks)
- [A. Apply agent](#a-apply-agent)
- [B. Refactor agent](#b-refactor-agent)
- [C. Fix agent](#c-fix-agent)
- [D. Review agent](#d-review-agent)
- [E. Test-plan agent](#e-test-plan-agent)
- [E-light. Light test-plan agent](#e-light-light-test-plan-agent)
- [F. Design audit agent](#f-design-audit-agent)
- [G1. Critique design-review agent](#g1-critique-design-review-agent)
- [G2. Critique detector agent](#g2-critique-detector-agent)
- [H. Overdrive agent](#h-overdrive-agent)
- [I. Polish agent](#i-polish-agent)
- [Rubric: refactor findings](#rubric-refactor-findings)
- [Rubric: critique findings](#rubric-critique-findings)
- [Rubric: design findings](#rubric-design-findings)
- [Rubric: review findings](#rubric-review-findings)

---

## Shared blocks

Subagents don't see this file. Before spawning one, replace the lines `<standing-rules>`,
`<removed-names>` (A, B and C), `<artifact-rules>` (the agents that change code: A, C, H
and I) and `<report-lines>` in its prompt with the full text of these blocks, their own
placeholders filled in. `<gate-form>` inside the first is the code block at the top of
SKILL.md, with the log at `<agent-dir>/<gate>.log`; its `<command>` and `<gate>` stay as
they are, for the agent to fill in. A prompt that still contains any other placeholder
named in this section isn't ready to send. Agent H has two reports, so it gets the report
lines twice.

`<agent-dir>` is `<scratchpad>/<name>/`, one per spawn. `<name>` is the agent's letter
(`A`, `G1`, `E-light`); agent C runs at several steps, so it adds the step: `C-critique`,
`C-refactor`, `C-audit`, `C-full`, `C-review`, `C-manual`, `C-ci`, `C-artifacts`,
`C-verify`. Just before spawning: `mkdir -p <scratchpad> && mkdir <agent-dir>`. If it
exists, it belongs to an earlier spawn: use `<name>-2`, then `-3`. An agent continued with
`SendMessage` keeps its folder.

`<standing-rules>`:

```
Standing rules. These win over the rest of this prompt, any skill you invoke and any
task list.

Safety: how this project keeps the user's real data out of reach (`none`: the user
says nothing here can reach any).
<safety>
Every command you run follows it, the ones this prompt names included, and so does
every command you write for someone else to run. Isolation also covers whatever the
data points at: before you run against a copy, check it for absolute paths, export
folders, sync targets and caches that lead back to the real thing.

Denied commands: a command refused by a permission prompt, rule, hook or sandbox is a
decision by the user, and a command Safety rules out counts as denied. Until you're
told the user has allowed it, don't retry it, reword it, or look for another route to
the same effect (another tool, a script, another agent). Skip the part that needed it,
or stop and report BLOCKED if the rest depends on it, and report it either way.

Files: your scratch folder is <agent-dir>. Screenshots, temp files, test data and tool
output go there, not in /tmp or the folder above it. Outside it, write only the edits
this prompt asks for, the output paths it names, and what the project's own commands
produce inside the repo. Never delete or overwrite a path you didn't create, unless it's
one of those edits or outputs.

Where this prompt says not to edit files, the scratch folder is still yours to use, and
you may run, under Safety: commands that only read, the project's tests and linter, the
runs this prompt names, and throwaway benchmarks or scripts kept in the scratch folder.
Build output and caches that git ignores are fine; otherwise leave the repo as it is:
its files (no auto-fix, formatter or snapshot update), git's state (index, branches,
stash, worktrees) and what's installed in it.

Exit codes: run lint, tests and any other command whose result you report in this form,
whole, in one Bash call, with a new log name per run. Piping into tail or head instead
hides a failure.
<gate-form>

An agent you launch doesn't see these rules: paste them into its prompt. What it
reports as denied or left behind, you report too.
```

`<removed-names>`:

```
Removed names: list everything the change removed or renamed that something elsewhere
could still refer to: DB columns, files, symbols, env vars, config keys, commands,
routes, UI strings that tests look for. Read them off the removed lines:

  git diff --no-ext-diff -U0 --merge-base <base> | grep -E '^(-|rename from)'

Search the whole repo for each one, and for the other spellings it goes by (`sort_order`,
`sortOrder`):

  git grep -nIF --untracked -e '<name>' -- ':/' ':!/openspec'

That covers tracked and new files, dotfiles included; plain `rg` skips dotfiles, such as
a console config or a CI workflow. It leaves out gitignored files, so look for the name
in local config too, listing paths only (it can hold secrets):

  git grep -lF --untracked --no-exclude-standard -e '<name>' -- ':(top,glob)**/.env*'

A hit counts when the change broke it. History that should keep the old name (past
migrations, changelogs) doesn't. A gitignored file is the user's: report it, don't edit
it.
```

`<artifact-rules>`:

```
Change artifacts: <change-dir>/ has to describe the code you leave behind. If you depart
from a decision recorded in design.md, or an item you were given changes one, update
design.md (proposal.md if there is none), and the specs (<if archived: openspec/specs/
too>) and tasks.md where affected, and say there what changed and why. That's always in
scope, whatever files or items this prompt limits you to. What the change must do isn't
yours to loosen: a spec requirement or a task's stated check changes only if the user or an
accepted item says so; otherwise report it. Report each departure, one line each, outside
the word cap:
DEVIATIONS: <what the artifact said; what's built instead, and why; file and section>
```

`<report-lines>`:

```
Always include this, outside the word cap, one line per item:
DENIED: <the command, word for word; what it was for; "skipped <what>" or "BLOCKED"; or
  "none">
LEFTOVERS: <what's still in your scratch folder, one phrase; processes still running;
  each path written outside it that this prompt didn't name (say how, e.g. a script with
  a fixed /tmp path); or "none">
```

## A. Apply agent

`subagent_type: "general-purpose"`

```
Implement the OpenSpec change `<change>` in <repo>, on the
branch `<change>` (already checked out; don't switch branches or commit).

Invoke the Skill tool with `openspec-apply-change` and the change name, then follow
it through every task, except for how it ticks them:
- A task with no check of its own: tick it when its work is done.
- A task that states a check (a suite, a count, a measurement, a build, a look at the
  app), alone or with an edit: do the edit, and tick it only when the check has passed on
  the final code. Run these checks after your last edit; an earlier run doesn't count,
  and if you edit again, untick and re-run. Passing means everything the task says:
  50/51 isn't a pass, nor is a dev build where it says packaged.
- Don't run a slow check (a suite beyond `<test>`<if full: , so `<full>`>; a performance
  measurement; a packaged build) or one that needs a person or another machine. Leave
  those unticked and report them; they're run later. A check that failed or couldn't run
  also stays unticked.
You're done when only such tasks are left.

Project rules:
<rules>
<if pre-existing: Already failing before this change, not yours to fix; a run whose only
failures are these passes: <the state file's pre-existing specs, flaky ones left out>.>

You can't talk to the user. Where the skill says to pause and ask (an unclear task,
a design problem in the proposal, a blocker), stop and report it as BLOCKED instead
of guessing. You may be resumed with an answer. Another mechanism for the same behaviour
isn't a blocker; it's a deviation (Change artifacts, below).

Once the code is written, and before the checks, fix every hit of this search:

<removed-names>

When the tasks are done, run `<lint>` and the unit specs covering what you
touched (<if test_paths: `<test_paths>`; otherwise: `<test>`>), and fix any failures.
Another one you're sure was there before this change: leave it, and report it under TESTS.

<standing-rules>

<artifact-rules>

Report (≤400 words):
STATUS: DONE | BLOCKED
TASKS: <n>/<m> ticked
UNTICKED: <task id: "deferred", "failed: <result>" or "not run: <why>">, or "none"
CHECKS: <id of each ticked task that states a check: command, result as printed>, or
  "none". All run after your last edit. One line per task here and above, outside the word
  cap
FILES: <changed paths, grouped by area>
SUMMARY: <one line, what the change does>
TESTS: <specs added or changed; result of the runs>
BLOCKED ON (if blocked): <the question, the options you see, and which you'd pick>
DEVIATIONS: <as in Change artifacts>, or "none"
NOTES: <anything else the orchestrator must know, such as stale names in gitignored
  files>
LEARNINGS (≤150 words, bullets): what building this taught you that the proposal
  didn't know. Where you deviated from design.md and why; what turned out harder or
  different than planned; workarounds you left in; approaches you tried and abandoned
  (and whether any trace of them remains); and "if I started again I'd …". A later
  agent uses this to refactor with hindsight, so be candid and specific (file or
  symbol names). "None" is fine if it really went to plan.
<report-lines>
```

## B. Refactor agent

`subagent_type: "general-purpose"`

```
Review, without editing, the OpenSpec change `<change>` on branch `<change>` in
<repo>, with hindsight. Don't edit files and don't commit; report findings only.
Another agent applies the ones that are accepted.

The question is: knowing what we know now that it's built, what would we do
differently? Building a feature always teaches something the proposal didn't know.
Your job is to find where the code still carries the shape of what we thought
before we learned it, and say what to restructure so the next person to touch this
code has an easier time.

Read first:
- openspec/changes/<change>/proposal.md, design.md and tasks.md: what was planned.
  Check every finding against the decisions in design.md. Reversing one takes evidence
  from the build; without it, leave the finding out.
- `git log --oneline <base>..HEAD`: how it was actually built.
- What the build taught us (from the agent that implemented it; take it seriously,
  it's the main input):
<learnings, or: "No notes from the build. Infer them: compare design.md with what
was built, and look for reworked areas in the commits and the diff.">
<if earlier review steps ran: Already done on this branch: <critique/overdrive tallies>.
Don't re-raise those.>

Scope: the diff (`git diff <base>...HEAD`), specs included, plus the code around
it: the functions and modules the diff touches, their direct callers, and sibling
modules doing the same job. For names the change removed or renamed, the whole repo.

Project rules:
<rules>

The project's conventions win: the rules above, CLAUDE.md or AGENTS.md, and the
patterns in sibling modules. Don't import a generic style the project doesn't use.
Every finding must name a concrete cost in this codebase ("the next export format
means editing 4 files", "these two copies already disagree on X"). A pattern name
("violates SRP") is fine as shorthand, never as the reason. It must also name what the
change itself risks; measure that when a throwaway benchmark can settle it.

Work through these in order:
1. Hindsight structure: given what the build taught us, would the module
   boundaries, the data shape, or where logic lives be different? (STRUCTURAL)
2. Duplication and reuse: logic repeated within the diff, or that an existing
   helper already provides.
3. Abstraction and altitude: the wrong level, a leaky abstraction, a premature
   one, or a missing one where the diff now has 3+ near-copies.
4. Leftovers from the build: dead code, abandoned approaches, scaffolding,
   temporary flags, compatibility shims, TODOs the change made obsolete, and uses of
   a removed or renamed name (search below).
5. Readability: misleading names on new surfaces, branching that hides the rule
   being applied.
6. Coupling and boundaries across process, module or service lines.
7. Scale: work that grows badly with the size of the data the project handles.
Tests get the same angles (copied setup, fixtures that should be shared, tests
pinned to details the learnings say will change); a test finding is always CODE.
Wrong behaviour you come across while doing this is a finding too, marked [BUG].

<removed-names>

Skip formatting, comment wording, renames that are down to taste, and speculative
generality. The formatter and linter own style. If a better *approach* entirely
(another algorithm, library or design) comes to mind, don't make it a finding: put
it in the approach note.

If a finding is partly in the diff and partly in surrounding code, and the in-diff part
stands on its own, split it into <n>a and <n>b, each with every line of the report
format. If it doesn't, keep one finding with `In diff: no (surrounding code)`.

<standing-rules>

Report (≤900 words), numbered findings, most impactful first:
<n>. [STRUCTURAL|CODE] [HIGH|MED|LOW] [BUG, if it fixes wrong behaviour] <file>:<line>
    What: <the change to make, concretely>
    Cost today: <the concrete cost of leaving it; for a [BUG], input → wrong result>
    Risk: <what making the change costs or could break (startup, speed, migration,
      behaviour) and how much is expected, or "none expected">; check: <the test to run,
      or what to measure before and after>
    Design: ok | reverses "<decision in design.md>": <what the build showed against it>
    Learned from: <the learning or commit that prompted it, or "fresh read">
    In diff: yes | no (surrounding code) | no (broken by the change)
    Size: S | M | L
Approach note: <one line, or "none">
If there's nothing worth changing, say so in one line (plus the approach note).
<report-lines>
```

## C. Fix agent

`subagent_type: "general-purpose"`. Used for accepted critique findings, accepted refactor
findings, accepted design findings, accepted review findings, full-suite failures,
manual-test failures, artifact updates (`C-artifacts`) and verification runs (`C-verify`).
Give it only what was accepted.

```
On branch `<change>` in <repo>, apply exactly these accepted
items, and nothing else except the artifact updates they call for:

<accepted items, verbatim from the finding report or user's failure description>

Project rules:
<rules>
<if pre-existing: Already failing before this change, not yours to fix; a run whose only
failures are these passes: <the state file's pre-existing specs, flaky ones left out>.>

Rules:
- Review findings and items marked [BUG]: confirm each bug before fixing it. If you
  can't, don't change code for it; report it as UNCONFIRMED.
- Any item that fixes wrong behaviour, whichever step it came from (review, refactor,
  critique, audit, the full suite, manual testing): add a regression test that fails
  without the fix; a test that's already failing for it counts. If the project's tests
  can't reach it, say why under TESTS. Pure restructuring, looks and copy need none.
- An item with a `Risk:` line: run its check, measuring before you edit and again after.
  If it comes out worse than the line expects, look for a cheaper way to do the same
  thing; failing that, undo your edits for that item and report it as SKIPPED with the
  numbers.
- An item includes every use of what it removes or renames: when you've edited, run the
  "Removed names" search below on your own edits (`git diff HEAD`).
- Don't widen the scope beyond that and the change artifacts. If a fix needs any other
  change, report it instead of making it.
<if C-verify: - These items are checks to run, not changes to make. Edit nothing, and skip
  the searches and the finishing lint and test. Report only, under CHECKS, each task id with
  the command and the result as printed, plus DENIED and LEFTOVERS.>
- Don't tick or untick tasks in tasks.md; the orchestrator does.
- Don't commit. Finish with `<lint>` and `<test>`; both must pass.

<standing-rules>

<removed-names>

<artifact-rules>

Report (≤250 words):
APPLIED: <item numbers, one line each on what changed>
UNCONFIRMED / SKIPPED: <item numbers and why>
TESTS: <item number and its regression test, or why it has none>
CHECKS: <item number: result of its Risk check, with the numbers, or "not run" and why>
DEVIATIONS: <as in Change artifacts>, or "none"
FILES: <changed paths>
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
<report-lines>
```

## D. Review agent

`subagent_type: "general-purpose"`

```
Review PR #<n> (branch `<change>`) in <repo>.

Invoke the Skill tool with skill `code-review` (the built-in one, not a plugin's
`<plugin>:code-review`) and args `high <n>`, and follow it. Don't use --fix or
--comment, and don't edit files. If the skill runs as an agent of its own, it can't see
the standing rules below: report any denial or stray write its result mentions as yours.

The orchestrator can't see ReportFindings output, so after the review, also put
the findings in your final message.

<standing-rules>

Report (≤500 words), findings most severe first:
<n>. [CONFIRMED|PLAUSIBLE] <category> <file>:<line>: <summary>
    Failure: <concrete input/state → wrong result>
If there are no findings, say so.
<report-lines>
```

## E. Test-plan agent

`subagent_type: "general-purpose"`

```
Write a manual test plan for the OpenSpec change `<change>` (PR #<n>, branch
`<change>`) in <repo>, as a plan JSON for the interactive test
runner. The user will run it by hand before the change is archived and merged.
Outside your scratch folder, write only the plan JSON and the built HTML, at the paths
given below; don't edit source or commit.

Inputs: openspec/changes/<change>/ (proposal, design, specs, tasks), the diff
(`git diff <base>...HEAD`), and the tests that already cover it.
<if any: Must include: <task id and its check, one per line>. One `req` case each, on top
of the 8 below and never cut; a task asking for a platform is `req` there.>

Project rules:
<rules>

Follow the analysis rules in <vp-dir>/SKILL.md section 2 ("find what can break
that automation won't catch"). In short, every case must cover a risk the
automated tests don't. Use a production/packaged build when the change touches
<manual_test.packaged_when>. <if ui.copy_guide: Check new UI copy against
<ui.copy_guide>.> Find real UI labels by grepping <ui.paths>; don't invent them.
Check commands, SQL and script paths against the repo.

The plan follows Safety too: Setup puts each platform on throwaway data before anything
starts the app. If a risk only shows on real data, the case says so in `why` and a Setup
item backs that data up first. Where Safety doesn't say how to isolate a platform, say so
in the Setup step and list it under UNVERIFIED.

Format: <vp-dir>/references/plan-schema.md. Skim the items of
<vp-dir>/examples/settings-export.plan.json for the level of detail a runnable
step needs. Keep the plan short: 3–8 cases, 8 at most. A case counts once, whatever
its platforms; setup items (section `S`) don't count, but they only prepare and
never test the change. If more than 8 look worthwhile, keep the 8 that cover the
most serious risks and report the rest as CUT. Don't merge cases to fit: one case
tests one thing.
- `id`: `<change>`. `title`: "Manual test: <plain-English title>". `pageTitle`:
  2–4 words. `subtitle`: "PR #<n> · branch `<change>`".
  `target`: {kind: "openspec", ref: "<change>"}.
- Platforms, all present, from this config (the first is primary):
<manual_test.platforms, verbatim>
  Every case applies to every platform. It's `req` on the primary platform, and
  `req` on the others only where the OS can change the outcome
  (<manual_test.require_when>); otherwise `opt`. Where steps or commands differ,
  give each platform its own with `only`.
- Sections: `S` Setup, then one or two letters for the cases. Setup builds the
  app on each platform as its `build` says (dev or packaged; say which and why in
  `why`), each with a `commit` field wired into that platform's `meta`. Setup ids
  are `S` + the platform's initial + a number (`SL1`, `SM1`).
- `order`: one per platform, listing every item that applies to it (setup first).
- One `risks` entry per risk; every case cites at least one.
- `covered`: what automated tests already cover, with the test file paths.
- Every step has commands as `cmd` (copyable) where the tester types anything:
  paths, SQL, shell. `expect` holds observable facts, one per line.
- `exit`: an `allRequired` criterion and a `failuresResolved` criterion.
<If resuming with new cases: read the existing plan JSON, append the new items with
new ids, and never renumber, rename or reuse an existing id or field key.>
<If revising for Safety: the same, and the tester may have started. Put isolation in new
Setup items, first in every `order`. In existing items only reword a step's text or `cmd`;
ticks are stored by position, so don't add, remove or reorder steps.>

Save it to <git-dir>/openspec-ship/<change>.plan.json, then build and smoke-test:

  node <vp-dir>/scripts/build.mjs <plan.json> \
    --max-cases <8 plus the number of must-include tasks> --html <out>/<change>-test.html
  NODE_PATH=<node_modules with jsdom> node <vp-dir>/scripts/smoke.cjs <out>/<change>-test.html

The smoke test needs jsdom. Use the repo's node_modules if it has jsdom;
otherwise `npm i --prefix <agent-dir>/vp jsdom` and use
<agent-dir>/vp/node_modules. Fix the JSON until both pass with no warnings. For the
case-cap warning, that means removing cases and listing them as CUT.
<If resuming or revising: leave out --max-cases.>
Don't publish.

<standing-rules>

Report (≤250 words):
HTML: <path to the built runner>
BUILD: dev | packaged, and why
CASES: <id — title — req|opt, one per line>
OUT OF SCOPE: <what automation already covers, one line each with the test file>
<if any: MUST INCLUDE: <case id → task id, one per line>>
CUT: <cases left out for the cap — the risk each covered, one line each, or "none">
UNVERIFIED: <commands or UI labels you couldn't confirm, or "none">
<report-lines>
```

## E-light. Light test-plan agent

`subagent_type: "general-purpose"`

```
Write a short manual verification checklist for the OpenSpec change `<change>`
(PR #<n>, branch `<change>`) in <repo>. The user ticks it in the PR body before
merge. Don't edit files or commit; send the checklist back in your report.

Inputs: openspec/changes/<change>/ (proposal, specs, tasks), the diff
(`git diff <base>...HEAD`), and the tests that already cover it.
Include only what the automated tests don't already prove: how it looks, how it
feels, real data, <if manual_test.packaged_when: a production build where the
change touches <manual_test.packaged_when>>. <if ui.paths: Find real UI labels by
grepping <ui.paths>; don't invent them.>
<if any: Must include: <task id and its check, one per line>. One item each, on top of the
3–6 below.>
<If revising for Safety: the checklist as it stands is: <the section from the live PR body>.
Send the whole section back: keep each item's tick and order, reword items where Safety
needs it, and add new ones at the end.>

Project rules:
<rules>

The user's machine may hold real data: every command and action in the checklist
follows Safety below, and an item that needs real data says to back it up first.

<standing-rules>

Report (≤200 words). First these lines, which the orchestrator keeps out of the PR:
<if any: MUST INCLUDE: <item number → task id, one per line>>
<report-lines>
Then exactly this markdown, and nothing after it:
## Manual verification

Build: <dev or production build, with the command>, <why, a few words>
<if safety isn't `none`: Data: <the throwaway data to test against and how to start
on it; no personal paths, the PR may be public>>

- [ ] <one action> → <the observable expected result>
(3–6 items; add "(<platform label>)" to an item only where the OS changes the outcome)
```

## F. Design audit agent

`subagent_type: "general-purpose"`

```
Audit, without editing, the UI changes in the OpenSpec change `<change>` on
branch `<change>` in <repo>. Don't edit files or commit, and
don't write PRODUCT.md, <ui.design_doc> or impeccable config. Report findings only.
Another agent applies the ones that are accepted.

Changed UI paths:
<output of `git diff --name-only <base>...HEAD -- <ui.paths>`>

Invoke the Skill tool with the impeccable skill (`impeccable`, or
`impeccable:impeccable` when installed as a plugin) and args `audit <paths
above>`, and follow its setup and audit playbook. Ignore its parts that make
changes or offer follow-up commands. Pass the main changed component as `--target`
to its context step. <if ui.design_doc: <ui.design_doc> is the visual source of
truth.> <if ui.copy_guide: Also check new UI strings against <ui.copy_guide>.>

Project rules:
<rules>

Scope: report only issues the diff introduced (`git diff <base>...HEAD`). Mark
issues in surrounding, untouched code as such. Skip the health score table<if
ui.skip: , and skip: <ui.skip>>.

<standing-rules>

Report (≤400 words), findings most severe first:
<n>. [P0|P1|P2|P3] <category> <file>:<line>: <what's wrong, concretely>
    Rule: <the design-doc section, WCAG criterion or copy-guide entry it breaks>
    Fix: <the concrete change, e.g. which token replaces which value>
    In diff: yes | no (surrounding code)
If there's nothing worth changing, say so in one line.
<report-lines>
```

## G1. Critique design-review agent

`subagent_type: "general-purpose"`. Spawned in the same message as G2; the two must not
see each other's output.

```
Run Assessment A (design review) of an impeccable critique, without editing, on
the UI changes in the OpenSpec change `<change>`, branch `<change>`, in
<repo>. Don't edit files or commit, and don't write
PRODUCT.md, <ui.design_doc>, impeccable config or critique snapshots.

Changed UI paths:
<output of `git diff --name-only <base>...HEAD -- <ui.paths>`>

Read <impeccable-dir>/reference/critique.md: "Assessment A: Design Review" and the
inline sections it points to (cognitive load, heuristics scoring, personas). Do
only Assessment A. Skip the detector, the orchestration, the synthesis,
persistence and the closing question. Read the proposal in
openspec/changes/<change>/ for intent. <if ui.design_doc: <ui.design_doc> is the
visual source of truth.> <if ui.copy_guide: Check new UI strings against
<ui.copy_guide>.>

Project rules:
<rules>

Look at the running app. Start it in the background with `<ui.run>`, then:
<ui.view>
Set up the states the change adds (clicks, empty, loading and error states) and
screenshot each one into <agent-dir>. Read the screenshots. Stop the app before
you report. If it won't start, say so and review from source.

Scope: judge what the diff introduced. Skip the heuristic score table<if ui.skip:
, and skip: <ui.skip>>.

<standing-rules>

Report (≤450 words):
SPECIFICITY: <one line: grounded in this product, or generic>
STRENGTHS: <2–3, one line each>
FINDINGS, most severe first:
<n>. [P0|P1|P2|P3] <heuristic or area> <file>:<line>: <the problem, as the user meets it>
    Fix: <the concrete change>
    In diff: yes | no (surrounding code)   Scope: in proposal | beyond proposal
VIEWED: <screens/states screenshotted, or why the app couldn't be viewed>
<report-lines>
```

## G2. Critique detector agent

`subagent_type: "general-purpose"`

```
Run Assessment B (detector evidence) of an impeccable critique on the UI changes
in the OpenSpec change `<change>`, branch `<change>`, in
<repo>. Don't edit files or commit.

Changed UI paths (markup only; leave out CSS-only files):
<output of `git diff --name-only <base>...HEAD -- <ui.paths>`>

Read "Assessment B" in <impeccable-dir>/reference/critique.md, then run its
detector with `--json` over the paths above (the script lives under
<impeccable-dir>/scripts/). Exit 0 is clean, 2 means findings. Skip browser
visualization, the live server and overlay injection, and say so. Keep only hits
on lines the diff touched (`git diff <base>...HEAD`); count the rest.

<standing-rules>

Report (≤250 words):
DETECTOR: ran | unavailable (<reason>)
HITS IN DIFF: <n>. [<rule>] <file>:<line>: <one line>
FALSE POSITIVES: <hit and why, one line each>
OUTSIDE DIFF: <count by rule>
<report-lines>
```

## H. Overdrive agent

`subagent_type: "general-purpose"`. Two phases: this prompt proposes; the orchestrator
resumes the same agent with `SendMessage` to build.

```
Run impeccable overdrive on the UI changes in the OpenSpec change
`<change>`, branch `<change>`, in <repo>. Don't commit, and don't write PRODUCT.md,
<ui.design_doc> or impeccable config.

Changed UI paths:
<output of `git diff --name-only <base>...HEAD -- <ui.paths>`>

Invoke the Skill tool with the impeccable skill (`impeccable`, or
`impeccable:impeccable` when installed as a plugin) and args `overdrive <main
changed component>`. Read the proposal in openspec/changes/<change>/ for what the
UI is for<if ui.design_doc: , <ui.design_doc> for the visual system><if
ui.copy_guide: , and <ui.copy_guide> for the product's character>. Fit the
direction to that character: for a tool people use for hours, "extraordinary"
usually means how it feels (instant, fluid, exact), not spectacle.

Project rules:
<rules>
<if pre-existing: Already failing before this change, not yours to fix; a run whose only
failures are these passes: <the state file's pre-existing specs, flaky ones left out>.>

You can't talk to the user. Overdrive's "Propose Before Building" step is yours to
do now, but instead of asking, STOP after proposing and report. Don't edit files in
this phase. You'll be resumed with the user's pick.

<standing-rules>

Phase 1 report (≤300 words):
DIRECTIONS:
<n>. <name>: <what the user sees and feels, 1–2 lines>
   Technique: <APIs/approach>   Cost: <performance, complexity, reduced-motion path>
FIT: <one line per direction on how it fits the product>
<report-lines>

When resumed with a pick, build only that direction, only on the change's surfaces.
Respect prefers-reduced-motion and the design doc's tokens. Add the direction to
openspec/changes/<change>/design.md and a task for building it to tasks.md, ticked only
if you saw it work after your last edit (else unticked, and say why). Verify it in the
running app: start `<ui.run>` in the background and screenshot into <agent-dir>
as <ui.view> describes, at most two fix rounds, then stop the app. Finish with
`<lint>` and `<test>`.

<artifact-rules>

Phase 2 report (≤200 words):
BUILT: <what, one line>
FILES: <changed paths>
VERIFIED: <states screenshotted, or why not>
DEVIATIONS: <as in Change artifacts>, or "none"
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
<report-lines>
```

## I. Polish agent

`subagent_type: "general-purpose"`

```
Run impeccable polish on the UI changes in the OpenSpec change `<change>`,
branch `<change>`, in <repo>. Edit, but don't commit, and don't write PRODUCT.md,
<ui.design_doc> or impeccable config.

Changed UI paths:
<output of `git diff --name-only <base>...HEAD -- <ui.paths>`>

Invoke the Skill tool with the impeccable skill (`impeccable`, or
`impeccable:impeccable` when installed as a plugin) and args `polish <paths
above>`, and follow it. Polish is refinement: keep the incumbent design, copy and
behavior. Edit only the files listed above. If something needs a redesign, a
change to another file, or a copy change that alters meaning, don't make it;
report it. <if ui.design_doc: <ui.design_doc> is the visual source of truth.> <if
ui.copy_guide: New UI strings follow <ui.copy_guide>.>

Project rules:
<rules>
<if pre-existing: Already failing before this change, not yours to fix; a run whose only
failures are these passes: <the state file's pre-existing specs, flaky ones left out>.>

<if ui.skip: Skip: <ui.skip>.> To see the UI, start `<ui.run>` in the background
and screenshot into <agent-dir> as <ui.view> describes; one inspection round, one fix
batch, at most one confirming round, then stop the app. You can't talk to the user:
where polish says to ask, report it instead. Finish with `<lint>` and `<test>`.

<standing-rules>

<artifact-rules>

Report (≤250 words):
EDITS: <file>:<line>: <what changed and why, one line each>
DEVIATIONS: <as in Change artifacts>, or "none"
NOT CHANGED: <what you'd change but didn't, and why: redesign, out of scope, needs a
  decision>
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
<report-lines>
```

---

## Rubric: critique findings

The orchestrator picks without the user, so the bar is high: a **meaningful** problem a
user of this change will **likely** run into, in what the diff added, fixable within the
proposal. Test each finding with two questions: would a user notice it within their
first few uses of the feature? Would fixing it change what they can do or understand?
Two yeses or it's dropped.

- **Accept**: a state the change adds and users will reach but that isn't designed
  (empty, loading, error, partial data). A hierarchy that buries the primary action.
  Copy that misleads about what the product did, or that breaks the copy guide or a
  project rule. No feedback after an action, so the user can't tell it worked. A G2
  detector hit that confirms one of these.
- **Follow-up, not now**: the same kinds of problems in untouched code, or a fix that
  goes beyond the proposal (new views, flows or settings).
- **Drop**:
  - Nitpicks: spacing, wording preferences, icon choice, "bolder" or "quieter", and other
    taste.
  - Unlikely scenarios: edge cases that need unusual data, input or a sequence to reach
    (a 500-character title, a mid-transition double click), unless the outcome is data
    loss or misleading output.
  - Heuristic scores on their own, and findings with no concrete fix.
  - Anything in `ui.skip`, and P3 polish.
  - Anything the design audit would catch (token values, contrast ratios; those belong
    to step 3b).
  - Detector hits G2 marked as false positives.

The agent's P0–P3 is input, not a verdict: a P1 that's taste or an unlikely edge case is
still dropped. Expect to accept two or three findings at most; accepting more usually
means the bar slipped.

---

## Rubric: refactor findings

The bar: **with what we know now, would we have written it this way, and does the
change pay for itself the next time someone touches this code?** Most hindsight
refactors are things no reviewer would block a PR over, which is exactly why they
never get done otherwise. So the bar is lower than "blocking", and the Drop list is
what keeps it from becoming churn.

- **Accept**: it would make the next change to this code easier or safer, and it's
  in proportion to the change. Typical: it reshapes structure the learnings showed
  was wrong; removes duplication, especially with an existing helper; fixes an
  abstraction or name that would mislead the next reader; deletes leftovers from the
  build (dead code, abandoned approaches, scaffolding); cuts coupling across process
  or module boundaries; removes work that grows with data size on a hot path;
  collapses branching that hides the rule being applied. Also a [BUG] in the diff with
  a concrete wrong result, and anything marked `no (broken by the change)`, unless it's
  in a gitignored file: tell the user about those, since no agent edits them.
- **Follow-up, not now**: a worthwhile change to code the diff doesn't touch, one
  that's L-sized compared with the change, or one whose Risk users would feel and the
  fix agent can't check. List it in the PR body with its Risk; the user decides whether
  it becomes an issue. The agent's approach note goes here too, untriaged.
- **Drop**: formatting, import order, renaming that's down to taste, comment wording,
  splitting a function that reads fine, micro-optimisations off the hot path,
  speculative generality ("in case we add another backend"), anything that only
  restyles, and anything justified by a pattern name rather than a concrete cost. Also
  anything whose Risk outweighs its Cost today (a slower start for every user to save the
  next developer an edit), and a design reversal without evidence from the build.

What goes to the user first is in SKILL.md step 3. A finding against a test is never
structural.

Triage each part of a split finding (4a, 4b) on its own, and count it as a finding in the
tally: typically 4a is accepted and 4b becomes a follow-up. If a finding has no `Risk:` or
`Design:` line, ask the same agent for it before you triage it.

The agent's tags are input, not a verdict: a HIGH that's really taste is still
dropped, and a CODE finding that moves module boundaries is structural.

## Rubric: design findings

Accept a finding when the diff introduced it and it breaks a written rule:

- **Accept**: a hard-coded color, font, size or spacing where the design doc defines a
  token. A component that departs from its design-doc spec. A WCAG AA failure: contrast,
  missing label or role, a keyboard trap, no focus indicator, motion without a
  reduced-motion path. UI copy that breaks the copy guide. Anything that breaks a UI
  rule in the project's `rules`.
- **Follow-up, not now**: the same kinds of issues in code the diff doesn't touch.
- **Drop**: health scores, "bolder" or "quieter" suggestions and other taste, anything in
  `ui.skip`, P3 polish, perf guesses without a measured hot path, and anything that asks
  to redesign beyond the proposal's scope.

The agent's P0–P3 is input, not a verdict. If a finding cites no rule from the design
doc, WCAG, the copy guide or the project rules, drop it.

## Rubric: review findings

Fix only **critical bugs**. A critical bug has a concrete failure scenario with one of
these outcomes:

- wrong results the user acts on
- data loss or corruption (database rows, the user's files, saved work)
- a crash, hang or failed startup, including failures that only show in a production
  build
- a privacy or security breach: personal data in logs or sent off the machine,
  unsanitised paths or input, injection (SQL that isn't parameterised, shell built
  from strings)
- a broken migration
- a test that passes without testing the behaviour it claims to
- anything in the project config's `critical` list

Drop: style, naming, readability, missing tests for code that's otherwise correct,
PLAUSIBLE findings whose failure scenario is vague, and findings settled in steps 2a–3b.
A PLAUSIBLE finding with a severe, concrete scenario goes to the fix agent marked
"confirm first".
