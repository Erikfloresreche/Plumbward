# Contributing to Plumbward

## Before anything else

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The project has three
invariants that are not style, they are the reason the product exists, and a
contribution that breaks them is rejected even if it works:

1. **No module writes to disk on its own.** Operations are declared; only
   `applyPlan` materialises, and it leaves a journal.
2. **`.governance/config.yml` is the source of truth.** The CLI is a
   deterministic function of it.
3. **Supporting a new stack does not touch the core.** It is publishing a pack.

## Getting started

Requires Node.js >= 22.13 and pnpm. The floor is not a preference: pnpm 11
uses `node:sqlite` and does not start below that version.

```bash
git clone https://github.com/Erikfloresreche/Plumbward.git
cd Plumbward
pnpm install
pnpm build
pnpm test
```

## Workflow

Development is driven by [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).
Every task has an identifier, a branch, dependencies and acceptance criteria.

### Branches

| Branch | Role |
|---|---|
| `Prod` | Releases only. Every commit is a tagged version |
| `develop` | Integration. It must always be green |

Task branches are created from `develop` and named
**`<type>/f<phase>-<slug>`**, with the slug **in English** — for example
`fix/f0-protected-branches`, never `fix/f0-ramas-protegidas`. Allowed types:
`feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.

A branch implements **exactly one task**. If unplanned work appears, a new task
is added to the plan; the one in progress is not widened.

### Commits

Conventional Commits **in English**, referencing the task. The documentation
and new code are in English too, and the remaining Spanish comments and tests
are being translated (F0-43, F0-44): it is the dominant convention, and it
survives a change of team.

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

### AI assistants

If you work with an assistant in this repository, its operating limits are in
[CLAUDE.md](CLAUDE.md) and they are mandatory. In short: **an assistant does not
run git commands that change state, nor database writes**. It leaves the changes
in the working tree and a person commits them.

Whoever signs the commit answers for what enters the history.

When a task is closed, the assistant delivers three texts in English, ready to
copy —the **commit message**, the **Pull Request title** and its
**description**— and asks who is going to review the PR.

The PR title follows the same Conventional Commits format as the commit, on a
single line and under 70 characters. It is the only thing visible in the Pull
Request list, so it has to say what changes without opening it.

### Review when nobody is available

If the PR would be blocked because no other person can review it, an assistant
may do the review, but **always in a fresh context, without the history of the
conversation that produced the code**.

Reviewing your own work with the context that generated it reproduces the same
blind spots: the same assumptions are taken for granted. A clean context only
sees the diff and judges it by what it says.

That review **delivers findings; it does not approve or merge**. A person does
the merge. And it is an escape valve so work is not blocked, not a substitute
for human review: if someone is available, that person reviews.

### A finding ends in a control

Whatever comes out of a review becomes a test or a CI check, or is recorded as
not mechanisable, saying why. A rule added to a document does not count: rule
documents decay as they grow, and the purpose of this project is precisely to
replace rules that get ignored with controls that cannot be skipped.

## Definition of Done

**The canonical, complete list is in §4 of
[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).** If this copy and that one
differ, the plan wins. In short, a task is not finished until it meets all of
this, on top of its own criteria:

- `pnpm build`, `pnpm typecheck` and `pnpm test` green.
- Zero implicit `any`. Zero `@ts-expect-error` without a comment justifying it.
- Every public return value with its declared interface.
- Every file generated for the client with explanatory comments in its language.
- Every new error path is reversible: it either takes part in the journal or
  does not write.
- Tests for the new behaviour. A bug is fixed starting with the test that
  reproduces it.
- The task checkbox ticked in the plan, in the same PR.
- No assistant has run git commands that change state, nor database writes.
- The commit message and the PR description have been delivered in English, and
  the developer has been asked who will review.
- Every review finding has ended in a mechanical control, or is recorded as not
  mechanisable and why.

## Writing a pack

A pack implements the `StackPack` interface of
[packs-sdk](packages/packs-sdk/src/contract.ts) with three methods:

- **`detect(context)`** — does this pack apply to this repository, and with what confidence?
- **`contribute(context)`** — which operations it wants to contribute. **It never writes to disk.**
- **`validate(context)`** — health checks for `doctor`.

Use the DSL in [dsl.ts](packages/packs-sdk/src/dsl.ts) (`file`, `json`, `yaml`,
`block`, `dep`, `cmd`) instead of building objects by hand.

Every pack must pass `checkPackConformance`. The rule that surprises most is
**determinism**: `contribute()` is called twice and the results are compared. If
they differ, `plan` would be lying about what `apply` is going to do, and the
whole trust model of the product falls apart.

The full guide will come with task F2-8. Meanwhile,
[packs/node-ts](packages/packs/node-ts/) is the reference.

## Pre-commit hooks

The repository will have hooks from task F0-4 onwards. Once they exist, they can
be skipped with `--no-verify` in a real emergency —an urgent production fix at
three in the morning—, but **the next PR must fix whatever the hook would have
caught**. Skipping them out of habit turns the tool into decoration.
