---
name: hindsight-refactor
description: Review work that is already built (an OpenSpec change, a branch, a PR or a described feature) with hindsight, triage the findings, and apply the ones the user picks. It asks what the build taught that the plan didn't know, and where the code still carries the old shape. Use this whenever the user wants a hindsight refactor or review, asks "knowing what we know now, what would we do differently?" or "what would you change if you started over?", or wants a feature restructured or cleaned up after building it, before it merges or later. For the Refactor step of a whole ship, openspec-ship runs this pass itself.
---

# Hindsight refactor

Building a feature teaches things its plan didn't know. This skill finds where the code
still has the shape of what was thought before that, and reshapes it while it's cheap.

A fresh agent reviews and never edits. You triage its findings, the user picks, and you
apply what they picked. Keep those apart: a reviewer that also edits starts defending its
edits.

Files this skill uses:

- `references/review-agent.md`: the review agent's prompt.
- `references/triage.md`: what to accept, defer and drop, and what the user decides.
- `${CLAUDE_SKILL_DIR}/../../shared/agent-blocks.md`: the blocks that prompt pastes in, and
  two you follow yourself in step 5.

## 0. Project config

If the repo has `.claude/openspec-ship.yaml`, read it for `base`, `commands.lint`,
`commands.test`, `rules`, `safety` and `commits`. Without it, `<base>` is the default
branch, and you find the lint and test commands in the repo (`package.json`, `Makefile`, CI
config).

**Safety** binds the commands you and the agent run. No config, or a config without
`safety`: carry on, but a missing key isn't `none`. Put "Not stated for this project: run
only commands that read. No tests, app, builds or benchmarks." in the agent's prompt as
`<safety>`, and ask at the checkpoint how to run the lint and tests without touching real
data.

## 1. Pin down the target

The user names one of these:

- **OpenSpec change**: `openspec/changes/<name>/`, or under `archive/`. `<plan-docs>` are
  its proposal.md, design.md and tasks.md, and `<change-dir>` is that folder.
- **Branch or PR**: compared with its base. `<plan-docs>` are the PR description
  (`gh pr view <n>`, saved to the scratch folder) and any ADR or design doc it touches.
- **Merged work**: `<base>` is the commit before it, and `<log>` and `<diff>` cover only
  its commits. Findings are about the code as it is now.
- **Described feature**: find its code, and the commits that built it. If they don't make
  one range, the feature's files are the scope: say so in `<diff>`'s place, and `In diff:
  yes` then means in those files.

With no name, take the current branch if it has work that isn't on `<base>`; otherwise ask.
If no plan was written down, say that in `<plan-docs>`' place. The target has to be checked
out: switch to it only from a clean tree, otherwise ask.

Uncommitted work that belongs to the target is part of it: `<diff>` becomes `git diff
--merge-base <base>`, and name the untracked files next to it. Ask if you can't tell
whether it belongs.

If `$(git rev-parse --git-dir)/openspec-ship/<name>.md` exists and its `step:` isn't
`7-merged`, a ship is in flight: say which step it's on and ask whether to resume it or run
this pass outside it. Don't edit that file.

## 2. Collect the learnings

They are the review's main input. Write down, in at most 150 words, every source you have:

- what the user said when they invoked this, verbatim;
- this session, if it built the feature: where you departed from the plan and why, what
  turned out harder or different, workarounds left in, approaches abandoned, and "if I
  started again I'd …", with file or symbol names;
- `learnings:` in the ship's state file, verbatim.

With none, use the prompt's fallback: the agent infers them from the commits.

## 3. Review

`mkdir` a folder of its own for the agent in the session's scratch directory
(`<agent-dir>`). Record `git status --porcelain` and `git diff HEAD | shasum`. Fill in the
prompt and spawn the agent. A prompt that still contains a placeholder the two reference
files don't leave to the agent isn't ready to send.

When it returns:

- `DENIED:` first. A denied command is the user's decision: tell them what it was and what
  was skipped, and don't run it yourself or pass it to another agent.
- Compare the two recordings. If the agent changed anything, show the user what and ask
  whether to keep it, before any `git restore`: the tree may hold their own edits too.
- Mention anything under `LEFTOVERS:` outside the agent's folder. Deleting it is the
  user's call.

## 4. Triage and checkpoint

Triage every finding with `references/triage.md`. Then show the user, in one block:

1. the findings "What the user decides" covers, in the form it gives;
2. the other accepted ones, one line each;
3. follow-ups, each with its Risk, and the approach note;
4. dropped ones, a few words each on why.

Ask once which to apply: all as proposed, a selection, or none, which makes this a report
and ends it here. Put the safety question from step 0 in the same message if it's open.
Edit nothing before the answer.

## 5. Apply

If the checkout is `<base>` itself, create a branch first. Apply exactly what was picked,
and for a split finding only that part:

- **[BUG]**: confirm it before fixing it, and add a regression test that fails without the
  fix. One you can't confirm is dropped, with a note.
- **`Risk:`**: run its check before you edit and again after. If it comes out worse than
  the line expects, look for a cheaper way; failing that, undo that finding's edits and make
  it a follow-up with the numbers.
- **Removed or renamed names**: run the `<removed-names>` search on your own edits (`git
  diff HEAD`) and fix every hit your edits broke.
- **OpenSpec change**: follow `<artifact-rules>`, so its artifacts still describe the code.
  For any other target, update the doc that records a reversed decision.
- Anything else a finding turns out to need is reported, not done.

Finish with lint and tests, run the way `safety` or the user said, in the form under "Exit
codes" in `<standing-rules>`, with the logs in the session's scratch directory. Both have to
pass; a failure the edits didn't cause is named in the report. Leave the result uncommitted unless the user asked for a commit; then use
`commits.style`, or match `git log --oneline -20`.

## 6. Report

```
Hindsight refactor — <target>
Tally: <n> findings, <n> applied (<n> structural), <n> follow-ups, <n> dropped
Applied: <one line each>
Backed out or unconfirmed: <finding and why; leave out if none>
Checks: <lint, tests; each Risk check with its numbers; what didn't run, and why>
Follow-ups: <one line each with its Risk, or "none">
Denied / Leftovers: <leave out if none>
```

If there's an open PR for the branch, offer to add the tally and follow-ups to its body.
