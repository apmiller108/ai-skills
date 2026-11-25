# Triage: hindsight findings

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
  that's L-sized compared with the change, or one whose Risk users would feel and
  whoever applies it can't check. Record it with its Risk, as `shared/follow-ups.md` at the
  plugin root says; the user decides whether it becomes an issue. The agent's approach note
  goes here too, untriaged, unless it's "none".
- **Drop**: formatting, import order, renaming that's down to taste, comment wording,
  splitting a function that reads fine, micro-optimisations off the hot path,
  speculative generality ("in case we add another backend"), anything that only
  restyles, and anything justified by a pattern name rather than a concrete cost. Also
  anything whose Risk outweighs its Cost today (a slower start for every user to save the
  next developer an edit), and a design reversal without evidence from the build.

Triage each part of a split finding (4a, 4b) on its own, and count it as a finding in the
tally: typically 4a is accepted and 4b becomes a follow-up. If a finding has no `Risk:` or
`Design:` line, ask the same agent for it before you triage it.

The agent's tags are input, not a verdict: a HIGH that's really taste is still
dropped, and a CODE finding that moves module boundaries is structural. A finding against
a test is never structural.

## What the user decides

A finding you'd apply or make a follow-up is the user's call when it is STRUCTURAL or
reverses a recorded decision (CODE ones included). Show these in one block: each finding's
what, cost, risk (with its check) and size, and for a reversal the decision and what the
build showed, with your proposed disposition: apply now if it's S or M and either in the
diff or broken by the change, otherwise follow-up. Ask once which to apply, or "all as
proposed".
