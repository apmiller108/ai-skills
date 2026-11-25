# The review agent

The prompt for the agent that does the hindsight review (`subagent_type:
"general-purpose"`). It reports and never edits. Fill it in before spawning; the agent
doesn't see this file.

| Placeholder | Value |
|---|---|
| `<target>` | what is reviewed and where it's checked out, e.g. "the OpenSpec change `x` on branch `x`" |
| `<repo>` | `git rev-parse --show-toplevel` |
| `<base>` | the commit or branch the work is compared with |
| `<plan-docs>` | the files that record what was planned and decided, by path |
| `<log>`, `<diff>` | commands: `git log --oneline <base>..HEAD` and `git diff <base>...HEAD`, unless the caller needs others |
| `<learnings>` | what the build taught, verbatim |
| `<rules>` | the config's `rules`, verbatim. With none, leave out "Project rules:" and it, and write "CLAUDE.md or AGENTS.md" for "the rules above, CLAUDE.md or AGENTS.md" |
| `<standing-rules>`, `<removed-names>`, `<report-lines>` | the blocks in `shared/agent-blocks.md` at the plugin root |

A line marked `<if …>` is included only when the condition holds. Keep the report format
and the word cap: they keep the caller's context small. Placeholders inside the report
format (`<n>`, `<file>` and so on) are the agent's to fill in.

```
Review, without editing, <target> in <repo>, with hindsight. Don't edit files and
don't commit; report findings only. The ones that are accepted are applied later.

The question is: knowing what we know now that it's built, what would we do
differently? Building a feature always teaches something the proposal didn't know.
Your job is to find where the code still carries the shape of what we thought
before we learned it, and say what to restructure so the next person to touch this
code has an easier time.

Read first:
- <plan-docs>: what was planned. Check every finding against the decisions recorded
  there. Reversing one takes evidence from the build; without it, leave the finding out.
- `<log>`: how it was actually built.
- What the build taught us (from the agent that implemented it; take it seriously,
  it's the main input):
<learnings, or: "No notes from the build. Infer them: compare the plan with what
was built, and look for reworked areas in the commits and the diff.">
<if earlier passes ran: Already done on this branch: <their tallies>. Don't re-raise
those.>

Scope: the diff (`<diff>`), specs included, plus the code around it: the functions
and modules the diff touches, their direct callers, and sibling modules doing the
same job. For names the change removed or renamed, the whole repo.

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
    Design: ok | reverses "<recorded decision, and where>": <what the build showed
      against it>
    Learned from: <the learning or commit that prompted it, or "fresh read">
    In diff: yes | no (surrounding code) | no (broken by the change)
    Size: S | M | L
Approach note: <one line, or "none">
If there's nothing worth changing, say so in one line (plus the approach note).
<report-lines>
```
