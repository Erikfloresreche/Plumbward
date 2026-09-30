# Beta metrics

How each metric of the private beta is measured (F7-4), written before anyone
measures it. Every run of the corpus (F7-5), every outside tester (F7-6) and
the feedback template (F7-3) use these definitions; the results go to
[results.md](results.md) and the exit review (F7-7) compares them with the
exit criterion of M3 in the
[execution plan](../EXECUTION_PLAN.md#milestone-3--private-beta).

**No telemetry.** Every metric is taken by hand, from the terminal, `git` and
`gh`. Plumbward sends nothing and the beta adds nothing that sends anything.

**Nothing personal.** The repository is public. A run is identified by the
corpus number (`#1` to `#16` in [corpus.md](corpus.md)), the Plumbward version
and a role: `developer`, `tester A` or `tester B`. No names, usernames, e-mail
addresses or fork URLs are recorded; fork URLs carry the username.

---

## 1. Common ground

These rules hold for every metric below.

- **Fork.** A fork of the corpus repository on GitHub, with Actions enabled,
  and its default branch reset to the pinned commit of the corpus. It is
  cloned into a scratch directory, never inside this repository.
- **Clean start.** Before `scan`, `git status --porcelain --untracked-files=all`
  prints nothing and `git rev-parse HEAD` prints the pinned commit.
- **Commands.** The cycle runs with the defaults: `plumbward apply` without
  `--no-install` and without `--no-branch`. Answer the confirmation by hand;
  `--yes` is not used, so the time a person needs to read the plan is inside
  the cycle.
- **Timestamps.** Taken with `date -u +%Y-%m-%dT%H:%M:%SZ` and recorded in
  UTC, to the second.
- **Baseline CI.** Before the run, the fork's own workflows run once on the
  pinned commit (a push of the default branch triggers them). Record the
  conclusion of each workflow. A workflow that fails there fails for reasons
  that are not Plumbward's: missing secrets in a fork, flaky tests, a broken
  upstream.
- **Plumbward's workflows.** The workflow files that `apply` creates or edits,
  read from the `Files` section of `plumbward plan`.
- **One run per repository and role.** A repeated run is recorded as a new
  run, with the reason; it does not replace the first.

## 2. Cycle time

**What it answers:** how long a person takes from the first command to a green
CI. It is the "under 5 minutes" promise of risk R4.

**Start (`t0`):** the timestamp taken immediately before pressing Enter on
`plumbward scan`, on a clean start.

**End (`t3`):** the `updatedAt` of the last run of Plumbward's workflows to
finish on the commit pushed after `apply`, when all of them are green (§6):

```bash
gh run list --commit "$(git rev-parse HEAD)" --json name,conclusion,updatedAt
```

**Also recorded,** so a slow cycle says where the time went:

- `t1`: `apply` prints its summary line.
- `t2`: `git push` returns.

**Between `t1` and `t2`** the person reviews the diff, commits every change
left by `apply` as one commit, and pushes the branch `apply` created. Nothing
else is edited.

**Value:** `t3 − t0`, in seconds. The median is reported in minutes with one
decimal.

**If CI is not green on the first push,** the clock keeps running until the
first commit on which Plumbward's workflows are all green, and the number of
extra commits is recorded. If it is never green in the same sitting, the value
is `not reached`: it counts as a failed cycle, and it is left out of the
median, which is said next to the median.

**Scope of the M3 threshold:** the median is taken over the repositories under
50,000 SLOC, by the SLOC column of [corpus.md](corpus.md) (#1 to #11).
Repositories #12 to #16 are recorded and reported apart.

## 3. Conflicts, by type

**What it answers:** where what Plumbward generates collides with what the
repository already has.

**Unit:** one conflict per path, or per tool when there is no single path, per
repository. The same path is counted once, under the first type that matches
in the order below.

| Type | How it is detected |
|---|---|
| `block` | A `BLOCKS` line in the `Conflicts` section of `plumbward plan`. |
| `warning` | A `WARNING` line in the same section. |
| `refused` | `apply` stops with `the file "<path>" already exists and cannot be overwritten`. |
| `second-linter` | After `apply`, the repository configures two different linters: the one `apply` created or edited, and one already in the repository. |
| `second-hook-manager` | After `apply`, the repository declares two different git hook managers: the one `apply` created or edited, and one already in the repository. |

**The last two types count what the scanner does not see.** Corpus
[§4](corpus.md#4-where-the-scanner-reads-them-differently-today) lists linters
(`xo`, TSLint, oxlint) and hook managers (husky v4 in `package.json` or
`.huskyrc.json`, simple-git-hooks) that the scanner does not recognise.
Plumbward reports nothing about them, so they never appear as `block` or
`warning`. They are detected by hand:

1. Take the linter and hook columns of corpus §3 for the repository: that is
   what it already had.
2. Take the linter and hook configuration files among the paths of
   `git status --porcelain` after `apply`: that is what Plumbward added.
3. If both sides name a tool and the tools differ, it is a conflict. The same
   tool on both sides, such as an ESLint configuration that `apply` edits, is
   not.

**Not a conflict:**

- A workflow added next to the repository's existing CI, including Travis in
  #7. Adding CI is additive by design.
- A file `apply` skips because it already exists. The summary line of `apply`
  counts it among the skipped ones.
- A CI failure. It is measured in §6, with its cause.

**Value:** the count of each type, per repository, and the total per type over
the corpus.

## 4. `rollback` success

**What it answers:** whether `rollback` leaves the repository exactly as it
was. It is a separate run from the cycle of §2, because `rollback` only works
before the commit: after it, the journal points at another commit and
`rollback` refuses by design.

**Before `apply`,** on a clean start, record:

```bash
git rev-parse HEAD
shasum -a 256 <lockfile>    # every lockfile at the root; "none" if there is none
```

**Run** `plumbward apply`, answer yes, then `plumbward rollback`, with no
commit and no edit in between.

**After `rollback`,** the run is a success only if all of these hold:

1. `git status --porcelain --untracked-files=all` prints nothing.
2. `git diff <commit recorded before>` prints nothing.
3. `git rev-parse HEAD` prints the commit recorded before.
4. `shasum -a 256` gives the same hash for every lockfile, and no lockfile
   appears that was not there.

Any other outcome is a failure, and the output of the failing command is
recorded. A `rollback` that refuses to act is a failure too.

**Not measured:** ignored files such as `node_modules`. The dependency
installation is outside the journal until F0-11, so `rollback` does not
promise to undo it yet. The branch `apply` created stays after `rollback`,
and the current branch is recorded apart: neither changes the files.

**Value:** `success` or `failure` per run. The M3 threshold is the share of
successes over every run.

## 5. Corruption

M3 requires zero corruptions, so the beta measures them with the same care.

**Definition:** `apply` changes a path it did not announce. After `apply`,
every path of `git status --porcelain --untracked-files=all` must be one of:

- a path of the `Files` section of `plumbward plan`;
- a lockfile, when `plan` lists an install in `Dependencies and commands`;
- `.governance/journal.json`.

Any other path is a corruption. A `rollback` failure of §4 whose extra path is
also outside that list counts once, as a corruption.

**Value:** the count per run, with the paths.

## 6. Green CI on the first push

**What it answers:** whether the first commit after `apply`, with nothing
changed by hand, passes CI.

**The commit:** the one of §2, pushed at `t2`.

**Green:** every run of Plumbward's workflows on that commit concludes
`success`, `skipped` or `neutral`. Any `failure`, `cancelled`, `timed_out` or
`action_required` is red.

**The repository's own workflows** count when the baseline of §1 was green: a
workflow green on the pinned commit and red after `apply` means Plumbward
broke it, so the push is red. A workflow already red on the baseline is left
out, and that is recorded.

**If red,** the cause is recorded in one line: the failing job and step, and
whether the failure is in what Plumbward generated or in what the repository
already had.

**Value:** `yes` or `no` per repository. The M3 threshold is the share of
`yes` over the repositories where the push happened. #7 has no GitHub Actions
of its own, so only Plumbward's workflows count there.

## 7. Generated files kept after 14 days

**What it answers:** whether a team keeps what Plumbward installed once
nobody is watching.

**Applies only** where a team commits to the repository during those 14 days:
the repositories of outside testers and pilots. On a corpus fork nobody works,
so every file would be "kept" and the figure would mean nothing: there it is
`not applicable`.

**Day 0** is the date the commit of §2 lands on the default branch. **Day 14**
is 14 calendar days later. The state on day 14 is the last commit of the
default branch before the end of that day, in UTC:

```bash
day14=$(git rev-list -1 --before="<day 14>T23:59:59Z" <default branch>)
git diff --name-status <commit of §2> "$day14" -- <each path apply created or edited>
```

**Each path is:**

- `kept`: no change.
- `modified`: changed, still there.
- `deleted`: removed. A workflow disabled in GitHub also counts as `deleted`:
  `gh workflow list --all` shows it as `disabled_manually`.

**Value:** the count of each state per repository, and the list of deleted
paths. A deleted file says more than the count: the reason is asked of the
tester or pilot and recorded when they give it.
