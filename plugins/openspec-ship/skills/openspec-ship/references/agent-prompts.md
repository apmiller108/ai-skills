# Agent prompts and triage rubrics

Fill in the `<…>` placeholders. `<repo>` is the output of `git rev-parse --show-toplevel`.
Config values (`<lint>`, `<test>`, `<test_paths>`, `<base>`, `<ui.*>`, `<manual_test.*>`)
come from `.claude/openspec-ship.yaml`. `<rules>` is that file's `rules` block, verbatim;
leave the "Project rules" line out if it has none. A line marked `<if …>` is included only
when the condition holds. `<impeccable-dir>` and `<vp-dir>` are the absolute paths
recorded in the state file.

Every prompt ends with a report format and a word cap. The cap is what keeps the
orchestrator's context small, so keep it in.

## Contents

- [A. Apply agent](#a-apply-agent)
- [B. Simplify agent](#b-simplify-agent)
- [C. Fix agent](#c-fix-agent)
- [D. Review agent](#d-review-agent)
- [E. Test-plan agent](#e-test-plan-agent)
- [E-light. Light test-plan agent](#e-light-light-test-plan-agent)
- [F. Design audit agent](#f-design-audit-agent)
- [G1. Critique design-review agent](#g1-critique-design-review-agent)
- [G2. Critique detector agent](#g2-critique-detector-agent)
- [H. Overdrive agent](#h-overdrive-agent)
- [I. Polish agent](#i-polish-agent)
- [Rubric: simplify findings](#rubric-simplify-findings)
- [Rubric: critique findings](#rubric-critique-findings)
- [Rubric: design findings](#rubric-design-findings)
- [Rubric: review findings](#rubric-review-findings)

---

## A. Apply agent

`subagent_type: "general-purpose"`

```
Implement the OpenSpec change `<change>` in <repo>, on the
branch `<change>` (already checked out; don't switch branches or commit).

Invoke the Skill tool with `openspec-apply-change` and the change name, then follow
it through every task.

Project rules:
<rules>

You can't talk to the user. Where the skill says to pause and ask (an unclear task,
a design problem in the proposal, a blocker), stop and report it as BLOCKED instead
of guessing. You may be resumed with an answer.

When the tasks are done, run `<lint>` and the unit specs covering what you
touched (<if test_paths: `<test_paths>`; otherwise: `<test>`>), and fix any failures.

Report (≤250 words):
STATUS: DONE | BLOCKED
TASKS: <n>/<m> checked
FILES: <changed paths, grouped by area>
SUMMARY: <one line, what the change does>
TESTS: <specs added or changed; result of the runs>
BLOCKED ON (if blocked): <the question, the options you see, and which you'd pick>
NOTES: <anything the orchestrator must know: artifact edits, deviations from the proposal>
```

## B. Simplify agent

`subagent_type: "code-simplifier:code-simplifier"` if available, else `"general-purpose"`.

```
Review, without editing, the OpenSpec change `<change>` on branch `<change>` in
<repo>. Don't edit files and don't commit; report findings only.
Another agent applies the ones that are accepted.

Scope: the diff (`git diff <base>...HEAD`) plus the code around it, meaning the
functions and modules the diff touches, their direct callers, and sibling modules
doing the same job.

Project rules:
<rules>

Look for changes that matter for maintainability, readability or scalability:
duplicated logic (including logic that existing shared helpers already provide),
the wrong abstraction or a leaky one, misleading names on new public surfaces, dead
code the change left behind, needless coupling across process, module or service
boundaries, and work that grows badly with the size of the data the project
handles. Skip formatting, comment wording and taste. The formatter and linter own
those.

Report (≤500 words), numbered findings, most impactful first:
<n>. [HIGH|MEDIUM|LOW] <file>:<line>: <what to change, concretely>
    Why: <the maintainability/readability/scalability effect, one line>
    In diff: yes | no (surrounding code)
    Size: S | M | L
If there's nothing worth changing, say so in one line.
```

## C. Fix agent

`subagent_type: "general-purpose"`. Used for accepted critique findings, accepted simplify
findings, accepted design findings, accepted review findings, full-suite failures and
manual-test failures. Give it only what was accepted.

```
On branch `<change>` in <repo>, apply exactly these accepted
items, and nothing else:

<accepted items, verbatim from the finding report or user's failure description>

Project rules:
<rules>

Rules:
- <for review findings>: confirm each bug before fixing it, and add a regression
  test that fails without the fix. If you can't confirm a bug, don't change code
  for it; report it as UNCONFIRMED.
- Don't widen the scope. If a fix needs a change outside these items, report it
  instead of making it.
- Don't commit. Finish with `<lint>` and `<test>`; both must pass.

Report (≤200 words):
APPLIED: <item numbers, one line each on what changed>
UNCONFIRMED / SKIPPED: <item numbers and why>
FILES: <changed paths>
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
```

## D. Review agent

`subagent_type: "general-purpose"`

```
Review PR #<n> (branch `<change>`) in <repo>.

Invoke the Skill tool with skill `code-review` (the built-in one, not a plugin's
`<plugin>:code-review`) and args `high <n>`, and follow it. Don't use --fix or
--comment, and don't edit files.

The orchestrator can't see ReportFindings output, so after the review, also put
the findings in your final message.

Report (≤500 words), findings most severe first:
<n>. [CONFIRMED|PLAUSIBLE] <category> <file>:<line>: <summary>
    Failure: <concrete input/state → wrong result>
If there are no findings, say so.
```

## E. Test-plan agent

`subagent_type: "general-purpose"`

```
Write a manual test plan for the OpenSpec change `<change>` (PR #<n>, branch
`<change>`) in <repo>, as a plan JSON for the interactive test
runner. The user will run it by hand before the change is archived and merged.
Write only the plan JSON and the built HTML; don't edit source or commit.

Inputs: openspec/changes/<change>/ (proposal, design, specs, tasks), the diff
(`git diff <base>...HEAD`), and the tests that already cover it.

Project rules:
<rules>

Follow the analysis rules in <vp-dir>/SKILL.md section 2 ("find what can break
that automation won't catch"). In short, every case must cover a risk the
automated tests don't. Use a production/packaged build when the change touches
<manual_test.packaged_when>. <if ui.copy_guide: Check new UI copy against
<ui.copy_guide>.> Find real UI labels by grepping <ui.paths>; don't invent them.
Check commands, SQL and script paths against the repo.

Format: <vp-dir>/references/plan-schema.md. Skim the items of
<vp-dir>/examples/settings-export.plan.json for the level of detail a runnable
step needs. Keep the plan short (typically 3–8 cases):
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

Save it to <git-dir>/openspec-ship/<change>.plan.json, then build and smoke-test:

  node <vp-dir>/scripts/build.mjs <plan.json> --html <scratchpad>/<change>-test.html
  NODE_PATH=<node_modules with jsdom> node <vp-dir>/scripts/smoke.cjs <scratchpad>/<change>-test.html

The smoke test needs jsdom. Use the repo's node_modules if it has jsdom;
otherwise `npm i --prefix <scratchpad>/vp jsdom` and use
<scratchpad>/vp/node_modules. Fix the JSON until both pass with no warnings.
Don't publish.

Report (≤250 words):
HTML: <path to the built runner>
BUILD: dev | packaged, and why
CASES: <id — title — req|opt, one per line>
OUT OF SCOPE: <what automation already covers, one line each with the test file>
UNVERIFIED: <commands or UI labels you couldn't confirm, or "none">
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

Project rules:
<rules>

Report (≤200 words), exactly this markdown and nothing else:
## Manual verification

Build: <dev or production build, with the command>, <why, a few words>

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

Report (≤400 words), findings most severe first:
<n>. [P0|P1|P2|P3] <category> <file>:<line>: <what's wrong, concretely>
    Rule: <the design-doc section, WCAG criterion or copy-guide entry it breaks>
    Fix: <the concrete change, e.g. which token replaces which value>
    In diff: yes | no (surrounding code)
If there's nothing worth changing, say so in one line.
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
screenshot each one into <scratchpad>. Read the screenshots. Stop the app before
you report. If it won't start, say so and review from source.

Scope: judge what the diff introduced. Skip the heuristic score table<if ui.skip:
, and skip: <ui.skip>>.

Report (≤450 words):
SPECIFICITY: <one line: grounded in this product, or generic>
STRENGTHS: <2–3, one line each>
FINDINGS, most severe first:
<n>. [P0|P1|P2|P3] <heuristic or area> <file>:<line>: <the problem, as the user meets it>
    Fix: <the concrete change>
    In diff: yes | no (surrounding code)   Scope: in proposal | beyond proposal
VIEWED: <screens/states screenshotted, or why the app couldn't be viewed>
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

Report (≤250 words):
DETECTOR: ran | unavailable (<reason>)
HITS IN DIFF: <n>. [<rule>] <file>:<line>: <one line>
FALSE POSITIVES: <hit and why, one line each>
OUTSIDE DIFF: <count by rule>
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

You can't talk to the user. Overdrive's "Propose Before Building" step is yours to
do now, but instead of asking, STOP after proposing and report. Don't edit files in
this phase. You'll be resumed with the user's pick.

Phase 1 report (≤300 words):
DIRECTIONS:
<n>. <name>: <what the user sees and feels, 1–2 lines>
   Technique: <APIs/approach>   Cost: <performance, complexity, reduced-motion path>
FIT: <one line per direction on how it fits the product>

When resumed with a pick, build only that direction, only on the change's surfaces.
Respect prefers-reduced-motion and the design doc's tokens. Add the direction to
openspec/changes/<change>/design.md and a checked task for it to tasks.md. Verify it
in the running app: start `<ui.run>` in the background and screenshot as
<ui.view> describes, at most two fix rounds, then stop the app. Finish with
`<lint>` and `<test>`.

Phase 2 report (≤200 words):
BUILT: <what, one line>
FILES: <changed paths>
VERIFIED: <states screenshotted, or why not>
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
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

<if ui.skip: Skip: <ui.skip>.> To see the UI, start `<ui.run>` in the background
and screenshot as <ui.view> describes; one inspection round, one fix batch, at
most one confirming round, then stop the app. You can't talk to the user: where
polish says to ask, report it instead. Finish with `<lint>` and `<test>`.

Report (≤250 words):
EDITS: <file>:<line>: <what changed and why, one line each>
NOT CHANGED: <what you'd change but didn't, and why: redesign, out of scope, needs a decision>
GATE: lint <pass/fail>, unit <pass/fail> (paste only failures)
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

## Rubric: simplify findings

Accept a finding when doing it now makes the code **meaningfully** easier to change,
read or scale, and it's in proportion to the change:

- **Accept**: it removes duplication, especially with an existing helper. It fixes
  an abstraction or name that would mislead the next reader of a new public surface.
  It deletes dead code the change left behind. It cuts coupling across process or
  module boundaries. It removes work that grows with data size on a hot path. It
  collapses branching that hides the rule being applied.
- **Follow-up, not now**: a worthwhile change to code the diff doesn't touch, or one
  that's L-sized compared with the change. List it in the PR body; the user decides
  whether it becomes an issue.
- **Drop**: formatting, import order, renaming that's down to taste, comment wording,
  splitting a function that reads fine, micro-optimisations off the hot path,
  speculative generality ("in case we add another backend"), and anything that only
  restyles.

When unsure, ask: "Would a reviewer reasonably block the PR over this?" If not, drop it.
The agent's HIGH/MEDIUM/LOW is input, not a verdict: a HIGH that's really taste is
still dropped.

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
PLAUSIBLE findings whose failure scenario is vague, and duplicates of simplify findings.
A PLAUSIBLE finding with a severe, concrete scenario goes to the fix agent marked
"confirm first".
