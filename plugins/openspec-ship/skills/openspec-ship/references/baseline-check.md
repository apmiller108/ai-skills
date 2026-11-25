# Baseline check

Was a failure there before this change? Reproduce it on the base before anyone fixes it.
Run everything in the gate form, and judge **each spec** from the log, or run one command
per spec: the exit code speaks for a spec only when it was the only one that ran. A spec
that didn't run (no match, a crash before it) has no result. Every command, the install
included, runs under `safety` with data of its own: the isolation `full` uses, but
not the folder the branch's run left behind. Never run the base and the branch at the same
time; they may share a port, profile or cache.

## Set up the base

1. Base commit: `git merge-base origin/<base> HEAD`. It's the code this branch started
   from, so the branch's diff is the only difference. The tip of `origin/<base>` can have
   gained or fixed failures of its own.
2. `git worktree add --detach <out>/base-<sha> <sha>`, never a checkout in the user's
   working tree. Note it in the state file's `leftovers:` until it's removed. If `git worktree
   list` already shows that path, an earlier check left it: remove it first. A
   `…/ship/base-…` from another session: remove it if `leftovers:` names it, otherwise leave
   it and tell the user.
3. Install dependencies there the way CI does (lockfile install, plus any build CI runs
   first). Don't symlink or copy the branch's `node_modules` or virtualenv: builds and
   caches write through a link into the user's tree, and the lockfile or generated code may
   differ. Check the run loads the worktree's code (an editable install or an absolute
   path can point back at the branch).
4. Don't copy ignored files such as `.env` across; they can point at real data. If the
   base can't run without one, or can't be set up at all, ask the user: no result is not
   "pre-existing".

## Run the failing specs

Run only the failing specs: `<full_specs>` for `full`, `<test_paths>` for unit. A spec the
base doesn't have belongs to the change; send it to the fix agent without a run.

**Reproduced** means the same spec fails with the same error, not just the same name. Run
on the base up to 3 times, stopping at the second reproduction:

| Base | Then |
|---|---|
| fails 2 of 3 | **Pre-existing.** |
| fails 0 of 3 | Run the same command on the branch, up to 3 times. Any failure: **the change's**. None: it depends on order or load, so run the whole suite again on the branch and look at this spec only. It passes: **flaky**. It fails: run the whole suite on the base; this spec failing there with the same error is **pre-existing**, otherwise it's **the change's**. |
| fails 1 of 3 | Run 3 more on the base and 6 on the branch. Base fails 2 or more of 6, and the branch no more often than the base: **pre-existing**, intermittent. Anything else: show the user both counts and ask. |

When several specs fail, each gets its own verdict, and one run can serve them all.

With no command for single specs, run the whole suite, at most twice per side, and count for
each spec: base fails 2 of 2, pre-existing; 0 of 2, one run on the branch decides between
the change's and flaky; 1 of 2, show the user the counts and ask.

## Act on it

- **The change's**: send it to the fix agent, with the counts if it's intermittent.
- **Pre-existing**: don't fix it here. Tell the user in one line, record it in the state
  file's `pre-existing:`, name it in the PR body, and rely on CI for that spec.
- **Flaky**: tell, record and name it the same way, marked flaky. It excuses nothing: the
  base never showed it, so if it fails again, check again.

A gate is **green** when it exits 0, or when every failure in it is recorded as
pre-existing with the same error. In the second case compare the failures one by one: the
exit code can't tell you about a new one. A failure that isn't recorded, or fails with a
new error, gets its own check. If the branch merges the base in, the merge-base moves:
clear the list and check again.

Agents get the list through the `<if pre-existing: …>` line in their prompts, filled from
the state file each time one is spawned; send it to an agent you continue.

Finish by removing the worktree you added (`git worktree remove <path>`) and its
`leftovers:` line. It refuses over untracked files; once you've seen they all came from
these runs, `--force` is fine.
