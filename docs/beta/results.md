# Beta results

The measurements of the private beta. Every value follows its definition in
[metrics.md](metrics.md); a value that does not is not recorded. Repositories
are named by their number in [corpus.md](corpus.md), runs by role
(`developer`, `tester A`, `tester B`): nothing personal, the repository is
public.

**Status:** empty. The internal pass over the corpus (F7-5) fills the first
rows; the outside testers (F7-6) add theirs; the exit review (F7-7) reads the
summary.

---

## 1. Summary against M3

Filled in when the runs are recorded. The thresholds are the proposal of the
[execution plan](../EXECUTION_PLAN.md#milestone-3--private-beta); F7-7
confirms them or records why they change.

| Criterion | Threshold | Result | Met |
|---|---|---|---|
| Repositories of the corpus with the full cycle recorded | 15 or more | | |
| Outside testers who complete the cycle without help | 2 of 2 | | |
| Corruptions ([§5](metrics.md#5-corruption)) | 0 | | |
| `rollback` successes ([§4](metrics.md#4-rollback-success)) | 100 % | | |
| Median cycle time, #1 to #11 ([§2](metrics.md#2-cycle-time)) | under 5 min | | |
| Green CI on the first push ([§6](metrics.md#6-green-ci-on-the-first-push)) | 80 % or more | | |
| Serious defects closed or in the queue | all | | |

Median cycle time over #12 to #16, reported apart: —

Cycles `not reached`, left out of the median: —

## 2. Runs

One row per run. Times in seconds; `n/a` where the definition says so.

| # | Role | Version | Date (UTC) | Cycle (s) | Extra commits | CI 1st push | Rollback | Corruptions | block | warning | refused | second-linter | second-hook-manager |
|---|---|---|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|

## 3. Generated files after 14 days

Only for repositories where a team works ([metrics §7](metrics.md#7-generated-files-kept-after-14-days));
corpus forks are `not applicable`.

| Repository | Role | Day 0 | Kept | Modified | Deleted | Deleted paths and reason given |
|---|---|---|---:|---:|---:|---|

## 4. Run details

One block per run, copied from the template below. It holds the raw values,
so anyone can recompute a row of §2 from it.

### Template

```markdown
### #<n> — <role> — <date>

- Plumbward version: <`plumbward --version`>
- Pinned commit confirmed: <yes / no>
- Baseline CI of the fork: <workflow: conclusion, one per line; "none" for #7>

**Cycle (§2)**
- t0 (before `scan`): <UTC>
- t1 (`apply` summary): <UTC>
- t2 (`git push` returned): <UTC>
- t3 (last Plumbward workflow green): <UTC, or "not reached">
- Extra commits until green: <n>

**Conflicts (§3)**
- block: <paths>
- warning: <paths>
- refused: <paths>
- second-linter: <tool already there> + <tool Plumbward added>
- second-hook-manager: <manager already there> + <manager Plumbward added>

**Rollback (§4)** — separate run, before any commit
- Commit before: <sha>
- Lockfile hashes before: <file: sha256, or "none">
- Checks 1 to 4: <pass / fail each>
- Output of the failing check: <verbatim, or "none">
- Branch after `rollback`: <name>

**Corruption (§5)**
- Paths outside the plan: <paths, or "none">

**CI on the first push (§6)**
- Result: <yes / no>
- Workflows left out because red on the baseline: <names, or "none">
- Cause if red: <job, step, and whether it is Plumbward's or the repository's>

**Defects found**
- <one line each, with the task it opened or "accepted: <reason>">
```
