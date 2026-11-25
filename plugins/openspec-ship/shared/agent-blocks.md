# Shared agent blocks

Text that goes into agent prompts, used by more than one skill in this plugin. Subagents
don't see this file: replace the lines `<standing-rules>`, `<removed-names>`,
`<artifact-rules>` and `<report-lines>` in a prompt with the full text of these blocks,
their own placeholders filled in. The exception is `<command>` and `<gate>` in the standing
rules, which the agent fills in. The skill that writes the prompt says what `<safety>`,
`<agent-dir>`, `<base>` and `<change-dir>` are.

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
LOG="<agent-dir>/<gate>.log"; (
  set -eo pipefail
  <command>
) > "$LOG" 2>&1; rc=$?; tail -n 40 "$LOG"; exit $rc

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
