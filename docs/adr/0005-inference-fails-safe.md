# ADR 0005 — When an inference fails, it fails towards more protection

- **Status:** accepted
- **Date:** 2026-09-11
- **Affects:** the decision to isolate the work on its own branch, the profile
  (`branches`), the generated CI, and any future feature that infers something
  from the repository in order to act

## Context

Task F0-14 was meant to stop `apply` from writing directly on a long-lived
branch. It failed three times in a row, and all three for the same reason:
**it tried to infer which one is the release branch**.

| Version | How it inferred it | What it broke |
|---|---|---|
| Original | Hardcoded list of four names, case-sensitive | A `Prod` branch received the changes directly |
| 1 | The GitHub default branch (`origin/HEAD`) | In git-flow that branch is `develop`: the generated CI deployed to production from `develop` |
| 2 | The first name of a priority list among the existing branches | With `main` (where PRs go) and `Prod` (deployment), the CI only checked `Prod` and PRs to `main` went unchecked. And any name outside the list —`pro`, `pre`, `live`, `release/prod`— was still unprotected |

Each heuristic fixed some repositories and broke others. It is not a defect of
one particular heuristic: **"which one is the release branch" cannot be
reliably inferred from names or from the default branch**. And the profile had
a single field, `branches.main`, that mixed two different roles: which branch
Pull Requests go to and which one is deployed from.

## Decision

> **When an inference by Plumbward fails, it must fail towards more protection,
> never towards an action.**

A first wording said "what is inferred can only widen protections". It was not
literally true, and the review pointed it out: deciding that a branch is a work
branch from its prefix **is also an inference, and it is the one that removes
protection**. What makes it acceptable is not that it does not infer, but which
way it fails: a name that is not recognised gets isolated. That is the property
that matters, and it is the one required.

Applied to branches:

1. **Protection is inverted.** Instead of "I protect the branches I know", the
   work is isolated **always**, except on a work branch recognisable by its
   prefix (`feat/`, `fix/`, `chore/`…). Work prefixes are a closed and stable
   convention; the names of long-lived branches cannot be enumerated. An unknown
   name falls on the safe side. This includes the prefixes of AI assistants
   (`claude/`, `copilot/`, `codex/`, `cursor/`): they are direct users of the
   product.

2. **The profile separates the two roles.**
   - `integration`: which branch Pull Requests go to. When there is no
     `config.yml`, it is proposed from `origin/HEAD`, because on GitHub that is
     what the default branch means; with no remote, the current branch if it is
     not a work branch, or `main`/`master` if they exist. The proposal is
     written in the generated `config.yml`, which asks for it to be reviewed
     because `origin/HEAD` may be out of date. With a `config.yml`, branches come
     only from it, even if it does not define them: filling them in from the
     local state would make the same file give different plans in two copies of
     the repository. If it fails, the damage is minor: all Pull Requests are
     checked anyway, whatever their target.
   - `release`: which branch is deployed from. It is **never** inferred. It
     stays `null` until the team configures it, and without it the deployment
     workflow is not generated; `doctor` warns about it.

3. **The generated CI checks every Pull Request**, without filtering by target
   branch. The branches it runs on when pushing come **only from the profile**.
   An intermediate version added the existing remote branches, and two copies
   of the same repository with the same `config.yml` generated different
   workflows: it broke the invariant that the CLI is a deterministic function of
   its configuration. Widening protections does not justify breaking an
   invariant.

4. **If the isolated branch already exists, `apply` stops without writing.** It
   could be out of date, and the plan that was shown was computed on the
   starting branch: writing on it would be applying something different from
   what was approved.

## Discarded alternatives

**A better heuristic.** Three attempts show that there will always be a branch
layout that breaks it. Refining it further is moving the failure from one
repository to another.

**Always asking.** Right for what triggers actions —the wizard will ask for the
deployment branch (F4-1)—, but excessive for what only protects: forcing people
to answer questions to get a protection that can be given by default makes the
experience worse without gaining security.

## Consequences

**In favour:**

- A branch with a name nobody foresaw stays protected, not exposed.
- With the workflows this version generates, no Pull Request goes unchecked
  because the profile is wrong. An earlier `ci-dev.yml` that filters
  `pull_request` by branch stays in the repository; `doctor` detects it and
  warns, and removing the filter is F4-2.
- Plumbward does not generate a deployment from a branch nobody chose. A
  `ci-prod.yml` generated by an earlier version may still exist —`apply` does
  not overwrite existing files, and updating them is F4-2—, but `doctor`
  detects it and warns.
- It is a concrete and verifiable sales argument: **Plumbward never guesses
  where to deploy**. It is the same idea as the `plan` before the `apply`,
  applied to the decisions that cannot be undone.

**The cost we accept:**

- **More isolated branches than strictly necessary.** A work branch without a
  conventional prefix (`quick-fix`, `user-patch-1`) gets an isolated branch. It
  is cheap, and there is `--no-branch` for whoever knows what they are doing.
- **The generated CI runs on every Pull Request**, not only on the ones aimed at
  the integration branch. It costs CI minutes. The branches it runs on when
  pushing do not increase: they come only from the profile.
- **A team that wants to deploy has to configure one more line.** It is
  deliberate.
- **The format of `config.yml` changes:** `main` and `dev` are replaced by
  `integration`, `release` and `staging`. An old file still works: `dev` becomes
  `integration` and, if there is no `dev`, so does `main`, which is where Pull
  Requests went. But `main` is **not** translated to `release`, because it was a
  guessed value and turning it into a deployment branch would be exactly the
  mistake this decision avoids.

## How to apply it from now on

For any feature that infers something from the repository, ask: *if the
inference is wrong, is the result one protection too many or a wrong action?*
If it is the latter, the inference can only be **proposed**, never applied
without explicit confirmation.
