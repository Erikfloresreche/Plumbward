# Napkin Runbook

## Curation Rules
- Re-prioritize on every read.
- Keep recurring, high-value notes only.
- Max 10 items per category.
- Each item includes date + "Do instead".
- What can be mechanised goes to a control (test or CI), not here. Only what cannot be mechanised goes here.
- The repository is public: nothing personal in this file.
- Curate when adding an entry, not on every read: every rewrite is a diff and tokens (CLAUDE.md §6).

## Execution and validation (highest priority)
1. **[2026-09-11] A verification that would also pass with the old code proves nothing**
   Do instead: write the test that fails against the previous code first and show it red.
2. **[2026-09-11] turbo prints "N successful, M total" even when a task fails**
   Do instead: judge build, typecheck and tests by exit code, never with `grep successful`.
3. **[2026-09-11] A test that does not fail when the piece it claims to cover is broken does not cover it**
   Do instead: mutate the piece, run, restore. Discard equivalent mutants (`??` also skips `null`).
   If it survives, check whether the test uses data that makes the mutation invisible (a name already lowercase).
4. **[2026-09-11] Scripted edits fail silently if the anchor text does not exist**
   Do instead: `assert` on the anchor before replacing and `grep` the result afterwards.
   If the anchor is in a template literal with written `\n`, copy it from the file, do not retype it.
5. **[2026-09-11] After `apply`, the journal ignored on one branch shows up as untracked on another**
   Do instead: compare the state before and after, not against an empty tree.

## Shell and commands
1. **[2026-09-11] macOS `sed` is BSD: `\b` does not work and gives no error**
   Do instead: use `perl -pi -e` for word-boundary replacements.
2. **[2026-09-11] zsh expands `--include=*.ts` without quotes and the `grep` fails**
   Do instead: always quote patterns: `--include='*.ts'`.
3. **[2026-09-11] `rev-parse --abbrev-ref HEAD` and `symbolic-ref --short` return `heads/X` if a tag `X` exists**
   Do instead: `git symbolic-ref -q HEAD` without abbreviating, and strip `refs/heads/`.
4. **[2026-09-11] `git checkout -b X origin/develop` tracks `develop` and VS Code pushes to `develop`**
   Do instead: create branches from an updated local `develop`: `git checkout develop && git pull && git checkout -b X`.
5. **[2026-09-11] Local `origin/HEAD` is not updated when the default branch is renamed on GitHub**
   Do instead: do not use it as the only source; `git remote set-head origin --auto` fixes it (a person runs it).

## Domain guardrails
1. **[2026-09-11] Every heuristic to infer the release branch breaks some repository**
   Do instead: ADR 0005: inference must fail towards more protection; `branches.release` is never inferred.
2. **[2026-09-11] An `if: matrix.node == 'X'` drifts when the matrix changes and the step disappears without failing**
   Do instead: steps that must always run go in their own job without conditions. `check:coherencia` watches it.
3. **[2026-09-11] A global brand replace rewrites facts: third-party names, dated records**
   Do instead: exclude historical facts from the replace and review them by hand.
4. **[2026-09-11] Tests that create git repositories depend on the global configuration (gpgsign, hooks)**
   Do instead: `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1` in `vitest.config.ts`.
5. **[2026-09-11] A CLI whose output depends on local refs breaks the determinism invariant**
   Do instead: everything generated comes from `config.yml`; local state can only propose.
   With a partial `config.yml` it is not filled in from local state either.

## Team directives
1. **[2026-09-11] The assistant does not run git commands that change state, nor database writes**
   Do instead: deliver the commands and the commit message ready to copy (CLAUDE.md §1).
2. **[2026-09-13] The whole repository is written in English**
   Do instead: code, comments, docs, commits and PRs in English; only client-generated files follow their profile language (CLAUDE.md §1).
3. **[2026-09-11] Every PR is reviewed in a fresh context before the merge**
   Do instead: launch the review before saying it can be merged. For fixes, only their diff and with a light model.
4. **[2026-09-11] A long session costs for what it drags along, not for what it writes**
   Do instead: one task per session; on an open PR only blockers, follow-ups to the plan (CLAUDE.md §6).
