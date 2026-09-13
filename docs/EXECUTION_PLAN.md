# Execution plan — Enterprise DevSecOps & AI Governance CLI

> Living document. It is the source of truth for the development of the
> product: what is built, in what order, on which branch and with which
> criterion it is considered finished. Each task is closed by updating its
> checkbox in this file, inside the same Pull Request that implements it.

**Last updated:** 2026-09-13
**Global status:** Phase 0 in progress — F0-1, F0-3, F0-5, F0-8, F0-13, F0-14, F0-15, F0-16, F0-17, F0-24, F0-27, F0-29, F0-30, F0-40 and F0-41 completed. Remaining: F0-2, F0-4, F0-6, F0-7, F0-9 to F0-12, F0-18 to F0-23, F0-25, F0-26, F0-28, F0-31 to F0-39 and F0-42 to F0-47.
**Product:** Plumbward · https://github.com/Erikfloresreche/Plumbward
**Business model:** annual subscription per repository — see
[BUSINESS_MODEL.md](BUSINESS_MODEL.md)

---

## 1. How to use this document

1. Work on **one task at a time**, on **its own branch**, with the task
   identifier (`F2-4`) in the branch name and in the body of the PR.
2. No task starts until its **dependencies** are integrated into `develop`.
3. A task is only marked `[x]` when it meets **all** its acceptance criteria
   and the **universal Definition of Done** (§4).
4. If unplanned work appears during a task: **the task is not widened**. A new
   task is added at the end of its phase, placed in the **execution queue**
   (§5), and work goes on.
5. **The next task is the first one in the execution queue** (§5). The order
   is not decided in each session: it is changed by moving the entry in the
   queue, with its reason, when the developer decides on another priority.

---

## 2. Verified current state (baseline)

Checked on 2026-09-08 by running `pnpm build` and `pnpm test`: **6 successful
builds, 24 tests green**.

### 2.1 What already exists and works

| Package | Responsibility | Coverage |
|---|---|---|
| `@plumbward/core` | Transactional engine: `Operation[]` → `ChangePlan` → `apply` with journal, simulation and rollback | Complete |
| `@plumbward/ast` | Non-destructive editing of JSON and YAML + blocks delimited by markers | Complete, with tests |
| `@plumbward/scanner` | Git state, fingerprint, SLOC, stack detection, 0-100 maturity report | Complete for Node and Go |
| `@plumbward/packs-sdk` | `StackPack` contract, operations DSL, registry and conformance suite | Complete |
| `@plumbward/pack-node-ts` | The only real pack: CI, ESLint, Prettier, Husky, Gitleaks, devcontainer, AI rules | Complete |
| `@plumbward/cli` | Commands `scan`, `plan`, `apply`, `rollback`, `doctor` | Works end to end |

### 2.2 The three architecture invariants

They are implemented and **are not reverted without an ADR that justifies it**:

- **Nobody writes to disk on their own.** Every module declares its intent by
  emitting `Operation[]`. Only `applyPlan` materialises, and it leaves a journal.
- **`.governance/config.yml` is the source of truth.** The CLI is a
  deterministic function of that file: same config + same repo = same plan, always.
- **The pack catalogue is the scaling axis.** Supporting a new stack is
  publishing a package that implements `StackPack` and passes conformance. The
  core is never touched.

### 2.3 Deliberate deviations from the original PDF

| PDF | This project | Reason |
|---|---|---|
| Rules downloaded at runtime from an API | Everything local in the NPM package | A corporate security team vetoes running downloaded remote logic. It blocks the enterprise sale. |
| Injecting `@your-company/ci-guard`, which breaks the client's pipelines | Nothing is injected that could make someone else's CI fail | From the client's point of view it is contractual sabotage; it destroys the trust the product sells. |
| Monolithic `init` | `scan` → `plan` → `apply` → `rollback` | It lets us give `scan` away as a commercial hook and makes the tool auditable in the PR. |
| One-off payment of 1,500-2,500 € with 12 months of updates | Annual subscription per repository | With a perpetual licence, in month 13 the tool keeps working and nobody renews. It would force degrading what is installed, which contradicts ADR 0002. See [ADR 0004](adr/0004-annual-subscription.md). |

### 2.4 Known gaps this plan closes

1. The repository **is not under version control** (there is no `.git`). → F0-1
2. There is only a Node pack: any other stack gets a blocking conflict. → Phase 2
3. All texts are hardcoded in Spanish even though `Profile.language` exists. → Phase 1
4. The `ratchet` and `non-disruptive` modes are computed but change nothing. → Phase 3
5. Neither the `init` wizard nor the `upgrade` command exists. → Phase 4
6. There is no licensing. → Phase 5
7. There is no README, LICENSE, own CI or publication. → Phases 0 and 6

---

## 3. Branch, commit and Pull Request strategy

This flow is **deliberate dogfooding**: generating and protecting this very
strategy is a sellable feature of the product (task F3-5). Every friction we
find here is a requirement for that feature.

### 3.1 Permanent branches

| Branch | Role | Protection |
|---|---|---|
| `Prod` | Only published releases. Every commit is a tagged version. | No direct push. Only merges from `develop` through a PR with green CI. |
| `develop` | Continuous integration of the work in progress. It must always be green. | No direct push. Only merges of task branches through a PR. |

### 3.2 Task branches

Format: **`<type>/f<phase>-<slug-in-kebab-case>`**, with the *slug* **in
English**, just like commit messages and PR descriptions: the branch name
stays in the git history and will be read by people who do not speak Spanish.

Example: `fix/f0-protected-branches`, not `fix/f0-ramas-protegidas`.

Branches of tasks **already closed** keep the name they existed with
(`ci/f0-pipeline-propio`, `docs/f0-documentacion-base`). They are a fact of the
history, and rewriting them in this document would be the same mistake that in
F0-8 turned the real name of a competitor into an invented one.

Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`.

```
develop ──┬── feat/f2-pack-python ──── PR ──┐
          ├── feat/f2-pack-go ─────── PR ───┼──> develop ──> PR ──> main (release)
          └── docs/f2-guia-packs ──── PR ───┘
```

The release branch is called **`Prod`**, not `main`. It is the team's
convention, and the product must adapt to the repository's convention and not
the other way round — it is literally what it sells. Nothing in the code or in
the workflows may take a branch name for granted.

Rules:
- A branch **is born from an updated `develop`** and dies when integrated. It is not reused.
- A branch implements **exactly one task** of the plan.
- Merge by **squash**, so that every task is one commit in `develop`.
- The branch is deleted after the merge.

### 3.3 Commits

**They are always run by a person, never by an AI assistant.** An assistant
leaves the changes in the working tree and delivers the written message;
whoever signs the commit answers for what enters the history. The same applies
to `push`, `merge`, `rebase` and `reset`, and to any command that writes to a
database. It is set out in `CLAUDE.md`.

Conventional Commits **in English**, referencing the task. Like the rest of the
repository since F0-41: it is the dominant convention, and the history outlives
a change of team:

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

`commitlint` verifies it in the `commit-msg` hook (task F0-4).

**When each task is closed**, the assistant delivers, already written, the
commit message, the PR **title** and its description —all three in English—,
and asks who will review the PR. If nobody is available and the PR would be
blocked, it can review it itself **in a fresh context** —never with the history
that produced the code, because it would reproduce the same blind spots—,
delivering findings without approving or merging. Details in `CLAUDE.md`.

### 3.4 PR body

Mandatory template (generated in F0-5):

The **title** and the **description** of the Pull Request are written in
English, just like commits. The title goes on one line, with the same
Conventional Commits format and under 70 characters:

```
docs: switch to annual subscription and define the business model
```

The description follows the template:

```markdown
## Task
F2-4 — Python pack

## What changes and why

## Acceptance criteria
- [ ] (copied from docs/EXECUTION_PLAN.md)

## How this was verified
```

---

## 4. Universal Definition of Done

It applies to **all** tasks, on top of their own criteria:

- [ ] `pnpm build`, `pnpm typecheck` and `pnpm test` green locally and in CI.
- [ ] Zero implicit `any`, zero `@ts-expect-error` without a comment that justifies it.
- [ ] Every public return has a declared interface (PDF rule, §6.1).
- [ ] Every file **generated for the client** carries explanatory comments in
      its configured language (PDF rule, §6.3).
- [ ] Every new error path can be reverted: it either takes part in the
      journal or does not write (PDF rule, §6.2).
- [ ] New tests for the new behaviour. Bugs are fixed with a test that fails
      before the fix.
- [ ] The task checkbox in this document is ticked in the same PR.
- [ ] No assistant has run git commands that change state, nor database
      writes: a person runs them (see `CLAUDE.md`).
- [ ] The commit message, the PR title and its description have been delivered
      in English, and the question of who reviews has been asked.
- [ ] Every review finding has ended in a **mechanical control**, or is
      explicitly recorded as not mechanisable and why. A rule written in prose
      does not count: it decays.

---

## PHASE 0 — Repository foundation

**Objective:** make the project a real project: versioned, verified in CI,
documented and publishable. It blocks everything else.
**Estimate:** 1-2 work sessions.
**Phase exit criterion:** an outside developer clones, runs
`pnpm install && pnpm test` and everything works without asking anything.

---

### [x] F0-1 — Put the project under version control
**Branch:** `chore/f0-git-bootstrap` · **Depends on:** nothing · **Blocks:** everything

**Why first:** today all the work exists only on the disk of one machine.
Any irreversible mistake loses all of it.

**Work:**
1. `git init -b main` at the root.
2. Review `.gitignore`: it already covers `node_modules/`, `dist/`, `.turbo/`,
   `coverage/`, `.env*`. Add `.DS_Store` (already there) and `*.log`.
3. Create `.gitattributes`: `* text=auto eol=lf`, and mark `pnpm-lock.yaml`
   as `linguist-generated`.
4. Initial commit: `chore: importa la base del monorepo de gobernanza`.
5. Create `develop` from `main` and leave it as the active branch.
6. Create the remote repository (private) and push both branches.

**Acceptance criteria:**
- [x] `git log` shows the initial commit with the whole `packages/` tree.
- [x] `git status` clean after a `pnpm install && pnpm build` (nothing generated slips in).
- [x] `main` and `develop` exist on the remote.

**Closed on 2026-09-08.** Initial commit of 63 files and 440 KB. Beyond what was
planned: a VSCode `.code-workspace` saved by mistake inside
`packages/scanner/src/` was moved to the root, and a minimal README was added
(the final one is F0-5). The git identity was configured **local to the
repository**, not global: `Erik Flores Reche <erikfloresreche@gmail.com>`, the
email tied to the personal GitHub account that hosts the repository. GitHub
attributes commits by email address, not by name, so using another address
links them to another account.

---

### [ ] F0-2 — A single source for the version number
**Branch:** `build/f0-single-version-source` · **Depends on:** F0-1

**Why:** `CLI_VERSION` is hardcoded as `'0.1.0'` in
[context.ts](../packages/cli/src/context.ts). As soon as we publish, the journal
and the managed-file headers will lie about which version generated what, and
`upgrade` (F4-2) depends on that data to decide whether to regenerate.

**Work:**
1. Inject the version at build time with `define` in
   [tsup.config.ts](../packages/cli/tsup.config.ts), reading `package.json`.
2. Replace the constant with the injected variable, with a readable fallback in dev.
3. Test that compares the version reported by `plumbward --version` with the one
   in the CLI's `package.json`.

**Acceptance criteria:**
- Changing the version in `package.json` and rebuilding changes the output of
  `plumbward --version` without touching code.
- The test fails if someone hardcodes it again.

---

### [x] F0-3 — Our own continuous integration pipeline
**Branch:** `ci/f0-pipeline-propio` · **Depends on:** F0-1

**Why:** we sell CI. Not having CI is a credibility problem as well as a
technical one.

**Work:**
1. `.github/workflows/ci.yml`: triggered on PRs to `develop` and `main`.
   - Node matrix **18, 20, 22** (the package declares `>=18`; it has to be tested).
   - Steps: `pnpm install --frozen-lockfile` → `build` → `typecheck` → `test`.
   - pnpm and turbo cache.
2. `.github/workflows/e2e.yml`: the E2E tests on temporary repos, kept separate
   because they are slow and touch real git.
3. Run `gitleaks` on our own repo on every PR.

**Acceptance criteria:**
- [ ] A PR with a broken test is blocked in red. **Not met.** CI shows the red,
      but without branch protection or a ruleset the PR is still mergeable. It
      needs configuration in GitHub, which does not live in the repository:
      task **F0-13**.
- [ ] The full pipeline runs under 5 minutes with a warm cache. *Pending
      measurement on the first real run.*
- [x] Node 18 passes, or `engines` is raised deliberately and documented. **It
      was raised to `>=22`, with the reason verified in CI.**

**Closed on 2026-09-10.** Delivered: `ci.yml` (Node matrix, build, typecheck and
unit tests, plus secret scanning), `e2e.yml` and `dependabot.yml` for the
GitHub actions.

**Four decisions taken during execution:**

1. **Matrix 22 / 24 / 26, and `engines` at `>=22`.** The plan asked for
   18 / 20 / 22. Node 18 and 20 have been out of security support since April
   2025 and April 2026, so they were discarded for consistency with what the
   product sells. Node 20 was tried anyway as a pragmatic floor, and **the first
   real CI run knocked it down**: pnpm 11 uses `node:sqlite` and requires
   Node >= 22.13, so on 20 the dependencies cannot even be installed.

   The important lesson is not the number: it is that we were about to declare
   in `engines` a support we **could not verify**. What is tested is what is
   supported. 26 was added to the matrix because it is what local development
   runs on, and a failure exclusive to 26 would be discovered late.

2. **Tests split into `test:unit` and `test:e2e`.** The unit tests take less
   than a second and run on the three Node versions; the end-to-end ones create
   real git repositories and run only once. The split comes for free from the
   structure that already existed: `src/` versus `test/`.

3. **`fail-fast: false` in the matrix.** We want to know whether a failure
   belongs to one specific version or to all of them; cancelling the rest hides
   that information.

4. **Dependabot only for GitHub actions, for now.** They are third-party code
   that runs with access to the repository. The npm dependencies wait until the
   changesets flow exists (F0-6), so as not to generate noise of PRs with no way
   to version them.

**Two things you should know:**

- **The repository was made public on 2026-09-11**, which leaves the Actions
  minutes unlimited and aligns the repository with the BUSL licence and with the
  commercial argument that the code is auditable. A consequence that has to be
  accepted: **the whole previous history is visible to anyone**, and the
  per-PR secret scan only looks at the commits of that PR. Hence the `history`
  job, which reviews the full history weekly.
- If the repository moves to a GitHub **organisation**, `gitleaks-action`
  starts requiring a `GITLEAKS_LICENSE` secret. While it is a personal account
  it is free. It is noted in the workflow itself.

---

### [ ] F0-4 — Dogfooding: apply our own rules to this repo
**Branch:** `chore/f0-dogfooding-hooks` · **Depends on:** F0-3

**Why:** it is the cheapest proof that the product works, and the best place to
detect that a rule annoys more than it helps.

**Work:**
1. Husky + lint-staged + commitlint (`@commitlint/config-conventional`).
2. Flat ESLint 9 + Prettier for the monorepo itself, aligned with what the Node
   pack generates.
3. Our own `.gitleaks.toml`.
4. `CODEOWNERS`.
5. Document in `CONTRIBUTING.md` (F0-5) how to skip a hook in an emergency and
   why it should almost never be done.

**Acceptance criteria:**
- A commit with a non-conventional message is rejected.
- A commit that introduces a secret-like string is rejected.
- `pnpm lint` green across the whole repo.

---

### [x] F0-5 — Base project documentation
**Branch:** `docs/f0-documentacion-base` · **Depends on:** F0-1

**Why:** without a README there is no demo, no onboarding and no sales
conversation.

**Work:**
1. Root `README.md`: the problem in three sentences, the demo in one block
   (`npx @plumbward/cli scan`), what it installs, the three invariants, and the
   link to this plan. Written for a CTO, not for a contributor.
2. `LICENSE` — decide and document the model (see §Risks: it affects Phase 5).
3. `CONTRIBUTING.md` — branch flow from §3, how to run the tests, how to write a pack.
4. `SECURITY.md` — vulnerability reporting channel. Enterprise procurement asks for it.
5. `docs/ARCHITECTURE.md` — the `scan → plan → apply` flow diagram and why
   nobody writes to disk.
6. `docs/adr/0001-plan-before-apply.md` and `0002-local-first-licensing.md` —
   the two decisions we will be questioned on the most; better to have the
   answer written down.
7. `.github/PULL_REQUEST_TEMPLATE.md` with the template from §3.4.

**Acceptance criteria:**
- [x] The README lets someone with no context run the tool in 2 minutes.
- [x] The ADRs explain the decision, the discarded alternative and the cost taken on.

**Closed on 2026-09-09.** Delivered: `README.md` rewritten for a CTO,
`LICENSE` (BUSL-1.1), `CONTRIBUTING.md`, `SECURITY.md`,
[ARCHITECTURE.md](ARCHITECTURE.md) with the reason for each file of the
monorepo, and `.github/PULL_REQUEST_TEMPLATE.md`.

**Three** ADRs were written instead of two: the licence of the code turned out
to be a decision separate from the technical licensing and deserved its own
([0003](adr/0003-busl-license.md)).

**Fresh-context review (2026-09-09).** The PR went through the F3-6 flow and the
review found 12 real findings, three of them false claims about the code itself
that the first draft took for granted. All fixed in the same PR. What it
uncovered in the code became the new tasks **F0-9, F0-10, F0-11 and F2-11**.

The most serious finding: the README said `npx aegiscode`, which was then the
product's name and **a real package by another author** published on npm. It
was corrected, and the name conflict ended up causing the rename to Plumbward
in F0-8.

**Left open:** the text of `LICENSE` **must be checked against
https://mariadb.com/bsl11/** before making the repository public, and reviewed
legally before invoicing.

---

### [ ] F0-6 — Automated versioning and changelog
**Branch:** `build/f0-changesets` · **Depends on:** F0-3

**Why:** there are six packages with `workspace:*` dependencies. Versioning them
by hand ends in inconsistencies, and the client pays an annual subscription to
receive updates: they have to be able to read what changed in each one.

**Work:**
1. Install and configure `@changesets/cli`.
2. CI rule: every PR that touches `packages/**` must bring a changeset (or be
   explicitly marked as `no-release`).
3. Release workflow: on merge to `main`, it versions, generates the CHANGELOG
   and publishes. **Real publishing stays disabled** until F6-1.

**Acceptance criteria:**
- A changeset in one package propagates the version bump to its dependents.
- The generated CHANGELOG is readable by a client, not only by us.

---

### [ ] F0-7 — Test coverage threshold
**Branch:** `test/f0-coverage-threshold` · **Depends on:** F0-3

**Work:**
1. Enable `coverage` in [vitest.config.ts](../vitest.config.ts) with the `v8` provider.
2. Thresholds: **90% in `@plumbward/core`** (it is the one that can corrupt a
   client's repo), 80% in the rest, no threshold in the text templates.
3. Publish the report as a PR artifact.

**Acceptance criteria:**
- CI fails if `core` coverage drops below 90%.
- The thresholds reflect the real current coverage, not an aspirational number.

---

### [x] F0-8 — Rename the package scope to Plumbward
**Branch:** `refactor/f0-scope-plumbward` · **Depends on:** F0-1 · **Blocks:** Phase 2

**Why before Phase 2:** the six packages were born under `@governance/*`, a
provisional scope. Every new pack multiplies the imports that would have to be
rewritten later, so the cheapest moment to rename is before five packs exist.

**Work:**
1. **Register the organisation on npm before touching anything.**
   Checked on 2026-09-09: the name being considered then, `aegiscode`, was
   **taken** —as were `aegiscode-cli` and `aegiscode-gui`— and, most seriously,
   there was `@save3asy/aegiscode`, published three weeks earlier and described
   as *"AI Code Governance & Architecture Guardrails"*: a competitor with the
   same name in our exact category. That forced a name change. `plumbward` was
   checked as free on npm and on the `.com`, `.dev` and `.io` domains. The
   `plumbward` organisation was registered on 2026-09-09.
2. Rename the six packages to `@plumbward/*` and update the `workspace:*`
   dependencies of every `package.json`.
3. Rename the binary from `governance` to `plumbward`.
4. Decide whether the state directory in the client's repository changes from
   `.governance/` to `.plumbward/`. **Recommendation: keep `.governance/`** —
   it describes the function, not the brand, so a future brand migration does
   not force touching repositories already configured.
5. Update README, plan and CLI texts.

**Acceptance criteria:**
- `pnpm build && pnpm test` green after the rename.
- Not a single reference to `@plumbward/` outside the git history.
- The NPM scope is registered in the company's name.

---

### [ ] F0-9 — Exhaustiveness guard in the simulator and the renderer
**Branch:** `fix/f0-simulate-exhaustiveness` · **Depends on:** F0-1

**Origin:** F0-5 review. The architecture document claimed that adding a new
operation type forces the compiler to handle it everywhere. It is only true in
`executeOperation` and in `plan.ts`.

**Why it matters:** the `switch` in
[simulate.ts](../packages/core/src/simulate.ts) has no `default` and no `never`
assertion. A seventh operation type would compile cleanly and be **silently
ignored by `plan` but executed by `apply`**. It is exactly the divergence the
whole architecture exists to prevent, and today nothing detects it.

**Work:**
1. Add `default: { const _exhaustive: never = operation; ... }` to the
   `simulatePlan` switch.
2. Review `render.ts`, which today does not discriminate by `kind` exhaustively.
3. Test that adds a fake operation type and verifies that the typecheck fails.

**Acceptance criteria:**
- Adding a member to the `Operation` union breaks `pnpm typecheck`, pointing at
  every place that has to be updated.

---

### [ ] F0-10 — Path containment resistant to symbolic links
**Branch:** `fix/f0-symlink-containment` · **Depends on:** F0-1

**Origin:** F0-5 review.

**Why it matters:** `resolveInRepo()` in [fs.ts](../packages/core/src/fs.ts)
compares paths **lexically**, without `realpath`. A symbolic link inside the
repository that points outside (`link -> /home/user/.ssh`) makes
`link/authorized_keys` pass the validation, and `writeFileEnsuringDir` writes
through it. `SECURITY.md` presents this function as the main barrier.

**Work:**
1. Resolve links with `realpath` on the closest existing parent directory
   before comparing, without breaking the legitimate case of creating new files.
2. Decide the policy for a symlink that points outside: reject it and report it
   as a conflict, never follow it silently.
3. Tests with a symlink to an external directory and with a legitimate internal one.
4. Update `SECURITY.md` and `ARCHITECTURE.md` once the gap is closed.

**Acceptance criteria:**
- Writing through a symlink that leaves the repository is rejected.
- Legitimate internal symlinks keep working.

---

### [ ] F0-11 — Reversibility of the effects of installation
**Branch:** `feat/f0-install-rollback` · **Depends on:** F0-1

**Origin:** F0-5 review.

**Why it matters:** the product promises that `rollback` leaves the repository
identical. Today it is only true with `--no-install`: the `execCommand`
operations return `snapshots: []`, so the lockfile that `pnpm add` rewrites and
the content of `node_modules` are left out of the journal. The E2E test and the
documentation's trial script **use `--no-install`**, which is how the gap went
unnoticed.

**Work:**
1. Snapshot the manifest and lock files (`package.json`, `pnpm-lock.yaml`,
   `composer.lock`, `poetry.lock`...) before running an install command, and
   record them in the journal.
2. Decide what to do with `node_modules`: probably not restore it, but **say so
   clearly** in the `rollback` output instead of keeping quiet about it.
3. E2E test with a real installation that verifies the full cycle.
4. When closing the task, remove the warning from the README and from
   `ARCHITECTURE.md`.

**Acceptance criteria:**
- `apply` with installation followed by `rollback` leaves the lockfile as it was.
- `rollback` reports explicitly what it cannot undo.

---

### [ ] F0-12 — Turn the findings of our reviews into controls
**Branch:** `test/f0-review-controls` · **Depends on:** F0-3

**Origin:** the two fresh-context reviews of September 2026 produced 30
findings. Going over them, **five controls would have prevented about two
thirds**.

**Why as a control and not a written rule:** `CLAUDE.md` is already around 130
lines. At 400 nobody applies them reliably, because every new rule dilutes the
others. A test that fails always fails. It is the same thesis the product
sells, applied to ourselves.

**Work — the five controls, as tests:**

1. **Forbidden terms.** After a rename, no occurrence of the old name survives
   except in declared contexts. It would have caught `GOVERNANCE_DEBUG`,
   `$AEGIS`, the `governance-e2e-` prefix and the `governance --version` in the
   F0-6 criteria.

2. **Protected facts.** A list of third-party names and dated records that a
   mass replacement can **never** touch. It is the one that would have stopped
   the most serious failure: renaming `@save3asy/aegiscode`, a competitor's real
   package, to a name that does not exist. **The most important of the five.**

3. **Documented commands exist.** Every `plumbward <x>` in documentation or in
   the `LICENSE` must match a command registered in the CLI. It would have
   caught the *Additional Use Grant* naming `report` and `init`, and `upgrade`
   described in the present tense without existing.

4. **Snapshots of what is generated.** Golden files with the exact output of
   each pack, so that any change in markers, block identifiers or persisted
   tokens shows up in the diff. It would have caught the silent change of the
   `.gitignore` block identifier.

5. **Derived tables, not written ones.** The dependency diagram is generated
   from the `package.json` files. It would have caught the diagram that invented
   an edge and left out two.

**What cannot be mechanised, and has to be accepted:** claiming in the
documentation that a security boundary exists when the code does not implement
it. No linter detects that. For that class, the only defence is the
fresh-context review.

**Already delivered (in F0-3):** `scripts/check-coherence.mjs`, which checks
that the Node floor declared in `package.json` matches the lowest one CI tests,
that README and CONTRIBUTING state that same version, and that every
publishable package declares its own `engines`. It was born from three findings
of the F0-3 review and found the third one by itself, on its first run.

**Acceptance criteria:**
- Deliberately reintroducing each of the four failures cited makes its
  corresponding control fail.
- The list of protected facts and the list of forbidden terms live in a
  readable file and are reviewed in the PR, not hidden in a test.

---

### [x] F0-13 — Protect the branches so that red really blocks
**Branch:** GitHub configuration, no code branch · **Depends on:** F0-3

**Origin:** the F0-3 review. CI shows the red but prevents nothing: with a PR in
red, `gh pr view --json mergeable` returns `MERGEABLE`. A control that can be
ignored is not a control.

**Work:**
1. ~~Rename `Prod` to `main`.~~ **Discarded.** `Prod` is the team's convention
   and perfectly valid; the workflows had to be fixed, not the branch. They
   already target `Prod`, and a control prevents it from happening again.
2. Ruleset on `Prod` and `develop`: forbid direct push, require a Pull Request
   and require green checks.
3. The required check names are `Node 22.13`, `Node 24`, `Node 26`,
   `Tipos y coherencia`, `Escaneo de secretos` and `Ciclo completo sobre
   repositorios reales`.
   **Careful:** they come from the `name` field of each job, so **any change to
   the matrix invalidates the list**. A required check that no longer exists
   blocks every PR forever.
4. Delete from the remote the branches of tasks already integrated.

**Acceptance criteria:**
- [x] A PR with a red check cannot be merged from the interface.
- [x] `gh api repos/.../rulesets` returns the configured rules.
- [x] The rules cover `Prod` and `develop`, the real names of the branches.

**Closed on 2026-09-11**, configured by hand in GitHub. Active ruleset on
`develop` and `Prod`: deletion and force push blocked, PR required with **0
approvals** —with 1, a solo developer could never merge their own PRs— and the
six required checks, verified one by one against the real names of the jobs. A
direct push to `develop` is rejected; tested.

It came late: hours earlier, F0-14 had entered `develop` through a direct push,
because the local branch was created tracking `origin/develop`. With this rule
a direct push is no longer possible. **A PR without review still is**: with 0
approvals, review depends on someone asking for it. For a solo developer that
is right, but the two things should not be confused.

What was learned configuring it by hand is the basis of the automatic version,
in F3-5.

---

### [x] F0-14 — Protected branch detection cannot be hardwired
**Branch:** `fix/f0-protected-branches` (the version being closed, in
`fix/f0-protected-branches-rework`, PR #7) · **Depends on:** nothing · **Priority: high**

**Origin:** when the release branch of this repository was renamed to `Prod`, it
became visible that the CLI does not recognise it.

**The failure, and it is serious:**

```ts
const PROTECTED_BRANCHES = new Set(['main', 'master', 'production', 'prod'])
if (!PROTECTED_BRANCHES.has(currentBranch)) { /* works on the current branch */ }
```

1. **It is case-sensitive.** `Prod` does not match `prod`, so `apply` would
   write **directly on the production branch** instead of creating the isolated
   branch. It is a violation of the product's main guarantee —*"work never
   happens on main"*— and it happens silently.
2. **It is a closed list.** It does not consider `trunk`, `produccion`,
   `desarrollo` or any team convention. We sell adapting to any repository and
   take four English names for granted.
3. **`recommendedProfile` guesses wrong:** `scan.git.branch === 'master' ? 'master'
   : 'main'` decides that the main branch is called `main` as soon as it is not
   called `master`. With `Prod`, the generated profile lies.

**Work:**
1. ~~Detect the **real** default branch of the repository
   (`git symbolic-ref refs/remotes/origin/HEAD`, with `init.defaultBranch` and
   the current branch as fallback) instead of deducing it from a list.~~
   Replaced: `origin/HEAD` only proposes `integration` when generating
   `config.yml`, and `init.defaultBranch` is not used. Protection no longer
   depends on the default branch.
2. ~~`prepareBranch` decides from `profile.branches`, which is the configured
   source of truth, plus the detected default branch. The hardwired list becomes
   only a fallback, and **case-insensitive**.~~
   Replaced by inverted protection: no list of protected branches remains, not
   even as a fallback. The profile's branches are always isolated,
   case-insensitively.
3. ~~`recommendedProfile` fills `branches.main` with the detected branch.~~
   Discarded: see the third version below and ADR 0005.
4. ~~Tests with `Prod`, `PROD`, `trunk`, `produccion` and a repository with no
   remote.~~
   Replaced: with inverted protection, any name without a work prefix is
   isolated. The tests try `Prod`, a tag with the same name, detached HEAD, a
   repository with no commits and another with no remote, and names outside any
   list (`pro`, `pre`, `live`, `release/prod`…).

**Acceptance criteria:**
- [x] `apply` does not write directly on any branch that is not clearly a work
      branch: not with a tag of the same name, not with detached HEAD, not in a
      repository with no commits, nor with names outside any list (`pro`, `pre`,
      `live`, `release/prod`).
- [x] The decision does not depend on a list of long-lived branches. The only
      list that decides is the one of work prefixes, which is closed.

**Closed on the third attempt.** It is written down in full so it is not repeated.

**First version** (entered `develop` without a PR on 2026-09-11; the review after
the merge took it apart):

1. It read the branch with `git rev-parse --abbrev-ref HEAD`, which returns
   `heads/Prod` if a `Prod` tag exists. `symbolic-ref --short` has the same
   defect; this was checked before choosing the solution.
2. It took GitHub's default branch as the release branch. In git-flow that is
   `develop`, and the generated CI deployed to production from `develop`.
3. **Its verification proved nothing**: "the `Prod` commit does not move" also
   held with the failure, because `apply` never commits.
4. The tests repeated the list: removing a whole source broke none of them.

**Second version** (PR #7, blocked by the review before the merge): it fixed
reading the branch, but deduced the release branch from the first name of a
priority list. With `main` (where PRs go) and `Prod` (deployment), the generated
CI only checked `Prod` and **PRs to `main` went unchecked**. And any name outside
the list was still unprotected.

**The lesson of the three:** every heuristic to deduce "which one is the release
branch" fixed some repositories and broke others. It cannot be deduced. Hence
the principle of **[ADR 0005](adr/0005-inference-fails-safe.md)**: when an
inference fails, it must fail towards more protection, never towards an action.

**Third version, the one being closed:**

- **Inverted protection.** Work is always isolated, except on work branches
  recognisable by their prefix (`feat/`, `fix/`, `chore/`…). An unknown name
  falls on the safe side.
- **The profile separates the two roles** that `branches.main` used to mix:
  `integration` (which branch PRs go to, deduced from `origin/HEAD`) and
  `release` (which one is deployed from, **never deduced**). Without `release`,
  the deployment workflow is not generated and `doctor` warns about it.
- **The generated CI checks every Pull Request**, without filtering by branch.
- The current branch is read with `git symbolic-ref -q HEAD` unabbreviated;
  with detached HEAD it is isolated all the same.
- An old `config.yml` keeps working: `dev` becomes `integration`, but `main`
  does **not** become `release`, because it was a guessed value.
- Every test isolates git from the machine's global configuration.

**Fourth round** (second review before the merge of PR #7): the core held —it
found no way to write on a long-lived branch—, but it blocked for four other
things, already fixed:

- The CI push branches came from local references: two copies with the same
  `config.yml` generated different workflows. **It broke invariant 2.** Now they
  come only from the profile, with a test that checks it.
- The tests were claimed to be isolated from the global git configuration, and
  only one was. Now all of them are, from the vitest configuration: with a
  configuration that signs commits with a `gpg` that always fails, all 75 pass.
- `claude/add-lint` was isolated, and if the isolated branch already existed,
  `apply` wrote on it even if it was out of date. Now the AI assistant prefixes
  are work branches, and with the isolated branch already existing `apply` stops
  without writing.
- `doctor` said there was no deployment workflow when an old one was still in
  the repository. Now it looks at the file.

**Fifth round** (third review before the merge of PR #7): it did not find a way
to write on a long-lived branch either. It blocked for four things, already
fixed:

- `doctor` accepted an old `ci-prod.yml` without looking at which branch it
  deployed from. Now it reads its triggers and compares them with
  `branches.release`. It also warns if `ci-dev.yml` filters Pull Requests by
  branch.
- With a `config.yml` that did not define branches, they were filled from the
  local state: invariant 2 was still broken through another door. Now they come
  only from the file.
- In a `git init` with no remote, the generated CI did not run on any push. Now
  the current branch is proposed as integration, if it is not a work branch, or
  `main`/`master` if they exist.
- The principle was badly stated in the ADR title, in the file name and in this
  plan. Now it says the same everywhere, and the file is called
  `0005-inference-fails-safe.md`.

Of the follow-ups, fixed here:

- If the isolated branch already exists, `apply` stops **before** asking for
  confirmation and proposes the safe options: apply from that branch, or delete
  it with `git branch -d`, which does not delete unintegrated work.
- The isolated branch is created with `--no-track`. With
  `branch.autoSetupMerge=inherit` it inherited the upstream of `Prod`, and a
  `git push` sent the commit to production. It is the same pattern as the direct
  push to `develop` in F0-13.
- The tests delete `GIT_DIR`, `GIT_WORK_TREE` and the rest of the git variables
  before starting: inherited from a hook, they rewrote the configuration of the
  real repository.
- `release: ""` and `dev: null` count as "not configured".
- `GitState.branches` no longer claims to serve for deducing the role of each
  branch: it only feeds the initial `integration` proposal.

Moved to other tasks: the "repository intact" message after a failure with HEAD
on the isolated branch and the mutations in CI (F0-15), and the PR filters of an
old `ci-dev.yml` (F4-2).

**Not mechanisable:** this branch also closes F0-13 and annotates F0-16, F3-5,
F4-1 and F4-2, against "one branch, one task". They are annotations derived from
F0-14, but no control tells a legitimate annotation apart from a change of
scope. The defence is the review.

**Sixth round** (fourth review before the merge): it blocked for two things,
already fixed:

- If someone switched branch while `apply` waited for confirmation —another
  terminal, the IDE, a parallel agent—, the plan computed for `feat/x` was
  applied on `Prod`. It also existed in `develop`. Now, after confirming, HEAD
  is read again and, if the branch or the commit have changed, it aborts without
  writing. The test replaces the confirmation with one that switches branch: it
  reproduces the race without timers.
- The plan said the tests deleted "the rest of the git variables", and they only
  deleted five: `GIT_CONFIG_COUNT`, which `git -c` exports to hooks, still got
  in. Now `vitest.setup.ts` deletes every `GIT_*` and then sets the two that
  isolate.

Its follow-ups move to F0-15 without touching more code in this PR: it is the
first application of the token conservation protocol (a PR only fixes
blockers).

**How it was verified:** tests red before each change, and **30 deliberate
mutations** of the logic, recorded in `scripts/check-mutations.mjs`
(`pnpm check:mutations`) and run under a hostile git configuration, global and
injected by the environment. The full run detected 28 of 28; the three added in
the sixth round were run separately (`pnpm check:mutations <name>`) and are
detected too. Earlier rounds used mutations that did not stay in the repository,
and the review could not reproduce them; that is why they are now a script.
Several turned out to be equivalent mutants —`??` also skips `null`, or a test
that already configured the name in lower case— and were replaced by faithful
mutations or tests.

**CI was not checking types**, discovered along the way: the typecheck and
coherence steps had `if: matrix.node == '22'` and the matrix was `'22.13'`. They
are now a job of their own, `Tipos y coherencia`.

**Pending, noted for `doctor` (F4-3):** warn when `origin/HEAD` may be out of
date and suggest `git remote set-head origin --auto`. The tool must not run it
by itself: it modifies git state and needs the network.

---

### [x] F0-15 — Fix the branch name control after the review of PR #6
**Branch:** `fix/f0-branch-control-review` · **Depends on:** F0-14

**Origin:** PR #6 was merged without review and reviewed afterwards, in a fresh
context. The most serious finding —CI never ran the control— was fixed in
F0-14. These remain, and their general conclusion is uncomfortable: **the branch
name control, as it stands, is more fragile than it looks.**

The review left fourteen points, and only five are the branch name control. The
rest —the client template, the merge strategy decision, the leftovers of the
plan and the follow-ups of the F0-14 and PR #7 reviews— have been spread over
F0-19 to F0-24 and F0-26 to F0-28: a branch implements exactly one task (§3 of
`CLAUDE.md`).

**Work:**

1. **Do not block legitimate branches.** As soon as the control runs in CI, a PR
   from `develop` to `Prod` —a release— fails, because `develop` does not follow
   the task branch format. `revert-*` (GitHub's *Revert* button) and
   `<user>-patch-*` (the web editor, which outside contributors will use now that
   the repository is public) would fail too. On top of that, the `dependabot/`
   prefix is a back door: `dependabot/../fix/f0-ramas` passes it. Exemption by
   **author** (`github.actor`), not by name, and an explicit list of permanent
   branches.

2. **The language heuristic fails both ways.** It lets through 15 of the 33
   Spanish names that the PR itself renamed (`version-unica`,
   `cobertura-umbral`, `trinquete-metricas`, `suscripcion-anual`…) and rejects
   valid English names (`access-control`, `de-duplicate`, `y-axis`). `control`
   was an especially bad signal: it rejected the branch name of **this very
   task** as soon as it was written in the plan. It was removed from the list in
   F0-14 so it could be merged; the rest is redone here.
   The format accepts `f00` and `f999`. Redo it with a **test corpus**: the 33
   renamed names as positives and a list of real English names as negatives. If
   it does not reach an acceptable precision, **remove it** and keep only the
   format: a heuristic that fails half the time is worse than none, because it
   gives a false sense of control.

3. **The plan parser fails silently.** It skips branch lines with slightly
   different formats, accepts an empty plan, does not recognise `### [X]` with a
   capital letter and does not reset its state on headers that are not tasks.
   Add a minimum assertion: if it finds fewer branches than there are tasks, it
   fails.

4. **The control has no tests.** The five cases of the PR were tested by hand.
   Besides, the script cannot be tested as it is: everything runs on load and
   ends with `process.exit`. Split the logic into exported functions and cover
   it with unit tests.

5. **Section 0 of `CLAUDE.md` does not work literally on a clean clone.** It is
   missing `pnpm install`, it uses `git branch --show-current`, which is not in
   the list of read-only commands allowed by §1, and it says "first session in
   this conversation".

**What becomes a mechanical control:** points 1, 2, 3 and 4 —the exemptions of
1 are covered with tests just like the corpus and the parser—. Of 5, that the
`git` commands of §0 are allowed by §1: it is a clash between two sections of
the same file, and it is only seen by reading both at once.

**How it turned out:**
- The logic lives in `scripts/branch-names.mjs`: pure functions, without
  `process.exit`. `scripts/check-coherence.mjs` only wires the inputs.
- The corpus is in `scripts/branch-names-corpus.json`: 33 Spanish names, 43
  English ones. The new heuristic detects 32 of 33 and rejects none of the 43;
  the previous one let 15 through and rejected 2. The only one not detected,
  `feat/f3-ci-solo-diff`, is declared in the corpus itself with its test: all
  its components are also English words.
- The language signal is no longer just a list of words: it is endings that do
  not exist in English (`-cion`, `-dad`, `-miento`, `-cia`, `-ido`), and function
  words (`de`, `y`, `al`…) only count **between** two other components, which is
  what separates `gobierno-de-ramas` from `de-duplicate`.
- Exemption by author: `[bot]` in the login, `<login>-patch-<n>` only if the
  login is the author's, and `revert-<pr>-<branch>` only if the reverted branch
  was valid. `Prod` and `develop` are an explicit list, not a pattern.
- The minimum assertion counts **per task**, not totals: a branch line under a
  header that is not a task made up for the missing one, and the task with no
  branch was still not judged. The review of this PR found it.
- Control 8 walks the whole of §0, not only its ```bash blocks: a command written
  in prose between backticks slipped through, and the claim in §1 —"every `git`
  command in §0"— was false. The review found that too. The second pass added
  the global options: `git -C path push` and `git -c k=v commit` did not match
  the pattern and disappeared entirely. Nine mutants tested by hand; automating
  them is point 4 of F0-25.

**Not mechanisable:** a `docs:` commit of PR #6 brought in a product change (the
generated AI rules) and a new CI control, and the PR description skipped the
criteria and Definition of Done sections of the template. No control sees the
scope of a commit or reads a description; the defence is the fresh-context
review. It is recorded so it is not repeated.

**Acceptance criteria:**
- [x] A PR from `develop` to `Prod` passes the control. Verified by simulating
  `GITHUB_HEAD_REF=develop`, together with the bot, web editor and *Revert*
  button branches.
- [x] The name corpus is in the repository and the control passes it.
- [x] The coherence script has tests that run in `test:unit`
  (`scripts/branch-names.test.mjs`, 97 cases).
- [x] Section 0 of `CLAUDE.md` works by copying and pasting on a clean clone,
  and a control watches it: `check:coherence` fails if §0 proposes a `git`
  command that §1 does not allow. Tested with the mutant.

---

### [x] F0-16 — File names and identifiers in English
**Branch:** `refactor/f0-english-names` · **Depends on:** F0-41

**Origin:** decision of 2026-09-11, widened on 2026-09-13: English becomes the
main language of the whole repository (see F0-41). The names go before the
translations of F0-42, F0-18, F0-43 and F0-44, so that those land directly on
their final path: translating and renaming at the same time doubles the churn
and breaks rename detection in the diff.

**Work:**
1. Rename to English the files with Spanish names —`scripts/verificar-coherencia.mjs`,
   `docs/PLAN_DE_EJECUCION.md`, `docs/ARQUITECTURA.md`, `docs/MODELO_DE_NEGOCIO.md`,
   ADRs 0001 to 0004 and the `GOBERNANZA.md` generated by the Node pack— and
   **update every link and reference in the same change**, including the paths
   read by the `check:coherence` scripts and the pending list of the F0-41
   control.
2. Move to English the variables and functions with Spanish names.
3. **The control, not only the rule.** In the same session in which it was
   agreed, a new file with a Spanish name was created
   (`0005-lo-inferido-solo-amplia.md`, fixed before committing). A freshly written
   rule is easily broken: `check:coherence` must fail on a new file whose name
   looks Spanish, and on broken links after the rename.

The language of what the product generates for the client, which used to be
here, is F0-45.

**Result (2026-09-13):**
- Renamed: `scripts/check-coherence.mjs`, `docs/EXECUTION_PLAN.md`,
  `docs/ARCHITECTURE.md`, `docs/BUSINESS_MODEL.md`, ADRs
  `0001-plan-before-apply`, `0002-local-first-licensing`, `0003-busl-license`
  and `0004-annual-subscription`, and the generated `GOVERNANCE.md`. Also the
  names that are identifiers without being files: the `check:coherence` script,
  the CI job ids (`verify`, `quality`, `secrets`, `history`, `full-cycle`,
  `mutations`), the control ids of `check-coherence.mjs` and the mutation
  verdicts (`detected`, `survived`, `not-run`). Identifiers were renamed on the
  syntax tree. Comments and strings changed only where they named a renamed
  path or id (`Lee GOVERNANCE.md` in `commands.ts`, for example); their
  translation is F0-43 and F0-44.
- Controls: `scripts/english-only.mjs` fails for a path that looks Spanish
  (accents, the branch-name heuristic on each segment, and the two words of the
  old names that heuristic missed), with no list to escape to.
  `scripts/doc-links.mjs` fails for a relative Markdown link to a path that
  does not exist.
- Not mechanisable: a Spanish name made only of words English also has passes,
  since the heuristic is not a dictionary; link anchors are not checked; an
  identifier is only caught by the content scan once its file leaves `pending`.
- Left to F0-45, item 5: the Spanish job ids of the CI the Node pack generates
  for the client (`calidad`, `secretos`, `gobernanza`).
- Limits of the new controls found in the fresh-context review: F0-46.

**Acceptance criteria:**
- No file or identifier in Spanish.
- No broken link in the documentation.
- The control fails when a file with a Spanish name is added.

---

### [x] F0-17 — Token conservation protocol and agent tools
**Branch:** `chore/f0-agent-tooling` · **Depends on:** F0-14

**Origin:** the session of PR #7 (F0-14) used more than 80 % of the five-hour
usage window. Every step resent the whole conversation (~130k tokens), there
were five fresh-context review rounds, and every follow-up fixed inside the PR
triggered another round. Caveman only trims the output, less than 1 % of the
spend: the lever is opening new sessions.

**Work:**
1. Section 6 of `CLAUDE.md`: one task, one session; heavy work to CI; targeted
   reads; on an open PR only blockers. Section 0 stops asking for the full
   battery locally and queries CI.
2. Integrate napkin (`blader/napkin`): skill in `.agents/skills/napkin/` pinned
   in `skills-lock.json`, symbolic link `.claude/skills/napkin` —Claude Code does
   not read `.agents/`— and versioned runbook in `.claude/napkin.md`.
3. Document caveman as an optional plugin of each developer, and forbid its
   cloud gateway (`caveman-setup`) because of ADR 0002.
4. **The control, not only the rule.** `check:coherence` fails if a skill does
   not match the lock hash, if it is missing from the lock, if its link in
   `.claude/skills/` is missing, or if the runbook breaks its curation rules.
5. Carry the protocol into the product: widen F2-9 and F2-12.

**Acceptance criteria:**
- [x] `CLAUDE.md` sets out the protocol and how napkin and caveman are used.
- [x] Claude Code loads the napkin skill from `.claude/skills/`. Verified in a
  new session: skills are discovered at startup.
- [x] `check:coherence` fails when editing the skill, putting a symbolic link in
  it, deleting the link from `.claude/skills/`, adding a skill without a lock,
  removing a "Do instead", removing a date or going over 10 entries in a
  category. Tested with the mutants.
- [x] F2-9 and F2-12 include the protocol and the agent tools.

**Not mechanisable:** how long a session lasts and what is read in it. No
control in the repository observes it; the defence is section 6 of `CLAUDE.md`.
Nor is when the runbook is curated: the skill asks for it on every read and our
rule, only when adding an entry. No control sees how many times it is
rewritten; `CLAUDE.md` prevails, and says so explicitly.

**Known limitation:** the symbolic link does not work on Windows with
`core.symlinks=false`, where git leaves it as a text file. Nobody on the team
develops on Windows today; the control would detect it.

---

### [ ] F0-18 — Repository documentation in English
**Branch:** `docs/f0-english-documentation` · **Depends on:** F0-16

**Origin:** decision of 2026-09-11, widened on 2026-09-13 (see F0-41). The
industry and the assistant itself work in English, and every Spanish document
the assistant reads is paid for in tokens in every session. It is different from
Phase 1: that one translates what the product **generates** for the client
according to their profile; this one translates **our own** documentation.

**It is retroactive, without rewriting facts.** Closed ADRs are translated too:
translation changes the language, not the content. Dates, discarded
alternatives, proper names and literal quotes are kept as they are.

**Work:**
1. Translate to English, keeping structure and links: `README.md`,
   `CONTRIBUTING.md`, `SECURITY.md`, the architecture, the business model and
   every ADR in `docs/adr/`. `CLAUDE.md`, the runbook and the PR template belong
   to F0-41; the plan, to F0-42.
2. Remove each translated file from the pending list of the F0-41 control.
3. If it does not fit in one session: one batch per file, each with its own
   commit on the same branch and `pnpm check:coherence` green. It is still one
   task and one PR.

**What becomes a mechanical control:** the F0-41 one, with these files out of
its pending list.

**Acceptance criteria:**
- No listed document contains Spanish outside the exceptions declared in the
  F0-41 control.
- Dates, discarded alternatives and proper names do not change content.
- No internal link is broken after the translation.

---

### [ ] F0-19 — The branch template for clients contradicts itself in Spanish
**Branch:** `docs/f0-branch-naming-templates` · **Depends on:** F0-15

**Origin:** review of PR #6, points 5 and 6. They came out of F0-15 so as not to
mix the repository's control with what is generated for the client.

**Work:**
1. With `commitLanguage: 'es'` the template says branches go in Spanish and
   gives `fix/protected-branch-detection` as the example, fixed in English. The
   test only covers `en`, and two assertions include a literal line break that
   will break when the paragraph is reflowed. With `git: false` it still says
   "the person who runs git".
2. The header written in the client's `config.yml` and the JSDoc of
   `commitLanguage` still say it only affects commits and PRs; now it also
   affects branches and titles.

**What becomes a mechanical control:** the template test is widened to `es` and
to `git: false`, and stops comparing paragraphs with literal line breaks.

**Acceptance criteria:**
- The template says the same in `es` and in `en`, and the test covers both
  languages.
- With `git: false` there is no mention of whoever runs git.
- The `config.yml` header and the JSDoc of `commitLanguage` name branches and
  titles.

---

### [ ] F0-20 — Decide the merge strategy and reword the argument
**Branch:** `docs/f0-merge-strategy` · **Depends on:** F0-15

**Origin:** review of PR #6, point 7. The argument of the branch naming rule is
"the branch name stays in the git history". With *squash merge* and branch
deletion, which is what §3.2 says, it does not. It only stays because in
practice merges are being done with a *merge commit*.

**Work:** decide which of the two is the rule and write it down in one place.
Reword the argument: the branch name is seen in the PR, in CI and in the merge
message, and the whole team reads it.

**What becomes a mechanical control:** nothing by itself; it is a decision. If
*squash merge* is chosen, the CLI's `git branch -d` advice stops working and
that is a control (it stays in F0-28, which depends on this decision).

**Acceptance criteria:**
- §3.2 and `CLAUDE.md` state the same merge strategy.
- The argument of the branch naming rule does not claim anything the chosen
  strategy contradicts.

---

### [ ] F0-21 — Restos del plan y del diagrama de flujo
**Branch:** `docs/f0-plan-leftovers` · **Depends on:** F0-15

**Origen:** revisión de la PR #6, punto 9.

**Trabajo:** el diagrama del §3.2 sigue diciendo `docs/f2-guia-packs` y
`main (release)`; F3-5 tiene dos puntos numerados `2.`; la lista de "ya
entregado" de F0-12 no incluye los controles que se han ido añadiendo, y F0-12
sigue diciendo que `CLAUDE.md` "ronda las 130 líneas" cuando pasa de 250.

**Qué se convierte en control mecánico:** extender el control de nombres de rama
al diagrama del §3.2, que hoy no mira. El recuento de controles de F0-12 se
deriva de `check-coherence.mjs` en vez de escribirse a mano, que es lo que
lo deja caducado cada vez que se añade uno. El resto es corrección puntual.

**Criterios de aceptación:**
- El diagrama del §3.2 usa nombres de rama que pasan el control, y el control
  los mira.
- F3-5 numera sus puntos sin repetir.
- F0-12 no afirma ningún número —de controles ni de líneas— que el repositorio
  desmienta.

---

### [ ] F0-22 — Seguimientos de la revisión de F0-14
**Branch:** `fix/f0-f014-review-followups` · **Depends on:** F0-15

**Origen:** revisión de la PR #7, punto 11 de F0-15.

**Trabajo:**
1. El control de que existe el job `quality` se ejecuta **dentro de ese mismo
   job**: con `if: false`, `continue-on-error: true` o quitándole los pasos, el
   control desaparece con él. Debe comprobarse desde otro job, o mejor, que el
   job sea un check obligatorio (lo es desde F0-13) y verificar que lo sigue
   siendo leyendo el ruleset.
2. La comprobación de condiciones `if` no reconoce `- if:` en forma de elemento
   de lista, operandos invertidos ni `startsWith`, y no mira `e2e.yml`.
3. La rama por defecto sólo se lee de `origin`: un repo cuyo remoto se llame
   `upstream` no aporta esa fuente.
4. Los tests de `packages/*/test/` no pasan por el typecheck: los `tsconfig`
   sólo incluyen `src/`.
5. `listBranchNames` quita sólo el primer segmento del nombre de un remoto: un
   remoto con `/` en el nombre produce nombres de rama erróneos.
6. Los tests que ejecutan `runApply` imprimen toda la salida del CLI en el log
   de la CI.

**Qué se convierte en control mecánico:** los puntos 1 a 5. El 6 es ergonomía,
no corrección. Un `integration` deducido de un `origin/HEAD` desfasado y escrito
en `config.yml` **no** es mecanizable —depende de que el equipo lea el fichero—
y lo resuelve la confirmación del wizard (F4-1).

**Criterios de aceptación:**
- Vaciar el job `quality` hace fallar la CI desde otro job.
- Hay un test por cada uno de los puntos 2 a 5, y falla al revertir su
  corrección.

---

### [ ] F0-23 — Sacar el escaneo del historial completo a su propio workflow
**Branch:** `ci/f0-history-scan-workflow` · **Depends on:** F0-15

**Origen:** revisión de la PR #6, punto 12. Vive en `ci.yml` con una condición,
así que aparece como *Skipped* en todas las PRs y genera la duda de si algo
falla. En un workflow que sólo se dispare por calendario y a mano, no
aparecería. Se ejecutó por primera vez el 2026-09-11: el historial completo
está limpio.

**Qué se convierte en control mecánico:** nada. Es un cambio de estructura sin
regla nueva que vigilar.

**Criterios de aceptación:**
- El escaneo vive en su propio workflow, con disparadores `schedule` y
  `workflow_dispatch`.
- Ninguna PR muestra un job *Skipped* por esta causa.

---

### [x] F0-24 — `rollback` y mensajes fuera de la rama en la que se escribió
**Branch:** `fix/f0-pr7-review-followups` · **Depends on:** F0-15

**Origen:** puntos 13 y 14 de F0-15, de la tercera y la cuarta revisión previas
al merge de la PR #7.

**Por qué está dividida:** la revisión dejó ocho seguimientos sin relación entre
sí, y uno de ellos —el consejo `git branch -d`— no se puede hacer hasta que
F0-20 decida la estrategia de merge, así que la tarea entera quedaba bloqueada
por su punto más pequeño. Se reparten en F0-24, F0-26, F0-27 y F0-28: una rama
implementa exactamente una tarea (§3 de `CLAUDE.md`), y una PR de ocho arreglos
inconexos fuerza justo la revisión gigante que §6 pide evitar. Aquí quedan los
dos que comparten código: los dos son "`apply` escribió en otra rama y nadie se
ha enterado".

**Trabajo:**
1. **Prioridad alta.** `rollback` en `Prod` sobrescribe ficheros de `Prod` con
   un journal de un `apply` que escribió en la rama aislada: el journal guarda
   la rama de partida, no la escrita, está ignorado por git y sobrevive a los
   checkouts. Reproducido: devuelve el `package.json` de `Prod` a una versión
   anterior. Existe también en `develop`. El journal debe guardar la rama en la
   que se escribió, y `rollback` negarse en cualquier otra.
2. Tras un fallo de `apply` —un `EACCES`, por ejemplo—, la reversión automática
   deja HEAD en `chore/setup-ai-governance` y el mensaje dice "el repositorio
   está intacto". Los ficheros lo están, pero la rama actual ya no es la de
   partida. El mensaje debe decir en qué rama queda y cómo volver. Lo mismo tras
   `rollback`.
Los otros seis seguimientos de esta revisión están en F0-26 (validación y
detección), F0-27 (el job de mutaciones) y F0-28 (el consejo `git branch -d`).

**Qué se convierte en control mecánico:** un test por punto; el del `rollback`,
reproduciendo el caso de la revisión.

**Criterios de aceptación:**
- `rollback` se niega a actuar en una rama distinta de aquella en la que
  `apply` escribió, y hay un test que reproduce el caso de `Prod`.
- Hay un test del punto 2, y falla al revertir su corrección.

---

### [ ] F0-25 — Seguimientos de la revisión de la PR #10
**Branch:** `fix/f0-branch-control-followups` · **Depends on:** F0-15

**Origen:** revisión en contexto nuevo de la PR #10 (F0-15). Los dos
bloqueantes se corrigieron dentro de la PR; estos son los no bloqueantes, que
van al plan y no a la rama abierta (§6.4 de `CLAUDE.md`).

**Trabajo:**
1. **Dos exenciones siguen siendo por nombre, no por autor.** `branchExemption`
   exime `Prod`/`develop` y `revert-<n>-<rama válida>` sin mirar el autor:
   cualquiera puede llamar a su rama `revert-1-develop` y saltarse el control
   entero. El impacto real es bajo —es un control de convención, no de
   seguridad— pero la puerta trasera que cerró el punto 1 de F0-15 sigue
   entreabierta con otra forma. Decidir si se ata también al autor (la rama
   `revert-*` la crea quien pulsa el botón, que es alguien con permiso de
   escritura) o si se acepta, y dejarlo escrito donde se pueda leer.
2. **Regresión operativa con Dependabot, sin anotar.** La exención exige ahora
   `GITHUB_ACTOR` terminado en `[bot]`. Si una persona empuja un commit a una
   rama `dependabot/...`, el actor es esa persona y la rama falla el formato:
   CI roja en una rama legítima. Con el prefijo anterior no pasaba. La decisión
   es deliberada y correcta, pero no está anotada ni en el plan ni en el JSDoc.
3. **La lista de permitidos del control 8 se corta en el primer punto.** El
   patrón `/Sí puedes usar los de sólo lectura:([\s\S]*?)\./` trunca la lista
   en silencio si alguien añade a la §1 un `git log --format=%h` o cualquier
   comando con un punto. Falla en voz alta, que es la dirección segura, pero el
   mensaje apunta al sitio equivocado y cuesta de diagnosticar.

4. **El control 8 no tiene ni un test automático.** Se ha validado con nueve
   mutantes a mano, en dos revisiones. Es el argumento textual del punto 4 de
   F0-15 —lógica en línea dentro de un script que acaba en `process.exit`—
   aplicado al control que nació de esa misma revisión, y la rama de error
   nueva (el `git` cuyo subcomando no se sabe leer) tampoco tiene prueba. La
   solución ya está demostrada en F0-15: sacar el cuerpo a una función pura,
   en un módulo propio, y cubrirla con los mutantes que hoy se lanzan a mano.

5. **Cosmético.** El mensaje de la aserción de mínimo dice "1 de las 1 tareas".

**Qué se convierte en control mecánico:** el 1, el 3 y el 4, con tests. El 2 es
una anotación: ningún control puede ver que una rama de bot ha dejado de serlo
porque una persona ha empujado a ella.

**Criterios de aceptación:**
- La decisión del punto 1 está escrita, y si se ata al autor hay un test que
  rechaza `revert-1-develop` de un autor sin permiso.
- El punto 2 está anotado en el JSDoc de `branchExemption`.
- Añadir a la §1 un comando con un punto no trunca la lista de permitidos, y
  hay un test que lo fija.
- El control 8 vive en un módulo propio con tests que cubren, como mínimo, los
  nueve mutantes ya probados a mano: comando en prosa, en bloque, en tabla,
  con `-C` y con `-c`, permitido con `=`, subcomando ilegible, `gitlab`/`legit`
  que no son comandos, y la lista de la §1 recortada.

---

### [ ] F0-26 — Validación y detección: `doctor`, nombres de rama y `branches`
**Branch:** `fix/f0-branch-config-validation` · **Depends on:** F0-15

**Origen:** puntos 3, 4, 5 y 7 de las revisiones de la PR #7, separados de F0-24
(ver allí el porqué de la división). Los cuatro son el mismo fallo con cuatro
caras: **la herramienta mira un dato, no lo entiende, y sigue como si nada.**

**Trabajo:**
1. `doctor` da por revisadas todas las PRs con `branches-ignore` o `paths` en
   `pull_request`, y avisa en falso con `on: pull_request` y
   `on: [push, pull_request]`.
2. Con una rama llamada `chore`, `apply` falla tras confirmar con un error crudo
   de git (`refs/heads/chore' exists`). No escribe nada, pero la comprobación
   previa no lo detecta.
3. Un valor no textual en `branches` (`release: 2024`) se descarta sin avisar.
4. `ciPushBranches` deduplica sin distinguir mayúsculas, y los filtros de GitHub
   sí distinguen: `integration: prod` y `release: Prod` dejan fuera `Prod`.

**Qué se convierte en control mecánico:** un test por punto.

**Criterios de aceptación:**
- Hay un test por cada uno de los cuatro puntos, y falla al revertir su
  corrección.
- Ningún valor de `branches` se descarta en silencio: o se usa, o se avisa.

---

### [x] F0-27 — Ejecutar `check:mutations` en CI
**Branch:** `ci/f0-mutation-job` · **Depends on:** F0-15

**Origen:** punto 8 de las revisiones de la PR #7, separado de F0-24 (ver allí
el porqué de la división). Va solo porque no toca código de producto: es
infraestructura, y mezclarlo con arreglos de comportamiento obliga a revisar dos
cosas distintas en la misma PR.

**Trabajo:** `pnpm check:mutations` no se ejecuta en CI, así que todavía no es
un control: depende de que alguien lo lance. Añadirlo como job, al menos en las
PRs que tocan `branches.ts`, `context.ts`, `commands.ts` o las plantillas de CI.
Así deja de ejecutarse dentro de la sesión del asistente, que es lo que más
tarda (§6.2 de `CLAUDE.md`).

**Qué se convierte en control mecánico:** el propio job, y uno más que hizo
falta al montarlo: el filtro `paths:` que decide cuándo corre es una lista
escrita a mano, y la de mutaciones crece. Si una mutación nueva toca un fichero
que el filtro no nombra, el job deja de ejecutarse sin ponerse en rojo —no se
ejecuta, no falla—. `check:coherence` deriva la lista de `check-mutations.mjs`
y compara (`scripts/mutation-paths.mjs`, con su test).

Y un tercero, de la revisión: el script daba "detectada" para cualquier salida
distinta de 0, y `spawnSync` devuelve `status: null` cuando no puede lanzar el
proceso o salta el timeout. Un entorno roto —`pnpm` ausente, un `install` a
medias, un runner sin memoria— producía "30 de 30 detectadas" en verde sin
ejecutar un test. Ahora el veredicto es explícito (`scripts/mutation-outcome.mjs`,
con su test) y la batería se ejecuta antes en seco, sin mutar nada.

**Criterios de aceptación:**
- `check:mutations` corre en CI y una mutación superviviente pone la PR en rojo.
- El job va en uno propio, sin `if:` de matriz (napkin: un `if` de matriz
  desaparece sin fallar).

---

### [ ] F0-28 — El consejo `git branch -d` tras la estrategia de merge elegida
**Branch:** `fix/f0-delete-branch-advice` · **Depends on:** F0-20

**Origen:** punto 6 de las revisiones de la PR #7, separado de F0-24 (ver allí
el porqué de la división). **Es el que bloqueaba la tarea entera:** no se puede
arreglar hasta que F0-20 decida si se mergea con *squash* o con *merge commit*,
y tenerlo dentro dejaba los otros siete esperando a una decisión ajena.

**Trabajo:** el consejo `git branch -d` que imprime `isolatedBranchBlocks` no
funciona tras un *squash merge*: git no reconoce la rama como integrada y se
niega a borrarla, así que el mensaje manda al usuario a un comando que falla.
Ajustarlo a lo que F0-20 decida.

**Qué se convierte en control mecánico:** un test del texto del consejo, atado a
la estrategia escrita en F0-20.

**Criterios de aceptación:**
- El comando que imprime la CLI funciona con la estrategia de merge elegida.
- Hay un test que falla si el consejo vuelve a la forma que no funciona.

---

### [x] F0-29 — `apply` no puede prometer un `rollback` que no va a poder hacer
**Branch:** `fix/f0-unrevertable-journal` · **Depends on:** F0-24

**Origen:** hallazgo 2 de la revisión en contexto nuevo de la PR #11. **Es una
regresión que introdujo F0-24**, no un hueco antiguo.

**El síntoma:** con `--no-branch` y HEAD desacoplado, `prepareBranch` sale
pronto, `apply` escribe sobre el HEAD desacoplado y `writtenOnBranch` queda
`null`. El guardián de F0-24 se niega siempre, así que ese journal no se puede
revertir nunca. Antes de F0-24 ese `rollback` funcionaba.

**Ya hecho en F0-24, y no es esta tarea:** retirar la promesa falsa. El paso 4
de la salida de éxito ya no dice "`plumbward rollback` lo deja todo como estaba"
cuando el journal no se va a poder revertir; lo dice, y remite a git. Eso era
reparar una mentira que introdujo la propia PR, no diseño.

**Trabajo:** decidir qué hace `apply` con esa combinación, más allá de no
mentir. Dos vías: rechazarla antes de escribir, o aceptarla dejando claro el
coste. Guardar el commit de partida (F0-30) abre una tercera y mejor:
identificar el sitio por commit en vez de por nombre, con lo que el `rollback`
vuelve a ser posible con HEAD desacoplado y la regresión desaparece en lugar de
documentarse.

**Qué se convierte en control mecánico:** un test de la decisión que se tome.
La retirada de la promesa de F0-24 tenía el suyo en `rollback-branch.test.ts`;
esta tarea lo sustituye, porque la decisión vuelve a hacer cierta la promesa.

**Decisión (tercera vía):** `writtenOnBranch === null` se compara como cualquier
otro nombre. El journal escrito con HEAD desacoplado se revierte con HEAD
desacoplado sobre el mismo commit; desde una rama se niega aunque apunte a ese
commit, y el mensaje manda volver con `git checkout --detach <commit>`. Sólo un
journal sin rama **y** sin commit —que `apply` no escribe— se sigue negando.
Descartadas: rechazar la combinación antes de escribir, porque castiga un uso
legítimo (las CI hacen checkout desacoplado) para proteger lo que el commit ya
protege; y aceptarla sin `rollback`, porque deja irreversible lo que antes de
F0-24 se revertía. Escrita en `assertSameBranch` y en `docs/ARCHITECTURE.md`.

**Criterios de aceptación:**
- La decisión está escrita, con la alternativa descartada y el porqué.
- `apply --no-branch` con HEAD desacoplado hace lo que esa decisión diga, y hay
  un test que lo fija.

---

### [x] F0-30 — El journal identifica el sitio por commit, no sólo por nombre
**Branch:** `feat/f0-journal-commit-identity` · **Depends on:** F0-24

**Origen:** hallazgos 3 y 4 de la revisión en contexto nuevo de la PR #11.

**Por qué importa:** F0-24 compara **nombres de rama**, y `revertEntries` escribe
a ciegas en cuanto el nombre coincide. Una rama borrada y recreada con el mismo
nombre sobre otro commit, o trabajo hecho en la rama aislada después del `apply`,
pasan el guardián y pierden datos igual. El nombre dice dónde estás, no si es el
mismo sitio.

**Trabajo:**
1. Guardar en el journal el commit sobre el que se escribió. `readHead` ya lo
   devuelve; hoy se tira.
2. `rollback` lo compara además del nombre, y se niega si el sitio ha cambiado.
3. Guardar también el commit de partida. Hoy, si se empezó con HEAD desacoplado,
   el aviso dice `git checkout <commit>` y deja al usuario rellenar un hueco que
   no puede rellenar: el commit se conoce en `runApply` (`headBefore.commit`) y
   no se guarda.

**Qué se convierte en control mecánico:** un test por punto; el del 2, borrando
y recreando la rama sobre otro commit.

**Criterios de aceptación:**
- `rollback` se niega en una rama del mismo nombre creada sobre otro commit, y
  hay un test que lo reproduce.
- El aviso de vuelta nombra el commit de partida en lugar de `<commit>`.

---

### [ ] F0-31 — Anotar el contrato de `readJournal`
**Branch:** `docs/f0-read-journal-contract` · **Depends on:** F0-24

**Origen:** hallazgo 5 de la revisión en contexto nuevo de la PR #11.

**Trabajo:** `readJournal` se exporta en `packages/core/src/index.ts` y ahora
lanza `OutdatedJournalError` donde antes devolvía el journal. La dirección es la
segura, pero es un cambio de contrato de API pública. Hoy el único consumidor es
`rollbackLastApply`; anotarlo en el JSDoc antes de que haya otro.

**Qué se convierte en control mecánico:** nada por sí mismo. Ningún control
puede ver que un consumidor futuro esperaba el contrato viejo; la defensa es
que esté escrito donde se lee.

---

### [ ] F0-32 — Seguimientos de la revisión de la PR de F0-27
**Branch:** `fix/f0-mutation-control-followups` · **Depends on:** F0-27

**Origen:** revisión en contexto nuevo de la PR de F0-27. Los tres bloqueantes
—constantes con dígito invisibles para el control, veredicto verde sin ejecutar
un test, y el filtro leído del bloque `paths:` equivocado— se corrigieron dentro
de la PR. Estos son los no bloqueantes (§6.4 de `CLAUDE.md`).

Todos comparten una forma: el control de mutaciones mide con parsers propios
—expresiones regulares sobre YAML y sobre JavaScript— y cada hueco del parser
es un verde que no significa nada.

**Trabajo:**
1. **Prioridad alta.** El control prohíbe la salida de emergencia que el propio
   workflow documenta: `mutations.yml` avisa de que, si el job entra en el
   ruleset, hay que quitar el filtro `paths:`; sin filtro, `workflowPaths`
   devuelve `[]` y `check:coherence` se pone en rojo con quince ficheros sin
   cubrir. Un workflow sin filtro corre siempre y es estrictamente más seguro:
   hay que distinguir "no hay filtro" de "el filtro se deja ficheros fuera".
2. Dos mutantes sobreviven a `scripts/mutation-paths.test.mjs`: quitar
   `if (sangria(line) <= indent) break` y cambiar `if (!entrada) break` por
   `continue`. En ambos casos el test pasa porque otro camino corta la lista
   igual. La diferencia entre truncar la lista y saltarse una entrada mal
   formada es perder una ruta o perderlas todas.
3. El `readdirSync` del directorio de workflows cayó dentro del `try` que
   diagnostica fallos de red: si `.github/workflows` no se puede leer, el
   control 4 entero se desactiva imprimiendo "no se han podido listar las ramas
   remotas", que es falso.
4. `mutationInputs` lee `TESTS` con `/const TESTS = \[([\s\S]*?)\]/`: una ruta
   comentada dentro del array cuenta como fichero —exige en el filtro algo que
   ya no se ejecuta, falso rojo— y un `]` dentro de un comentario corta el
   array y pierde las rutas siguientes en silencio —falso verde—.
5. En el filtro del workflow, una entrada con comillas dobles se devuelve con
   las comillas dentro, y un comentario al final de la línea corta la lista
   ahí. Ambos fallan hacia rojo, pero acusan al fichero equivocado.
6. El control 1b (`if: matrix.node`) sigue mirando sólo `ci.yml`, mientras el
   control 4 pasó a recorrer el directorio en F0-27. Un workflow futuro con
   matriz no tendría ese control. Hoy no duele: `mutations.yml` no tiene matriz.

**No mecanizable, y por eso se escribe aquí:** el filtro cubre los ficheros que
se mutan, no todos los que pueden hacer sobrevivir una mutación. Las `TESTS`
importan producción que no está en el filtro —`packages/core/src/`,
`packages/cli/src/apply.ts`—, así que un cambio ahí puede dejar una mutación
viva sin que el job llegue a ejecutarse. Cumple lo que F0-27 pide —"al menos"
esas PRs—, pero el control derivado da una impresión de completitud que no
tiene. Cerrarlo de verdad exige el grafo de importaciones, no una lista.

**Qué se convierte en control mecánico:** los puntos 1 a 6, cada uno con su
test. El párrafo anterior, no: queda escrito donde se lee.

**Criterios de aceptación:**
- Quitar el filtro `paths:` de `mutations.yml` deja `check:coherence` en verde.
- Los dos mutantes del punto 2 mueren: `pnpm check:mutations` no es el control
  de este fichero, así que se comprueban a mano mutando y ejecutando.
- Hay un test por cada uno de los puntos 3 a 6, y falla al revertir su
  corrección.

**Criterios de aceptación:**
- El JSDoc de `readJournal` dice qué lanza y en qué casos.

---

### [ ] F0-33 — El aviso sin ningún commit describe un estado imposible
**Branch:** `fix/f0-unreachable-notice-branch` · **Depends on:** F0-30

**Origen:** hallazgo 3 de la revisión en contexto nuevo de la PR de F0-30.

**Trabajo:** `returnToCommit` tiene una rama para `startedOnCommit === null` que
no se puede alcanzar desde la CLI: `startedOnBranch === null` significa HEAD
desacoplado, y desacoplar exige que exista un commit; en un repositorio sin
commits el escáner devuelve el nombre de la rama no nacida, no `null`. Los dos
sitios de llamada derivan rama y commit de la misma lectura de HEAD, así que el
par `(null, null)` no se produce. Sólo existe en un test que lo construye a
mano. Decidir entre hacerla imposible por tipos o justificar por qué se queda.

**Qué se convierte en control mecánico:** si se retira, su test desaparece con
ella; si se queda, un test que la provoque por el camino real.

**Criterios de aceptación:**
- No queda código vivo que sólo pueda ejecutar un test.

---

### [ ] F0-34 — El e2e revierte con un commit que el repositorio no tiene
**Branch:** `test/f0-e2e-journal-commit` · **Depends on:** F0-30

**Origen:** hallazgo 4 de la revisión en contexto nuevo de la PR de F0-30.

**Trabajo:** el e2e escribe el journal con `writtenOnCommit: null` y revierte con
`currentCommit: null` sobre un repositorio que sí tiene commits: una combinación
que en producción no ocurre. `assertSameCommit` pasa por `null === null` y no
ejercita nada. Es el punto 3 del napkin —datos que hacen la mutación
invisible— en el único test que dice cubrir el ciclo completo.

**Qué se convierte en control mecánico:** pasar el commit real del repositorio
de pruebas y comprobar que mutar la comprobación del commit mata el test.

**Criterios de aceptación:**
- El e2e usa el commit real en `applyPlan` y en `rollbackLastApply`.
- Quitar `assertSameCommit` pone el e2e en rojo.

---

### [ ] F0-35 — Anotar los cambios de contrato del journal v3
**Branch:** `docs/f0-journal-v3-contract` · **Depends on:** F0-30, F0-31

**Origen:** hallazgo 5 de la revisión en contexto nuevo de la PR de F0-30.

**Trabajo:** F0-30 cambió tres veces la superficie pública exportada en
`packages/core/src/index.ts`: `ApplyOptions.writtenOnCommit` y
`RollbackOptions.currentCommit` son campos requeridos nuevos, y `Journal.version`
pasó de 2 a 3, con lo que `readJournal` lanza `OutdatedJournalError` donde antes
devolvía el journal de un v2. F0-31 cubre sólo el JSDoc de `readJournal`.
Anotarlo entero, con la política de versiones del journal.

**Qué se convierte en control mecánico:** nada por sí mismo, igual que en F0-31:
ningún control ve qué esperaba un consumidor externo. La defensa es que esté
escrito donde se lee.

**Criterios de aceptación:**
- El JSDoc de los tipos exportados dice qué campos son nuevos y desde cuándo.

---

### [ ] F0-36 — La mutación del commit nombra otra cosa de la que muta
**Branch:** `fix/f0-mutation-name-collision` · **Depends on:** F0-30

**Origen:** hallazgo 6 de la revisión en contexto nuevo de la PR de F0-30.

**Trabajo:** la entrada `Comparar sólo la rama, no el commit` de
`scripts/check-mutations.mjs` es anterior a F0-30 y muta `headMoved`, no
`assertSameCommit`. Quien lea la lista concluirá que el guardián del journal
está cubierto por la batería, y no lo está: la batería no muta
`packages/core/`. Renombrarla, y decidir si el guardián del journal entra en la
batería —lo que arrastra el filtro `paths:` de `mutations.yml`— o se deja fuera
diciéndolo.

**Qué se convierte en control mecánico:** la propia entrada, si se añade.

**Criterios de aceptación:**
- Ningún nombre de mutación describe una pieza distinta de la que muta.

---

### [ ] F0-37 — Un journal v2 pendiente se queda sin `rollback`
**Branch:** `fix/f0-v2-journal-remedy` · **Depends on:** F0-30

**Origen:** hallazgo 7 de la revisión en contexto nuevo de la PR de F0-30.

**Trabajo:** quien actualice la CLI con un `apply` v2 sin revertir pierde
`plumbward rollback`: `readJournal` lanza `OutdatedJournalError`. La dirección
es la segura y está documentada, pero es una retirada de capacidad que para un
v2 aún era posible por nombre de rama, que es el nivel que F0-24 dio por bueno.
Y el remedio que sugiere el error, `git checkout -- .`, no borra los ficheros
nuevos sin seguimiento que creó el `apply` —defecto anterior, que ahora alcanza
a muchos más casos—. Decidir qué se ofrece a esos journals y arreglar el
remedio.

**Qué se convierte en control mecánico:** un test del remedio que deje el árbol
limpio de verdad, comprobado con `git status --porcelain`.

**Criterios de aceptación:**
- El texto del error lleva a un árbol limpio, ficheros sin seguimiento
  incluidos.
- La decisión sobre los journals v2 está escrita, con la alternativa
  descartada.

---

### [ ] F0-38 — `rollback` no comprueba que los ficheros sigan siendo los que dejó `apply`
**Branch:** `fix/f0-rollback-content-check` · **Depends on:** F0-29

**Origen:** hallazgos 1 y 2 de la revisión en contexto nuevo de la PR #14
(F0-29). Son anteriores a F0-29: pasan igual con journals escritos en una rama.

**El síntoma:** la rama y el commit dicen dónde se escribió, no si el árbol sigue
como lo dejó `apply`. Dos casos verificados con git real:
- Tras `apply`, `git switch -c rescue` y una edición sin commitear. `rollback`
  se niega y manda volver al sitio con `git checkout`; el checkout arrastra la
  edición, y el `rollback` de allí la sobrescribe.
- Tras `apply`, `git switch -c work` y commit de la gobernanza. Al volver al
  sitio, `rollback` imprime "Revertidas N operaciones" y el árbol queda limpio,
  pero la gobernanza sigue en `work`: no ha revertido nada.

**Trabajo:** guardar en el journal un hash de lo que `apply` dejó en cada
fichero y negarse, sin escribir, si el contenido actual no coincide. Decidir
también el orden de las comprobaciones, para que el mensaje hable del motivo
real y no mande a un sitio desde el que `rollback` tampoco es correcto. Cambia
el formato del journal: ver F0-35 y F0-37.

**Qué se convierte en control mecánico:** los dos escenarios anteriores como
tests con git real, comprobando el contenido de los ficheros después.

**Criterios de aceptación:**
- `rollback` no sobrescribe ningún fichero cuyo contenido difiera del que dejó
  `apply`, y en ese caso conserva el journal.
- Seguir el consejo de un mensaje de `rollback` nunca lleva a perder trabajo ni
  a un "Revertidas" que no revierte nada.

---

### [ ] F0-39 — Mensajes de `rollback` sin test y dos consejos de vuelta distintos
**Branch:** `fix/f0-rollback-message-coverage` · **Depends on:** F0-29

**Origen:** hallazgos 4 y 5 de la revisión en contexto nuevo de la PR #14
(F0-29).

**Trabajo:**
- Ningún test fija el texto de `assertSameCommit` para un journal escrito con
  HEAD desacoplado ("HEAD sigue desacoplado…"): intercambiar los dos textos de
  `cause` pasaría la batería.
- `branch-notice.ts` aconseja `git checkout <sha>` y `rollback.ts`,
  `git checkout --detach <sha>`. Hacen lo mismo; elegir una forma.

**Qué se convierte en control mecánico:** un test del mensaje con journal
desacoplado y otro que fije la forma elegida en los dos sitios.

**Criterios de aceptación:**
- Intercambiar los dos textos de `cause` en `assertSameCommit` hace fallar un
  test.
- Los dos mensajes aconsejan volver a un commit con la misma orden.

---

### [x] F0-40 — Una cola de ejecución que decide la siguiente tarea
**Branch:** `chore/f0-execution-queue` · **Depends on:** nothing

**Origen:** decisión del desarrollador del 2026-09-13. Elegir la siguiente tarea
dependía de que cada sesión la propusiera y alguien la confirmase: cada vez un
coste, y dos sesiones podían llegar a respuestas distintas.

**Trabajo:** una cola ordenada de todas las tareas pendientes en el §5, con los
criterios del orden escritos. Quien pregunte por el estado del plan o por la
siguiente tarea obtiene la misma respuesta: la primera de la cola. Cambiar una
prioridad es mover una entrada, con su motivo. `CLAUDE.md` §0 lo dice.

**Qué se convierte en control mecánico:** `scripts/execution-queue.mjs`, conectado
a `check:coherence` y cubierto por `scripts/execution-queue.test.mjs`. Falla si
una tarea pendiente no está en la cola, si una completada sigue, si hay
duplicados o identificadores inexistentes, o si una tarea va antes que una
dependencia pendiente, incluidas las de "Fase N completa".

**No mecanizable:** que el orden sea el mejor. El control garantiza que es
completo y posible, no que sea sensato; eso lo defienden los criterios escritos
en el §5 y la revisión.

**Criterios de aceptación:**
- La primera entrada de la cola es la siguiente tarea, sin que haga falta
  proponerla.
- Crear una tarea sin colocarla, o cerrar una sin sacarla, pone la CI en rojo.

---

### [x] F0-41 — El inglés, idioma principal: el control y las instrucciones del asistente
**Branch:** `chore/f0-english-only-control` · **Depends on:** F0-40

**Origen:** decisión del desarrollador del 2026-09-13. Todo el repositorio pasa a
inglés: instrucciones del asistente, plan, documentación, comentarios, tests y lo
que el producto genera por defecto. Es la convención de la industria, la que
siguen los equipos de nuestros clientes, y ahorra tokens: cada sesión lee
`CLAUDE.md`, el runbook y partes del plan, y el español gasta más tokens para la
misma información. Amplía F0-16 y F0-18, que sólo cubrían nombres y
documentación, y abre F0-42 a F0-45.

**Trabajo:**
1. **Primero el control, para que no entre español nuevo.** Una comprobación en
   `check:coherence` —lógica pura en `scripts/`, con su test— que detecta español
   en los ficheros versionados (comentarios, cadenas, Markdown, YAML), reutilizando
   las palabras inequívocas de `branch-names.mjs` más los caracteres propios del
   español (`ñ`, `¿`, `¡`, vocales con tilde). Con dos listas explícitas:
   - **Pendientes de traducir:** los ficheros que hoy tienen español. Cada tarea
     del bloque saca los suyos. Un fichero fuera de la lista con español falla, y
     uno de la lista que ya no lo tiene también, para que la lista no caduque.
   - **Excepciones permanentes, cada una con su motivo:** lo que debe seguir en
     español, como la variante `es` de lo que se genera para el cliente o el
     corpus de palabras de `branch-names`.
2. Traducir `CLAUDE.md`, `.claude/napkin.md` y `.github/PULL_REQUEST_TEMPLATE.md`,
   y revertir en ellos las reglas que fijan el español para la prosa y los
   comentarios. Son los que se leen en todas las sesiones.

**Qué se convierte en control mecánico:** la comprobación del punto 1.

**No mecanizable:** la fidelidad de la traducción. Un texto en inglés que dice otra
cosa que el original pasa el control; la defensa es la revisión en contexto nuevo
de cada PR de traducción, comparando con el original.

**Criterios de aceptación:**
- Añadir un comentario o un párrafo en español a un fichero que no está en ninguna
  lista pone `check:coherence` en rojo.
- Un fichero de la lista de pendientes que ya está en inglés también lo pone en rojo.
- `CLAUDE.md`, el runbook y la plantilla de PR están en inglés y fijan el inglés
  como idioma de todo el repositorio.

---

### [ ] F0-42 — The execution plan in English
**Branch:** `docs/f0-english-plan` · **Depends on:** F0-16

**Origin:** F0-41. The plan is over 3,000 lines and is, after `CLAUDE.md`, what
is read the most: every task starts by reading its own.

**Work:**
1. Translate the whole plan, including the completed tasks: the language
   changes, not the facts (dates, findings, discarded alternatives).
2. Two controls read its format: the branch and dependency lines of every task,
   the whole-phase dependency, the `### [ ]` headers and the queue markers. The
   plan, `branch-names.mjs`, `execution-queue.mjs` and their tests change in the
   same commit; the minimum assertions of both prevent a green without looking
   at anything.
3. Remove the plan from the F0-41 pending list.
4. Because of its size, over several sessions: one batch per part of the plan,
   each with its own commit on the same branch and `pnpm check:coherence` green.
   It is still one task and one PR.

**Progress:**
- [x] Batch 1: the format read by the two controls, across the whole plan
  (`**Branch:**`, `**Depends on:**`, `**Blocks:**`, `Phase N complete`,
  `<!-- queue:start -->`); header, §1 to §4, this task, and §5 to §7.
- [x] Batch 2: Phase 0, first half (F0-1 to F0-20).
- [ ] Batch 3: Phase 0, second half (F0-21 to F0-46).
- [ ] Batch 4: Phases 1 to 6, and the plan out of the pending list.

**What becomes a mechanical control:** the F0-41 one over the plan, and the
tests of the two parsers with the new format. The queue control also fails
when a task has no dependency line it recognises: before, a marker the parser
did not know read as "no dependencies", and a broken order passed.

**Acceptance criteria:**
- The plan contains no Spanish outside the declared exceptions.
- Breaking a dependency in the translated queue, or a branch name, turns CI red.

---

### [ ] F0-43 — Comentarios y tests del núcleo en inglés
**Branch:** `refactor/f0-english-comments-core` · **Depends on:** F0-16

**Origen:** F0-41. Separada de F0-44 para que cada PR se pueda revisar entera.

**Trabajo:** traducir comentarios, JSDoc y descripciones de `describe` e `it` en
`packages/core`, `packages/ast`, `packages/scanner` y `packages/packs-sdk`. Los
textos que llegan al usuario, aunque se lancen desde el núcleo (`RollbackError`),
son de F0-45. Sacar los ficheros de la lista de pendientes de F0-41.

**Qué se convierte en control mecánico:** el de F0-41 sobre estos paquetes.

**Criterios de aceptación:**
- Ningún fichero de esos paquetes contiene español fuera de las excepciones
  declaradas y de los textos que quedan para F0-45.
- Sin cambios de comportamiento: `pnpm typecheck` y sus tests siguen en verde.

---

### [ ] F0-44 — Comentarios y tests de la CLI, los packs y los scripts en inglés
**Branch:** `refactor/f0-english-comments-cli` · **Depends on:** F0-16

**Origen:** F0-41. La otra mitad de F0-43.

**Trabajo:** traducir comentarios, JSDoc y descripciones de tests en
`packages/cli`, `packages/packs/`, `scripts/`, `.github/workflows/` y la
configuración de la raíz. El contenido que se genera para el cliente es de F0-45.
Sacar los ficheros de la lista de pendientes de F0-41.

**Qué se convierte en control mecánico:** el de F0-41 sobre estos ficheros.

**Criterios de aceptación:**
- Ningún fichero de esas rutas contiene español fuera de las excepciones declaradas
  y de los textos que quedan para F0-45.
- Sin cambios de comportamiento: `pnpm typecheck`, sus tests y `check:mutations`
  siguen en verde.

---

### [ ] F0-45 — El producto habla inglés por defecto
**Branch:** `feat/f0-english-default-language` · **Depends on:** F0-41

**Origen:** F0-41. Los clientes siguen por defecto la misma convención. El producto
sigue siendo bilingüe —decisión de negocio del 2026-09-08—: el español se elige
en el perfil, no se retira. El wizard (F4-1) pregunta el idioma a la empresa.

**Trabajo:**
1. Mensajes de la CLI y errores que llegan al usuario (`RollbackError`, avisos de
   rama, `doctor`...) en inglés. La CLI queda sólo en inglés hasta que F1-3 la
   haga bilingüe.
2. `Profile.language` por defecto `en` —hoy `es` en
   `packages/packs-sdk/src/contract.ts`—, y con él los ficheros que genera el pack
   de Node.
3. Lo que hoy sólo existe en español para el cliente se escribe en inglés, y la
   variante española se conserva detrás de `language: es`. Llevarlo a catálogos
   es F1-2.
4. Actualizar los tests que comparan textos y registrar la variante `es` como
   excepción del control de F0-41.
5. The job ids of the workflows the Node pack generates (`calidad`, `secretos`,
   `gobernanza` in `packages/packs/node-ts/src/templates/ci.ts`) go to English,
   in both languages: they are identifiers, not text. Keep the check names that
   `workflow-checks.ts` derives from those workflows in step. Found in the
   review of F0-16: with no accent and no listed word, the Spanish-text test
   below does not see them.

**Qué se convierte en control mecánico:** un test que genera con el perfil por
defecto y falla si aparece español, y otro que con `language: es` sigue generando
español. Plus a test that fails if a job id of a generated workflow looks
Spanish, with the same heuristic as the file-name control of F0-16.

**Criterios de aceptación:**
- Sin configurar idioma, la CLI y los ficheros generados están en inglés.
- Con `language: es`, lo generado para el cliente sigue en español.
- The job ids of the generated workflows are in English with either language.

---

### [ ] F0-46 — Harden the name and link controls
**Branch:** `fix/f0-harden-name-link-controls` · **Depends on:** F0-16

**Origin:** fresh-context review of F0-16, 2026-09-13. No finding was a
blocker, but both controls F0-16 added have cases where they pass without
looking or flag a valid English name.

**Work:**
1. `scripts/doc-links.mjs`:
   - A code fence still open at the end of a file fails, instead of hiding
     every link after it.
   - Read reference-style definitions (`[r]: path`), nested brackets in the
     link text and `<targets with spaces>`.
   - Do not read `//host/path` as a repository path, and accept balanced
     parentheses in a target (`docs/foo_(bar).md`).
   - Skip indented code blocks and HTML comments, like fenced code.
2. `scripts/english-only.mjs`, name check:
   - A file extension or locale segment is not a slug word:
     `messages.de.json` must pass before the catalogues of F1-1 arrive.
   - A one- or two-letter function word between English words
     (`x-y-offset.ts`, `data-y-axis.ts`) does not flag a file name. The
     branch-name corpus keeps its own rule.
   - Suffix collisions (`suspicion.md`, `libido`) become corpus negatives and
     are decided there.
3. `scripts/check-coherence.mjs`: the name check covers every tracked path,
   symlinks included, not only regular files.
4. Decide what happens in a repository already applied with the old
   `GOBERNANZA.md`, and record it here. If it needs a migration, that is a
   Phase 4 task.

**Mechanical control:** each case above is a test in `doc-links.test.mjs` or
`english-only.test.mjs` that fails against the F0-16 code.

**Acceptance criteria:**
- An unclosed code fence and a broken reference-style link make
  `check:coherence` fail.
- `messages.de.json`, `src/x-y-offset.ts` and `src/data-y-axis.ts` pass the
  name check; the ten names F0-16 renamed still fail.
- A Spanish-named symlink fails.
- `//example.com/a.md` and an existing `docs/foo_(bar).md` are not reported.

---

### [ ] F0-47 — Hand over the next-session prompt without being asked
**Branch:** `docs/f0-session-handoff-prompt` · **Depends on:** F0-42

**Origin:** batch 2 of F0-42, 2026-09-13. §6 of `CLAUDE.md` asks for one
session per task, and F0-42 runs one session per batch, but the assistant only
wrote the prompt for the next session when the developer asked for it: one
extra round trip each time. The two alternatives cost more:
- The assistant opening the new context itself, with a subagent, boots just as
  cold. On top of that, the open chat is resent on every later turn, and the
  developer cannot talk to the subagent directly.
- Running every batch in the same chat, one commit per batch: each step resends
  the whole conversation, which grows with every batch read and written.

**Work:**
1. §6 of `CLAUDE.md`: when a task, a batch or a review round closes and the
   next work belongs in a new session, the assistant ends its reply with the
   prompt to open it, ready to paste, without being asked. The prompt carries
   only what the repository does not: conventions fixed in the chat and
   decisions still open.
2. State in the same rule that the developer opens the new chat, not a
   subagent, and why.

**Not mechanisable:** no control sees an assistant's reply. The defence is the
rule in §6 and the fresh-context review.

**Acceptance criteria:**
- §6 of `CLAUDE.md` states the rule and its reason in at most ten lines.
- A batch closed in a new session ends with the next-session prompt, without
  the developer asking for it.

---

## FASE 1 — Internacionalización del motor de plantillas

**Objetivo:** que `Profile.language` funcione de verdad.
**Estimación:** 1-2 sesiones.
**Por qué ahora y no después:** hoy hay **un** pack que traducir. Después de la
Fase 2 habrá cinco. El coste de este refactor se multiplica por cinco si se
pospone, y es exactamente el tipo de deuda que el producto dice combatir.
**Criterio de salida:** `language: en` en el config produce un repositorio
íntegramente en inglés, con la misma estructura de ficheros que `language: es`.

---

### [ ] F1-1 — Paquete `@plumbward/i18n`
**Branch:** `feat/f1-i18n-package` · **Depends on:** Phase 0 complete

**Trabajo:**
1. Paquete nuevo con un catálogo tipado: las claves de `en` derivan del tipo del
   catálogo `es`, de modo que **falte una traducción es un error de compilación**.
2. API mínima: `translator(language)` devuelve una función `t(clave, valores)`
   con interpolación tipada.
3. Soporte para bloques de texto largo (las cabeceras de comentarios de los
   ficheros generados), no sólo cadenas cortas.
4. Decidir y documentar la convención de claves: `pack.nodeTs.eslint.cabecera`.

**Criterios de aceptación:**
- Añadir una clave a `es` sin añadirla a `en` rompe `pnpm typecheck`.
- El paquete no depende de ningún otro paquete del monorepo (es una hoja).

---

### [ ] F1-2 — Migrar el pack de Node/TS a los catálogos
**Branch:** `refactor/f1-node-ts-i18n` · **Depends on:** F1-1

**Trabajo:**
1. Extraer todo el texto en español de `packages/packs/node-ts/src/templates/*`
   (CI, reglas de IA, tooling, docs) al catálogo.
2. Traducir al inglés.
3. Traducir también los `reason` de cada operación: son lo que el usuario lee en
   `plumbward plan`, la pantalla más importante del producto.

**Criterios de aceptación:**
- Ni un literal en español fuera del catálogo (regla de lint que lo verifique si
  es viable; si no, revisión manual documentada).
- Los ficheros generados en inglés son idiomáticos, no traducción literal.

---

### [ ] F1-3 — Mensajes de la CLI en ambos idiomas
**Branch:** `refactor/f1-cli-i18n` · **Depends on:** F1-1

**Trabajo:**
1. Migrar [render.ts](../packages/cli/src/render.ts) y
   [commands.ts](../packages/cli/src/commands.ts) al catálogo.
2. Resolución del idioma, por orden de precedencia:
   `--lang` → `.governance/config.yml` → `$LANG` del sistema → `es`.
3. `plumbward scan` debe poder elegir idioma **antes** de que exista config.

**Criterios de aceptación:**
- `plumbward scan --lang en` en un repo sin configurar sale íntegro en inglés.

---

### [ ] F1-4 — Test de paridad entre idiomas
**Branch:** `test/f1-language-parity` · **Depends on:** F1-2, F1-3

**Por qué:** el riesgo real de la i18n no es traducir mal, es que el plan
**haga cosas distintas** según el idioma. Eso rompería el determinismo.

**Trabajo:**
1. Test que genera el plan con `es` y con `en` sobre el mismo repo de prueba y
   compara: mismo número de operaciones, mismas rutas, mismo orden, mismos
   comandos. Sólo puede diferir el contenido textual.
2. Test que verifica que ninguna traducción quedó vacía o igual a su clave.

**Criterios de aceptación:**
- Si alguien añade una operación condicionada por idioma, el test falla.

---
### [ ] F1-5 — Procedencia: cada regla cita su fuente
**Branch:** `feat/f1-rule-provenance` · **Depends on:** F1-1

**Por qué en esta fase:** es la misma lección que la i18n. Hoy hay un pack;
después de la Fase 2 habrá cinco, y añadir un campo obligatorio al contrato con
cinco packs escritos cuesta cinco veces más.

**Por qué importa comercialmente:** desactiva la objeción *"¿por qué debería
fiarme de vuestros estándares?"*. La respuesta pasa a ser: **ninguna regla es
opinión nuestra, cada una cita la documentación oficial y la versión en que se
apoya**. Y le da al asistente de IA una fuente verificable en lugar de una
afirmación, que es la diferencia entre que aplique la regla y que se la invente.

**Trabajo:**
1. Añadir al contrato de `packs-sdk` una estructura de procedencia: URL de la
   documentación oficial, versión de la herramienta y fecha de comprobación.
2. Hacerla obligatoria para las reglas de seguridad y de estilo generadas;
   opcional donde sea una convención propia, y en ese caso **decirlo
   explícitamente** en el fichero generado.
3. La suite de conformidad rechaza una regla de seguridad sin procedencia.
4. `doctor` avisa cuando una fuente lleva más de un año sin revisarse.

**Criterios de aceptación:**
- Los ficheros de reglas generados citan su fuente junto a cada regla.
- Un pack con una regla de seguridad sin procedencia no pasa la conformidad.

---

## FASE 2 — Cobertura de stacks

**Objetivo:** que la herramienta **nunca** se quede sin hacer nada, sea cual sea
el repositorio.
**Estimación:** 4-6 sesiones. Es la fase más larga y la de mayor retorno comercial.
**Por qué importa:** hoy, un repo que no sea Node recibe un conflicto bloqueante
y cero valor. Eso es una demo fallida delante de un cliente. Con esta fase, el
mercado direccionable pasa de "agencias JavaScript" a "cualquier equipo".
**Criterio de salida:** `plumbward apply` produce valor real en repos de Node,
Python, PHP/Laravel, Go y en uno de un stack no soportado.

---

### [ ] F2-1 — Detección multi-stack en el escáner
**Branch:** `feat/f2-scanner-multistack` · **Depends on:** Phase 1 complete

**Estado actual:** [stack.ts](../packages/scanner/src/stack.ts) sólo reconoce
`node-ts` y `go`.

**Trabajo:**
1. Añadir detectores, cada uno con su evidencia y su nivel de confianza:
   - **Python** — `pyproject.toml` (y dentro: Poetry / uv / PDM / setuptools),
     `requirements.txt`, `Pipfile`. Frameworks: FastAPI, Django, Flask.
   - **PHP** — `composer.json`. Frameworks: Laravel (`artisan`), Symfony.
   - **Java/Kotlin** — `pom.xml`, `build.gradle(.kts)`. Spring Boot.
   - **.NET** — `*.csproj`, `*.sln`.
   - **Ruby** — `Gemfile`. Rails.
   - **Rust** — `Cargo.toml`.
2. Un repo puede devolver **varios** stacks: el políglota es la norma, no la
   excepción (un backend Django con un frontend Next.js).
3. Extender `LanguageStat` y el conteo de SLOC a las extensiones nuevas.
4. Extender el informe de madurez con señales por lenguaje (`ruff`/`phpstan`/
   `golangci-lint` ya están contemplados en
   [maturity.ts](../packages/scanner/src/maturity.ts); revisar Java y .NET).

**Criterios de aceptación:**
- Tests con `package.json` de ejemplo por cada gestor y framework listado.
- Un repo Django + Next.js devuelve dos stacks, ordenados por SLOC real.
- El escáner sigue sin escribir nada en disco (invariante).

---

### [ ] F2-2 — Pack universal de respaldo
**Branch:** `feat/f2-pack-base` · **Depends on:** F2-1

**Por qué es la tarea más rentable de la fase:** cubre de golpe *todos* los
stacks que no tengan pack propio, y da valor inmediato en cualquier repositorio
del mundo. Es lo que convierte un "no soportado" en una venta.

**Trabajo:**
1. Pack `base` que **siempre** aplica, con confianza baja (0.1) para que nunca
   sea el pack principal.
2. Aporta lo que es independiente del lenguaje:
   - Escaneo de secretos con Gitleaks (config + workflow).
   - `.editorconfig`, `.gitattributes`.
   - `CODEOWNERS`, `SECURITY.md`, plantillas de PR e issues.
   - `.env.example` derivado de las variables que el escáner encuentre en el código.
   - Reglas de contexto de IA genéricas (`AGENTS.md`) construidas a partir del
     escaneo: stacks detectados, estructura, comandos.
   - Actualización de dependencias (Dependabot/Renovate) según los ecosistemas
     detectados.
3. Eliminar de [registry.ts](../packages/packs-sdk/src/registry.ts) el conflicto
   bloqueante "no se ha reconocido ningún stack": deja de poder ocurrir.

**Criterios de aceptación:**
- `plumbward apply` sobre un repo de un lenguaje sin pack (p. ej. Elixir)
  instala escaneo de secretos, CODEOWNERS y reglas de IA, y no falla.
- El pack `base` nunca duplica lo que ya aporta un pack específico (lo verifica
  el `PlanBuilder`, que debe reportar conflicto si ocurre).

---

### [ ] F2-3 — Kit de pruebas de conformidad reutilizable
**Branch:** `test/f2-conformance-kit` · **Depends on:** F2-2

**Por qué antes de escribir cuatro packs:** sin esto, cada pack se testea de una
forma distinta y la calidad diverge. Y cuando abramos el catálogo a terceros
(el eje de escalado del negocio), esta suite es lo único que impide que un pack
mal escrito destroce el repositorio de un cliente.

**Trabajo:**
1. Paquete `@plumbward/pack-testkit`.
2. `describePackConformance(pack, escenarios)`: batería estándar que ejecuta
   `checkPackConformance` sobre varios repos sintéticos y comprueba además:
   - **Idempotencia**: aplicar dos veces no produce cambios la segunda.
   - **Reversibilidad**: `apply` + `rollback` deja el repo byte a byte idéntico.
   - **No destructividad**: nunca pisa un fichero preexistente del cliente sin
     declararlo como conflicto.
   - **Respeto del modo**: en `non-disruptive` no toca ficheros de código fuente.
   - **Paridad de idioma**: genera en `es` y en `en` con la misma estructura.
3. Utilidades para construir repos de prueba en memoria/tmp.
4. Migrar los tests existentes de `node-ts` al kit.

**Criterios de aceptación:**
- Un pack nuevo se valida con menos de 20 líneas de test.
- Introducir a propósito un fallo (p. ej. sobrescribir un fichero del cliente)
  hace fallar el kit.

---

### [ ] F2-4 — Pack de Python
**Branch:** `feat/f2-pack-python` · **Depends on:** F2-3

**Trabajo:**
1. Detección del gestor: uv → Poetry → PDM → pip, y respeto del que ya use el repo.
2. Aporta: `ruff` (lint + formato), `mypy` (estricto o gradual según
   `strictness`), `pytest` con cobertura, `pre-commit`, `bandit` o `pip-audit`
   para seguridad, workflows de CI con matriz de versiones de Python.
3. Reglas de IA específicas: tipado, gestión de entornos virtuales, estructura
   de proyecto, y el patrón del framework detectado (FastAPI vs Django).
4. Parcheo no destructivo de `pyproject.toml` — requiere **soporte TOML en
   `@plumbward/ast`**, que hoy sólo tiene JSON y YAML. Es la parte cara de esta
   tarea: presupuestarla aparte y usar un parser que preserve comentarios.

**Criterios de aceptación:**
- Pasa el kit de conformidad en repos con Poetry, con uv y con `requirements.txt`.
- Un `pyproject.toml` con comentarios y formato propio conserva ambos tras el parcheo.

---

### [ ] F2-5 — Pack de PHP / Laravel
**Branch:** `feat/f2-pack-php-laravel` · **Depends on:** F2-3

**Por qué tiene prioridad alta pese a no ser el stack de moda:** es el stack
dominante en el segmento de **agencias de desarrollo españolas**, que es
justamente el comprador del paquete de 4.000 €.

**Trabajo:**
1. Detección de Laravel (`artisan`, `composer.json`) frente a Symfony frente a PHP puro.
2. Aporta: PHPStan o Psalm con nivel según `strictness`, Laravel Pint o
   PHP-CS-Fixer, PHPUnit o Pest, `composer audit`, workflows con matriz de PHP.
3. Parcheo no destructivo de `composer.json` (es JSON: reutiliza `@plumbward/ast`).
4. Reglas de IA específicas de Laravel: dónde va la lógica de negocio, uso de
   Eloquent, form requests, evitar consultas N+1 — los errores exactos que
   comete un asistente de IA en Laravel.

**Criterios de aceptación:**
- Pasa el kit sobre un esqueleto de Laravel real.
- Los scripts de Composer se añaden sin pisar los que ya tuviera el proyecto.

---

### [ ] F2-6 — Pack de Go
**Branch:** `feat/f2-pack-go` · **Depends on:** F2-3

**Trabajo:**
1. El escáner ya detecta Go; falta el pack.
2. Aporta: `golangci-lint` con conjunto de linters razonado, `gofumpt`,
   `go vet`, `govulncheck`, `go test -race -cover`, workflows con matriz.
3. Reglas de IA: manejo de errores idiomático, contextos, interfaces pequeñas.
4. Ojo: Go no tiene "dependencias de desarrollo". Verificar que
   `AddDependencyOp` con `manager: 'go'` se traduce a algo sensato en
   [apply.ts](../packages/core/src/apply.ts) (`go install` de herramientas, o
   un `tools.go`). Si no encaja, es una corrección del núcleo, no del pack.

**Criterios de aceptación:**
- Pasa el kit sobre un módulo Go y sobre un monorepo con varios `go.mod`.

---

### [ ] F2-7 — Composición de packs en monorepos
**Branch:** `feat/f2-monorepo` · **Depends on:** F2-4, F2-5, F2-6

**Por qué:** el escáner ya detecta monorepos y los fuerza a `non-disruptive`,
pero los packs siguen razonando sobre la raíz. En un monorepo con `apps/api`
en Python y `apps/web` en Next.js, hoy se genera una configuración incoherente.
Y los monorepos son, por tamaño, los clientes de ticket más alto.

**Trabajo:**
1. Extender `RepoContext` con los **workspaces** detectados (pnpm/yarn/turbo/
   nx/lerna/Cargo/Go), cada uno con su ruta y sus stacks.
2. Permitir que un pack contribuya operaciones **con prefijo de ruta** por
   workspace, sin que los packs tengan que saber de monorepos.
3. CI que sólo ejecuta los jobs de los workspaces afectados por el diff.
4. Estrategia clara para la raíz: config compartida arriba, específica abajo.

**Criterios de aceptación:**
- Un monorepo Python + Next.js recibe dos configuraciones coherentes y una CI
  que sólo corre lo que cambia.
- Los packs de F2-4 a F2-6 funcionan sin modificarlos.

---

### [ ] F2-8 — Guía para autores de packs
**Branch:** `docs/f2-pack-authoring-guide` · **Depends on:** F2-7

**Por qué:** es la palanca de escalado del negocio. Si un cliente enterprise
puede escribir su propio pack con sus estándares internos, deja de comprar una
herramienta y empieza a construir sobre una plataforma. Eso cambia el precio y
la permanencia.

**Trabajo:**
1. `docs/AUTORAR_PACKS.md`: contrato, DSL, ejemplos, errores frecuentes.
2. Plantilla ejecutable: `packages/packs/_template/`.
3. Documentar las garantías que el kit de conformidad verifica y por qué.

**Criterios de aceptación:**
- Alguien externo al proyecto escribe un pack mínimo siguiendo sólo la guía.

---
### [ ] F2-12 — Instalar las herramientas de agente que cada stack necesita
**Branch:** `feat/f2-agent-skills` · **Depends on:** F2-2

**Por qué:** hoy generamos ficheros de reglas. Pero un equipo que trabaja con
Claude Code, Cursor o Copilot necesita más que un `.cursorrules`: necesita las
*skills* y la configuración de agente adecuadas a su stack. **Nadie está
empaquetando esto**, y es de lo más diferenciador que podemos ofrecer.

**Trabajo:**
1. Detectar qué asistentes usa el equipo (ya está en `Profile.aiAssistants`) y
   qué herramientas de agente admite cada uno.
2. Instalar, según el stack detectado:
   - Skills de Claude Code en el directorio que corresponda.
   - Reglas de Cursor en `.cursor/rules/`, troceadas por dominio en lugar de un
     único fichero monolítico.
   - `AGENTS.md` genérico para el resto de asistentes.
   - Configuración de servidores MCP que tengan sentido para ese stack, **sin
     instalar ninguno automáticamente**: se proponen y decide el equipo.
3. Que todo lo generado pase por el mismo mecanismo de bloques gestionados, para
   que `upgrade` pueda actualizarlo sin pisar lo que el equipo añada.
4. **Proponer herramientas de agente de terceros** (origen: F0-17, donde las
   usamos nosotros): napkin como runbook del repositorio y la parte local de
   caveman para comprimir las respuestas. Se proponen, nunca se instalan sin
   confirmación (ADR 0005), con versión y hash fijados en un lock y el enlace
   que cada asistente necesita para cargarlas.
5. **No recomendar ningún gateway en la nube** que enrute las peticiones del
   asistente por un tercero, como `caveman-setup`: contradice la postura
   local-first y sin telemetría (ADR 0002) y es un problema de cumplimiento para
   el cliente.
6. Una skill o plugin de terceros ejecuta con acceso al repositorio del cliente:
   revisar sus hooks y scripts antes de incluirla en el catálogo.
7. Portar a `doctor` los controles de F0-17: hash de cada skill contra su lock,
   enlace presente, y runbook dentro de sus reglas de curación.

**Criterios de aceptación:**
- Un repositorio de Node/TS recibe skills y reglas coherentes entre los tres
  asistentes, sin instrucciones contradictorias entre ficheros.
- Nada se conecta a un servicio externo sin confirmación explícita.
- Una skill alterada respecto a su lock hace fallar `doctor`.

---

### [ ] F2-13 — Snapshots dorados de lo que genera cada pack
**Branch:** `test/f2-pack-snapshots` · **Depends on:** F2-3, F0-12

**Por qué:** un pack produce ficheros que acaban dentro del repositorio del
cliente. Hoy nada impide que un refactor cambie un marcador, un identificador de
bloque o el nombre de un script generado **sin que ningún test se entere** —
exactamente lo que pasó en F0-8 con el identificador del bloque de `.gitignore`.

**Trabajo:**
1. Extender el kit de conformidad con snapshots de la salida completa de cada
   pack sobre repositorios sintéticos representativos.
2. Marcar explícitamente qué partes de esa salida son **tokens persistidos** —
   los que se escriben en ficheros del cliente y no pueden cambiar sin
   migración— y hacer que su cambio falle con un mensaje que lo explique, en
   lugar de simplemente actualizar el snapshot.
3. Cubrir también el diff entre versiones: qué cambiaría un `upgrade`.

**Criterios de aceptación:**
- Cambiar un marcador o un identificador de bloque falla con un mensaje que
  nombra la migración que haría falta.
- Actualizar un snapshot exige una acción consciente, nunca un `--update` a
  ciegas en la CI.

---

### [ ] F2-11 — Frontera real para packs de terceros
**Branch:** `feat/f2-pack-isolation` · **Depends on:** F2-8

**Origen:** revisión de F0-5.

**Por qué importa:** la documentación afirmaba que un pack "no tiene acceso al
sistema de ficheros". Es falso: un pack es un objeto cargado en el mismo proceso
de Node y puede importar `node:fs` y escribir donde quiera. `checkPackConformance`
sólo inspecciona las **operaciones devueltas**; no puede observar efectos
secundarios.

Mientras el CLI sólo cargue packs incluidos en su propio paquete, el riesgo es
teórico. En el momento en que se abra el catálogo —que es la palanca de escalado
del negocio (F2-8)— instalar un pack pasa a ser ejecutar código arbitrario en la
máquina del cliente. Esta tarea es **bloqueante para aceptar packs externos**.

**Trabajo:**
1. Decidir el mecanismo: ejecutar los packs en un `worker_thread` con permisos
   recortados, en un proceso hijo con el modelo de permisos de Node
   (`--experimental-permission`), o firmar y auditar los packs del catálogo.
   Escribir una ADR con la elección.
2. Implementarlo y añadir al kit de conformidad una prueba que detecte un pack
   que intente escribir directamente.
3. Hasta entonces, dejar explícito en la documentación y en la salida del CLI
   que sólo se cargan packs de confianza.

**Criterios de aceptación:**
- Un pack que intenta escribir por su cuenta es detectado o impedido.
- La ADR justifica el mecanismo elegido y lo que deja fuera.

---

### [ ] F2-9 — Llevar los límites operativos del asistente al pack base
**Branch:** `refactor/f2-boundaries-to-base-pack` · **Depends on:** F2-2

**Estado:** implementado **sólo** en el pack de Node/TypeScript (sección 7 de las
reglas generadas, más las instrucciones de Copilot), con el contrato
`AgentBoundaries` ya en el `Profile`. Falta generalizarlo.

**Por qué el pack base es su sitio:** que un asistente no ejecute `git push` ni
una migración no tiene nada que ver con el lenguaje del proyecto. Dejarlo en
`node-ts` significa que un cliente de Laravel o Django no lo recibe, que es
justo donde una migración mal lanzada hace más daño.

**Trabajo:**
1. Mover `boundariesSection` del pack de Node al pack base.
2. Publicarla en todos los ficheros de contexto de IA que genere el pack base
   (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`), sin
   duplicarla en los packs de stack.
3. Ampliar la lista de comandos prohibidos con los propios de cada ecosistema
   detectado: `php artisan migrate`, `python manage.py migrate`, `alembic
   upgrade`, `prisma migrate deploy`, `rails db:migrate`, `goose up`.
4. Traducir la sección a los catálogos i18n de la Fase 1.
5. Comprobación de salud en `doctor`: avisar si los ficheros de reglas de IA se
   han editado a mano y han perdido la sección.
6. **Protocolo de conservación de tokens** (origen: F0-17), en la misma sección y
   en todos los ficheros de reglas de IA: una tarea por sesión, lo pesado a la
   CI, lecturas dirigidas con `grep` y rangos de líneas, y en una PR abierta
   sólo bloqueantes. Es independiente del stack y del asistente: se escribe una
   vez en la configuración central y se traduce a `CLAUDE.md`, `AGENTS.md`,
   `.cursorrules` y `.github/copilot-instructions.md`.

**Criterios de aceptación:**
- Un repositorio de cualquier stack recibe los límites, con los comandos de
  migración propios de su ecosistema nombrados explícitamente.
- Desactivar `agentBoundaries.git` en el perfil los elimina de todos los
  ficheros generados a la vez, y la numeración de secciones sigue siendo válida.
- La sección aparece igual en español y en inglés.
- El protocolo de conservación de tokens aparece en todos los ficheros de
  reglas de IA generados, con el mismo contenido.

---

## FASE 3 — Gobernanza real: modos de aplicación y flujo de trabajo

**Objetivo:** que la herramienta sirva en repositorios grandes y con legado, no
sólo en proyectos nuevos.
**Estimación:** 3-4 sesiones.
**Por qué importa:** un repo de 200.000 líneas es donde más duele el problema
que vendemos y donde está el ticket alto — y es justo donde una herramienta que
active reglas estrictas de golpe genera 4.000 errores y se desinstala en diez
minutos. Los modos `ratchet` y `non-disruptive` ya se **calculan** en
[sloc.ts](../packages/scanner/src/sloc.ts) pero hoy **no cambian nada**.
**Criterio de salida:** aplicar la herramienta a un repo grande y desordenado
deja la CI en verde desde el primer día, y aun así impide que empeore.

---

### [ ] F3-1 — Baseline: fotografía de la deuda existente
**Branch:** `feat/f3-baseline` · **Depends on:** Phase 2 complete

**Trabajo:**
1. Generar `.governance/baseline.json` (la constante `BASELINE_FILE` ya existe
   en [types.ts](../packages/core/src/types.ts), sin implementación detrás).
2. Contenido: por fichero y por regla, el número de infracciones **aceptadas**
   en el momento de instalar, más metadatos (fecha, versión, comando que lo generó).
3. Comando `plumbward baseline --update`, que exige que el árbol esté limpio
   y explica en la salida qué se está aceptando y qué implica.
4. El baseline es **legible y revisable en una PR**: nada de blobs binarios.

**Criterios de aceptación:**
- Regenerar el baseline sobre un repo sin cambios produce un fichero idéntico
  (determinismo).
- El fichero explica en su cabecera, en el idioma configurado, qué es y cómo se
  reduce.

---

### [ ] F3-2 — Modo trinquete: reglas estrictas sólo sobre lo que cambia
**Branch:** `feat/f3-ratchet-staged` · **Depends on:** F3-1

**Trabajo:**
1. En modo `ratchet`, los hooks aplican las reglas estrictas **sólo a los
   ficheros en staged**, y las reglas suaves al resto.
2. En modo `non-disruptive`, los hooks sólo avisan; nada bloquea.
3. Configuración generada de forma que el desarrollador entienda por qué su
   fichero se valida distinto que el de al lado (comentarios explicativos).

**Criterios de aceptación:**
- En un repo con 500 errores preexistentes, un commit de un fichero limpio pasa.
- Un commit que toca un fichero con deuda exige arreglar **sólo las líneas que toca**.

---

### [ ] F3-3 — CI que audita únicamente el diff de la Pull Request
**Branch:** `feat/f3-diff-only-ci` · **Depends on:** F3-2

**Por qué:** es la promesa comercial literal del producto — "reducción del 40%
en tiempos de revisión de PRs" — y hoy no está implementada.

**Trabajo:**
1. Workflows que calculan los ficheros cambiados frente a la rama base y
   ejecutan linter, tipos y escaneo de secretos sólo sobre ellos.
2. Comentario automático en la PR con el resumen: qué se validó, qué mejoró y
   qué empeoró respecto al baseline.
3. Cubrir el caso del PR grande y el de la rama desactualizada.

**Criterios de aceptación:**
- Una PR de 3 ficheros en un repo de 200.000 líneas se valida en menos de un minuto.
- El comentario es útil para un revisor humano, no ruido.

---

### [ ] F3-4 — El trinquete: prohibido empeorar
**Branch:** `feat/f3-ratchet-metrics` · **Depends on:** F3-3

**Por qué:** es la diferencia entre "instalamos linters" y "gobernanza". Y es lo
que hace que la licencia se renueve: el valor se acumula mes a mes de forma medible.

**Trabajo:**
1. La CI compara las métricas de la PR contra el baseline y **falla si la deuda
   sube**, aunque los valores absolutos sigan siendo altos.
2. Cuando una PR reduce la deuda, el baseline se actualiza automáticamente a la
   baja: el trinquete nunca retrocede.
3. `plumbward report` muestra la evolución de la puntuación de madurez y de la
   deuda en el tiempo.

**Criterios de aceptación:**
- Una PR que añade un `any` nuevo falla, aunque el repo tenga 3.000.
- Una PR que elimina 10 infracciones baja el baseline en el mismo merge.

---

### [ ] F3-5 — Gobierno del flujo de ramas (feature de producto)
**Branch:** `feat/f3-branch-governance` · **Depends on:** F2-2

**Por qué:** es la pregunta 1 del wizard en el PDF y hoy no existe nada.
Nosotros estamos usando este flujo internamente (§3): esta tarea convierte esa
práctica en producto.

**Trabajo:**
1. El pack `base` genera y documenta la estrategia de ramas elegida en el perfil,
   **con los nombres de rama del perfil** —configurados, o propuestos y
   confirmados, nunca supuestos:
   `Prod`, `main`, `trunk` o lo que use el equipo (ver F0-14).
2. Convención de nombres de rama en el idioma del historial
   (`agentBoundaries.commitLanguage`, inglés por defecto), con formato
   `<tipo>/<descripción>`, y **un control que la verifique en CI** leyendo la
   rama desde `GITHUB_HEAD_REF` —nunca interpolándola en un `run:`, porque el
   nombre de rama lo controla quien abre la PR—. Las reglas de IA generadas ya lo
   piden desde el 2026-09-11; falta el control en el repo del cliente.
2. Genera las **reglas de protección de rama** como fichero declarativo
   (ruleset de GitHub) más las instrucciones para aplicarlas. Aplicarlas
   automáticamente requiere token de administración: se ofrece, **nunca se
   asume**, y sólo con confirmación explícita.
3. Genera plantillas de PR e issues, y `CODEOWNERS` a partir de los autores
   reales que devuelve el historial de git.
4. Documenta el flujo en el `GOVERNANCE.md` que ya genera el pack de Node.

**Lo aprendido configurándolo a mano en F0-13**, que concreta el diseño:

- **Los checks obligatorios salen de los workflows generados.** Deben coincidir
  exactamente con el `name` de cada job, y los de matriz se expanden (`Node
  22.13`, `Node 24`…). Si la matriz cambia y la regla no, todas las PRs quedan
  bloqueadas para siempre. Como Plumbward genera las dos cosas, calcula la lista
  exacta y en cada `upgrade` actualiza ambas a la vez. **Es la ventaja que no
  tiene una herramienta que sólo protege ramas.** `doctor` avisa si un check
  obligatorio no corresponde a ningún job.
- **Aprobaciones según el equipo:** 0 para un desarrollador solo, que con 1 no
  podría mergear nunca sus propias PRs; 1 o más para equipos.
- **Qué ramas proteger:** `integration` y `release` del perfil, más la rama por
  defecto de GitHub, que se lee de la API. Proteger una rama de más es barato;
  lo que nunca se deduce es desde cuál se despliega. Si falta `release`, se
  protege lo que se sabe y se avisa (ADR 0005).
- **Es una operación remota nueva**, fuera de las seis operaciones locales del
  núcleo, así que requiere una **ADR**. Debe conservar las garantías: `plan`
  muestra la regla exacta, se leen primero las existentes para no pisarlas,
  `apply` sólo con confirmación explícita, y el journal guarda su identificador
  para que `rollback` la borre.
- **Requiere permisos de administración:** se usa la sesión de `gh` que ya
  tenga el usuario, sin guardar nunca el token.
- **Límite de GitHub:** las reglas se aplican en repositorios públicos con
  cualquier plan, pero en privados exigen Pro, Team o Enterprise. Detectarlo y
  explicarlo, en lugar de crear una regla que GitHub ignora sin avisar.
- Multiplataforma: GitLab y Bitbucket tienen APIs equivalentes.

**Criterios de aceptación:**
- Tras aplicar, el repo del cliente tiene documentado su flujo y las
  protecciones listas para activar.
- Nada toca la configuración remota del repositorio sin confirmación explícita.
- Los checks obligatorios coinciden con los jobs generados, y cambiar la matriz
  actualiza la regla en el mismo `upgrade`.

---

### [ ] F3-6 — Flujo de entrega y revisión asistida en las reglas generadas
**Branch:** `feat/f3-delivery-workflow` · **Depends on:** F3-5

**Por qué:** el cuello de botella que el producto promete resolver no es escribir
el código, es **revisarlo**. Un equipo pequeño, o uno en el que sólo queda una
persona un viernes por la tarde, acumula PRs sin revisar y acaba mergeando sin
mirar. Esta tarea convierte en producto el flujo que ya usamos internamente
(§3.3): el asistente del cliente entrega los textos y, si hace falta, revisa.

**Trabajo:**
1. El pack base añade a las reglas de IA generadas una sección de **flujo de
   entrega**: al cerrar una unidad de trabajo, el asistente entrega el mensaje de
   commit, el **título** de la PR y su descripción, en el idioma que indique
   `agentBoundaries.commitLanguage`, con el formato de la plantilla de PR que
   genere el propio pack. El título en una línea y bajo 70 caracteres: es lo
   único que se ve en la lista de PRs.
2. Regla explícita de **revisión en contexto nuevo**: si el desarrollador pide
   que el asistente revise la PR, debe hacerlo sin el historial que produjo el
   código. Es el punto que hace que la revisión valga algo; sin él, el asistente
   se limita a confirmar sus propias suposiciones.
3. Regla de **preguntar antes**: nunca asumir que revisa el asistente. Se ofrece;
   decide el equipo.
4. La revisión **entrega hallazgos, no aprueba ni integra**. El merge lo hace una
   persona, siempre. Debe quedar escrito en las reglas generadas para que no se
   erosione con el uso.
5. Nueva opción de perfil `assistedReview` (por defecto activa) para que un
   equipo con revisión humana garantizada pueda desactivar el ofrecimiento.
6. **Revisión proporcional** (origen: F0-17). La primera revisión es completa;
   las siguientes se limitan al diff de las correcciones y usan un modelo ligero.
   Una corrección pequeña ya probada no lleva otra ronda. Al cerrar, el
   asistente recuerda que el merge es del desarrollador y que lo siguiente
   empieza en una sesión nueva (F3-10 lo automatiza).

**Criterios de aceptación:**
- Un repositorio configurado recibe el flujo de entrega en sus ficheros de reglas
  de IA, coherente con la plantilla de PR y el flujo de ramas que se le generan.
- Desactivar `assistedReview` elimina la parte de revisión pero mantiene la
  entrega de los mensajes.
- La sección deja explícito que la revisión asistida es una válvula contra el
  bloqueo, no un sustituto de la revisión humana.
- Las reglas generadas limitan las revisiones de seguimiento al diff de las
  correcciones.

---

### [ ] F3-7 — Leyes de testing acopladas al cambio
**Branch:** `feat/f3-test-coupling` · **Depends on:** F3-3

**Por qué:** es la queja número uno sobre el código generado con IA — llega sin
pruebas— y es **mecánicamente comprobable**, que es lo que la convierte en
control y no en consejo.

**Trabajo:**
1. Comparar el diff de la Pull Request con los símbolos exportados que toca:
   - Función exportada **nueva** sin prueba que la cubra → falla.
   - Función exportada **modificada** cuya prueba no se ha tocado → avisa.
   - Función exportada **eliminada** con pruebas huérfanas → falla.
2. Respetar el modo: en `non-disruptive` sólo avisa, nunca bloquea.
3. Vía de escape explícita y auditable: una anotación que exima un símbolo
   concreto, **con motivo obligatorio**, visible en la revisión.
4. Que el mensaje de error diga qué fichero de prueba falta y dónde crearlo.

**Criterios de aceptación:**
- Una PR que añade una función exportada sin prueba se bloquea con un mensaje
  accionable.
- La exención requiere escribir un motivo y queda visible en la PR.

---

### [ ] F3-8 — Postura de seguridad, más allá de los secretos
**Branch:** `feat/f3-security-posture` · **Depends on:** F3-3

**Por qué:** Gitleaks detecta tokens filtrados. No detecta **puertas abiertas**,
que es la otra mitad del problema y la que un asistente de IA introduce con más
facilidad porque copia ejemplos de documentación pensados para desarrollo local.

**Trabajo:**
1. Controles para configuraciones inseguras por defecto, con la fuente oficial
   que respalda cada uno (F1-5): `CORS: *`, modo depuración activo en producción,
   puertos expuestos innecesariamente, autenticación permisiva, cookies sin
   `Secure` ni `HttpOnly`, TLS desactivado.
2. Detección de variables de entorno usadas en el código pero ausentes de
   `.env.example`, y al revés.
3. Detección de credenciales por defecto en ficheros de contenedor y de
   `docker-compose`.
4. Cada hallazgo explica **por qué es un problema** y cómo se corrige. Un aviso
   que no enseña se acaba silenciando.

**Criterios de aceptación:**
- Los controles funcionan sobre los stacks con pack propio.
- Cada control cita su fuente oficial.
- Cero falsos positivos sobre los repositorios de prueba de F6-2; un control
  ruidoso se desactiva antes que tolerarlo.

---

### [ ] F3-9 — Controles derivados de incidentes
**Branch:** `feat/f3-incident-derived-controls` · **Depends on:** F3-7, F0-12

**Por qué es la funcionalidad con más foso de todo el plan:** el trinquete
impide empeorar en métricas. Esto impide **repetir un fallo concreto**. Al año,
la configuración de Plumbward de un cliente contiene los errores que su equipo
ya no comete — y eso no lo replica un competidor publicando un repositorio, ni
lo regala una plataforma. Es coste de cambio real.

**Trabajo:**
1. Un **catálogo de controles parametrizables**: cadena prohibida, fichero
   obligatorio, acoplamiento símbolo-test, coherencia entre documentación y
   comandos, token persistido que no puede cambiar, configuración insegura.
2. Flujo que convierte un hallazgo en una instancia de uno de esos controles con
   dos o tres respuestas. **No se deriva un control de prosa arbitraria**: se
   elige plantilla y se parametriza. Prometer lo contrario sería vender magia.
3. Los controles resultantes se versionan en el repositorio del cliente, en
   formato legible, y se revisan en una PR como cualquier otro cambio.
4. El registro de controles derivados alimenta el informe de F4-4: *"este año
   convertisteis 23 incidencias en controles; ninguna se ha repetido"*. **Es el
   informe de renovación, no hay que construirlo aparte.**

**Criterios de aceptación:**
- Un hallazgo típico se convierte en control en menos de un minuto.
- El control resultante es legible por una persona que no estuvo en la
  incidencia.
- Desactivar un control exige motivo escrito, visible en la revisión.

---

### [ ] F3-10 — Cierre de sesión guiado: `plumbward session close`
**Branch:** `feat/f3-session-close` · **Depends on:** F3-6, F1-3

**Origen:** F0-17. El protocolo de conservación de tokens pide abrir una sesión
nueva al cerrar cada tarea, pero hacerlo a mano es fricción: hay que recordar
qué sigue y redactar el arranque. Un paso manual y farragoso se salta; un
comando que lo deja todo en el portapapeles se usa. Es la tesis del producto
—los controles vencen a las reglas— aplicada al coste.

**Trabajo:**
1. `plumbward session close [--next="<tarea>"]`, como subcomando: el resto de la
   CLI usa verbos sueltos (`scan`, `plan`, `apply`), no `session:close`.
2. **Precondiciones.** Árbol limpio —ni cambios ni ficheros sin seguimiento— y
   rama empujada. Si algo falla, lo lista y no hace nada más.
3. **Siguiente tarea.** Sin `--next`, la primera pendiente cuyas dependencias
   estén cerradas, leída del plan que declare `.governance/config.yml`
   (`session.plan`: ruta y patrón de cabecera; por defecto `### [ ] <ID> — <título>`).
   El cliente no tiene nuestro `EXECUTION_PLAN.md`: la fuente es configurable.
4. **Prompt de arranque con punteros, no con contenido.** Repositorio, tarea y
   su rama, último commit (hash y `--stat`) y qué leer y en qué orden. **Nunca el
   diff**: meterlo en el prompt es justo el contexto arrastrado que se quiere
   evitar; la sesión nueva lo pide si lo necesita. En el idioma del perfil.
5. Copia al portapapeles (`pbcopy`, `wl-copy`/`xclip`, `clip.exe`). Sin
   portapapeles (SSH, CI), lo imprime. No escribe en disco, así que no emite
   `Operation[]`; mismo config y mismo repo dan el mismo prompt (invariante 2).
6. Mensaje final: el merge lo hace el desarrollador, y hay que abrir una sesión
   nueva del asistente y pegar el prompt.
7. **Sin `clear`.** Limpiar la terminal no vacía el contexto del asistente: lo
   vacía la sesión nueva. Borrar la pantalla sólo esconde lo que el desarrollador
   quizá quería leer.

**Lo que no se puede prometer:**
- "Cero tokens": la sesión nueva sigue cargando las reglas y el prompt de
  sistema. Se promete **sin contexto acumulado**, que es lo que cuesta.
- "El cliente ve cuánto ahorra": no hay telemetría (ADR 0002). Medirlo exigiría
  un informe local leyendo los registros de cada asistente. Es otra tarea, y hay
  que decidir antes si entra en `BUSINESS_MODEL.md`.

**Criterios de aceptación:**
- Con el árbol sucio o la rama sin empujar, falla, lista la causa y no copia nada.
- Mismo config y mismo repositorio producen el mismo prompt, byte a byte.
- El prompt no contiene ningún diff y cabe en menos de 20 líneas.
- Sin portapapeles disponible, imprime el prompt y termina con éxito.
- Mensajes en español y en inglés.

---

## FASE 4 — Ciclo de vida del producto instalado

**Objetivo:** que la herramienta sirva el día 200, no sólo el día 1.
**Estimación:** 3-4 sesiones.
**Por qué importa:** el cliente paga una **suscripción anual**, y lo único que
justifica renovarla es el valor nuevo que llega cada versión
([ADR 0004](adr/0004-annual-subscription.md)). Sin `upgrade` y sin el motor
de recurrencia de F4-5 a F4-8, no hay segundo año.
**Criterio de salida:** un repo configurado hace seis meses se actualiza a las
reglas nuevas sin perder ni una sola personalización del cliente.

---

### [ ] F4-1 — Wizard interactivo `plumbward init`
**Branch:** `feat/f4-wizard-init` · **Depends on:** Phase 3 complete

**Trabajo:**
1. Comando `init` con `@clack/prompts` (ya es dependencia del CLI).
2. Preguntas, **con un valor por defecto derivado del escaneo** para que pulsar
   Enter dé un resultado correcto —salvo la rama de despliegue, que no lo tiene
   a propósito—:
   - Estrategia de ramas (F3-5).
   - Destino de despliegue por entorno **y la rama desde la que se despliega**
     (`branches.release`). Es lo único que Plumbward nunca deduce (ADR 0005): se
     pregunta siempre, sin valor por defecto.
   - Nivel de estrictez, mostrando cuántos errores generaría cada opción **sobre
     su repo real** — el escáner ya tiene los datos para calcularlo.
   - Asistentes de IA en uso.
   - **Límites operativos del asistente** (`agentBoundaries`): si puede ejecutar
     git y migraciones, y en qué idioma redacta los mensajes de commit. Por
     defecto los tres activos; desactivarlos debe requerir una acción consciente.
   - Docker Compose y DevContainer.
   - Idioma.
3. El wizard **no ejecuta nada**: sólo produce el `Profile` y lo escribe en
   `.governance/config.yml`. Después encadena a `plan`.
4. `--yes` para CI y `--profile <fichero>` para que una agencia aplique el mismo
   perfil a diez repositorios sin repetir el cuestionario.

**Criterios de aceptación:**
- `init --yes` en un repo cualquiera produce un config válido sin interacción.
- Cancelar a mitad no deja nada escrito.
- El wizard es reejecutable: parte del config existente si lo hay.

---

### [ ] F4-2 — `plumbward upgrade` con detección de personalizaciones
**Branch:** `feat/f4-upgrade-drift` · **Depends on:** F4-1

**Por qué:** es el corazón del modelo de suscripción, y el mecanismo ya está
medio construido: las cabeceras de fichero gestionado (`withManagedHeader`) y
los bloques delimitados (`ensureBlock`) existen precisamente para esto.

**Trabajo:**
1. Comparar el hash registrado en la cabecera de cada fichero gestionado con el
   contenido actual para clasificar: **intacto** (se regenera), **modificado por
   el cliente** (se respeta y se avisa) o **borrado** (se pregunta).
2. En ficheros con bloques delimitados, actualizar sólo el interior del bloque.
3. `plumbward upgrade --dry-run` que muestre el diff exacto, igual que `plan`.
4. Informe claro de qué se actualizó, qué se respetó y qué requiere decisión humana.
5. Migraciones entre versiones del formato de `config.yml`.

**Caso concreto que ya existe:** un `ci-prod.yml` generado por una versión
anterior de Plumbward desde una rama deducida sigue ahí tras actualizar, porque
`apply` no pisa ficheros existentes. Hoy sólo lo detecta `doctor` (F0-14);
`upgrade` debe poder regenerarlo o retirarlo. Lo mismo con un `ci-dev.yml`
antiguo que filtre `pull_request` por rama: las Pull Requests a otras ramas no
se revisan. `doctor` lo avisa desde F0-14; `upgrade` debe quitar el filtro.
**Criterios de aceptación:**
- Un fichero generado y luego editado a mano **nunca** se pisa.
- Un fichero generado e intacto se actualiza a la versión nueva.
- `upgrade` es reversible con `rollback`, igual que `apply`.

---

### [ ] F4-3 — `doctor --fix`
**Branch:** `feat/f4-doctor-fix` · **Depends on:** F4-2

**Trabajo:**
1. Los `HealthCheck` ya declaran `fixHint`. Añadir un campo opcional que aporte
   las `Operation[]` que arreglan el problema.
2. `doctor --fix` construye un plan con esas operaciones y lo pasa por el mismo
   flujo de confirmación, journal y rollback. Sin atajos.
3. Salida en JSON (`--json`) para consumirla desde CI.

**Criterios de aceptación:**
- `doctor --fix` deja el repo en verde en los casos que declara poder arreglar.
- Nunca escribe fuera del flujo transaccional.

---

### [ ] F4-4 — Informe comercial `plumbward report`
**Branch:** `feat/f4-sales-report` · **Depends on:** F4-3

**Por qué:** el que decide la compra no es quien ejecuta el CLI, y no va a leer
una salida de terminal. Este informe es la herramienta de venta: se genera
gratis, se comparte por correo y crea la necesidad que el producto resuelve.

**Trabajo:**
1. `plumbward report --html` produce un informe autocontenido: puntuación de
   madurez, señales ausentes con su impacto, estimación de horas de trabajo
   DevOps que la herramienta ahorra, y comparación antes/después.
2. `--json` para integraciones.
3. Diseño sobrio y profesional, sin dependencias externas ni telemetría.

**Criterios de aceptación:**
- El HTML se abre sin conexión y se lee bien en móvil.
- Los números que muestra se pueden justificar con los datos del escaneo; nada
  inventado.

---

### [ ] F4-5 — Detectar que hay una versión nueva, sin telemetría
**Branch:** `feat/f4-version-detection` · **Depends on:** F4-2

**Por qué:** es la primera pieza del motor de recurrencia
([BUSINESS_MODEL.md §6](BUSINESS_MODEL.md)). Si el cliente no se
entera de que hay algo nuevo, la suscripción no se renueva.

**Trabajo:**
1. Consultar el registro público de npm para saber si hay versión más reciente.
   **Nunca una API nuestra**: no queremos saber quién ejecuta qué.
2. Caché local con tiempo de vida razonable, para no consultar en cada ejecución.
3. Aviso discreto al final de `scan` y `doctor`, jamás bloqueante.
4. `--no-update-check` y variable de entorno equivalente, para entornos aislados
   y para CI.

**Criterios de aceptación:**
- Sin red, el CLI funciona igual y no se retrasa ni un segundo.
- No se envía ningún dato identificable a ningún servidor.

---

### [ ] F4-6 — Changelog dirigido: sólo lo que aplica a este repositorio
**Branch:** `feat/f4-targeted-changelog` · **Depends on:** F4-5

**Por qué:** esta es la pieza que no hace nadie. Un changelog genérico se ignora.
Uno que dice *"de los 14 cambios de esta versión, estos 3 te afectan porque usas
Next.js y no tienes contenedores"* se lee entero.

**Trabajo:**
1. Que cada entrada del changelog declare a qué stacks, modos y capacidades
   aplica. Es un cambio en el formato de release, no sólo en el CLI.
2. Cruzar el changelog con el escaneo del repositorio y mostrar **sólo** lo
   relevante, con el resto colapsado.
3. Enlazar cada entrada con el cambio concreto que produciría en su repositorio,
   para poder ir directo a `upgrade --dry-run`.

**Criterios de aceptación:**
- Dos repositorios de stacks distintos ven changelogs distintos de la misma
  versión.
- Una entrada sin metadatos de aplicabilidad no pasa la CI del release.

---

### [ ] F4-7 — Catálogo de capacidades y oferta continua
**Branch:** `feat/f4-capability-catalog` · **Depends on:** F4-6

**Por qué:** es lo que convierte la herramienta de "configurador que se ejecuta
una vez" en "servicio que mejora tu repositorio cada trimestre". Sin esto, la
suscripción no tiene defensa.

**Trabajo:**
1. Un catálogo declarativo de capacidades, cada una con sus requisitos: qué
   stack necesita, qué debe existir ya en el repositorio, qué modo la permite.
2. Tras un `upgrade`, volver a escanear y comparar contra el catálogo para
   encontrar lo que el repositorio **ahora** admite y no tiene.
3. Presentarlo como oferta, nunca como acción: *"ahora sabemos dockerizar
   proyectos como el tuyo. ¿Lo hacemos?"*.
4. Recordar lo rechazado para no volver a proponerlo en cada ejecución. Una
   herramienta que insiste se desinstala.

**Criterios de aceptación:**
- Añadir una capacidad al catálogo hace que los repositorios que la admiten la
  vean ofrecida, sin tocar código del CLI.
- Rechazar una oferta la silencia hasta que el usuario la pida.

---

### [ ] F4-8 — Flujos guiados, empezando por dockerizar Node/TS
**Branch:** `feat/f4-guided-flows` · **Depends on:** F4-7

**Por qué:** hay capacidades que no se pueden generar a ciegas. Dockerizar exige
saber qué servicios hay, qué puertos, si existe base de datos y cómo se
construye el proyecto. Un asistente que pregunte lo mínimo y genere el resto es
un ahorro de horas muy visible — y muy demostrable en una venta.

**Riesgo, y por eso empezamos por uno solo:** si prometemos "yo te dockerizo el
proyecto", pasamos a ser dueños de todos los modos de fallo de todos los stacks.
Es el riesgo N2 del modelo de negocio. **Node/TypeScript primero, y no se amplía
hasta que funcione sin soporte manual.**

**Trabajo:**
1. Motor de flujos guiados sobre `@clack/prompts`, reutilizable por otras
   capacidades.
2. Primer flujo: dockerización de Node/TS. Detectar gestor de paquetes, script
   de build, puertos, servicios externos y variables de entorno; preguntar sólo
   lo que no se pueda deducir.
3. Generar `Dockerfile` multi-etapa, `.dockerignore`, `docker-compose.yml` para
   desarrollo, y documentación en el idioma del perfil.
4. **El resultado sigue siendo un `ChangePlan`**: revisable con `plan`, aplicable
   con `apply`, reversible con `rollback`. Ni un atajo.
5. Verificar que la imagen construye antes de dar la capacidad por completada.

**Criterios de aceptación:**
- Sobre un proyecto Next.js y sobre uno de Express, la imagen generada construye
  y arranca.
- Cancelar a mitad del flujo no deja nada escrito.
- El flujo no pregunta nada que el escáner pudiera haber deducido.

---

## FASE 5 — Licenciamiento local-first

**Objetivo:** cobrar, sin romper la confianza que hace vendible el producto.
**Estimación:** 3-4 sesiones (más el servicio, que es un proyecto aparte).
**Decisión de negocio tomada el 2026-09-08:** ver `docs/adr/0002`. Todo el
código viaja en el paquete NPM. La licencia se valida en red **sólo** en `init`
y `upgrade`. `scan`, `plan`, `apply`, `rollback` y `doctor` funcionan **offline
y para siempre**. No se inyecta nada que pueda hacer fallar la CI del cliente.
**Criterio de salida:** el producto se puede vender y facturar, y pasa una
revisión de proveedor de un departamento de seguridad corporativo.

---

### [ ] F5-1 — Paquete `@plumbward/licensing`
**Branch:** `feat/f5-licensing-sdk` · **Depends on:** Phase 4 complete

**Trabajo:**
1. Cliente HTTPS de la API de licencias, con tiempos de espera cortos y
   mensajes de error que digan qué hacer.
2. Huella del repositorio: la lógica ya existe en
   [git.ts](../packages/scanner/src/git.ts) (`fingerprint` a partir del primer
   commit, con la URL remota como respaldo). Sólo hay que consumirla.
3. Verificación **criptográfica local** de la licencia recibida (firma de clave
   pública embebida en el paquete). Así el CLI valida sin llamar a la API en
   cada ejecución.
4. Qué se envía, documentado en el README y visible con `--verbose`:
   token, huella del repositorio, versión del CLI. **Nunca** código, ni rutas,
   ni nombres de fichero, ni el correo del desarrollador.

**Criterios de aceptación:**
- Sin red, un repo ya licenciado sigue funcionando por completo.
- Una licencia manipulada a mano se rechaza por firma inválida.
- El usuario puede ver exactamente qué se envía antes de que se envíe.

---

### [ ] F5-2 — Servicio de licencias
**Branch:** separate repository · **Depends on:** F5-1

**Trabajo:**
1. API mínima: emitir, validar, vincular a huella, listar y revocar.
2. Modelo de datos: licencia → huellas vinculadas, con el límite del plan
   (1 repo, o 5-10 en el paquete de agencia).
3. Integración con la pasarela de pago: comprar emite el token automáticamente.
4. Panel para el cliente: sus licencias, sus repos vinculados y **la posibilidad
   de desvincular él mismo**, sin abrir un ticket. Un repo se migra o se
   renombra; si eso obliga a escribir un correo, la experiencia se rompe.

**Criterios de aceptación:**
- Usar una licencia de 1 repo en un segundo repo devuelve un error claro que
  explica cómo desvincular o ampliar.
- El panel permite resolverlo sin intervención humana por nuestra parte.

---

### [ ] F5-3 — Permisos por plan (entitlements)
**Branch:** `feat/f5-entitlements` · **Depends on:** F5-2

**Trabajo:**
1. La licencia declara a qué packs y funcionalidades da derecho.
2. Gratis y sin licencia, para siempre: `scan` y `report`. Son el gancho.
3. La fecha de fin de actualizaciones se registra en el config: pasada esa
   fecha, `upgrade` deja de traer reglas nuevas, pero **todo lo instalado sigue
   funcionando**. No se rompe nada nunca.

**Criterios de aceptación:**
- Una licencia caducada no degrada ni bloquea un repositorio ya configurado.
- El aviso de caducidad es informativo y aparece con antelación suficiente.

---

### [ ] F5-4 — Tolerancia a fallos de red
**Branch:** `feat/f5-offline-grace` · **Depends on:** F5-3

**Trabajo:**
1. Si la API no responde durante un `upgrade`, se usa la licencia firmada en
   caché mientras siga vigente.
2. Ninguna caída de nuestra infraestructura puede bloquear el trabajo de un cliente.
3. Test que simula la API caída y verifica que todo sigue.

**Criterios de aceptación:**
- Con la API apagada, todos los comandos funcionan con una licencia válida en caché.

---

### [ ] F5-5 — Suscripción anual y tramos por volumen
**Branch:** `feat/f5-annual-subscription` · **Depends on:** F5-3

**Origen:** decisión de negocio del 2026-09-09,
[ADR 0004](adr/0004-annual-subscription.md). Sustituye al modelo de pago
único con doce meses de actualizaciones.

**Trabajo:**
1. La licencia firmada lleva **fecha de expiración**, verificable en local contra
   la clave pública embebida.
2. Revalidación contra la API **sólo en `upgrade`**. Nunca en `scan`, `plan`,
   `apply`, `doctor` ni `rollback`.
3. Tramos por volumen de repositorios para agencias, con vinculación y
   desvinculación autogestionada desde el panel.
4. Avisos de caducidad con antelación suficiente y por canales que el cliente
   vea: salida del CLI y correo.
5. **Una suscripción caducada deja de traer reglas nuevas y nada más.** No
   degrada, no bloquea, no desinstala. El cliente conserva para siempre lo que
   tenía el último día que pagó.

**Criterios de aceptación:**
- Un repositorio con la suscripción vencida sigue funcionando por completo con
  la configuración que ya tenía.
- Sin red, un repositorio con licencia vigente en caché no se ve afectado.
- El paso de un tramo a otro no obliga a reconfigurar ningún repositorio.

---

## FASE 6 — Distribución y lanzamiento

**Objetivo:** que exista un producto comprable.
**Estimación:** 2-3 sesiones.
**Criterio de salida:** un cliente ejecuta `npx @tu-empresa/plumbward scan`, ve
el valor, paga y aplica.

---

### [ ] F6-1 — Publicación en NPM
**Branch:** `build/f6-npm-publishing` · **Depends on:** Phase 5 complete

**Trabajo:**
1. Scope y organización ya resueltos en F0-8: `@plumbward/*`, organización
   registrada en npm el 2026-09-09.
2. Empaquetado: un único ejecutable por `tsup`, arranque rápido, `bin` correcto.
3. Verificar `npx` en macOS, Linux y Windows, con las versiones de Node que
   la CI pruebe en ese momento (hoy 22.13, 24 y 26).
4. Publicación automática desde `main` con changesets y provenance.
5. Comprobar el tamaño del paquete: `npx` se ejecuta en cada demo y una descarga
   lenta arruina la primera impresión.

**Criterios de aceptación:**
- `npx @tu-empresa/plumbward scan` funciona en las tres plataformas.
- Arranque por debajo de 2 segundos.

---

### [ ] F6-2 — Validación E2E sobre repositorios reales
**Branch:** `test/f6-real-repo-e2e` · **Depends on:** F6-1

**Por qué:** es la Fase 4 del PDF original y el único filtro que detecta lo que
los tests sintéticos no ven.

**Trabajo:**
1. Batería sobre repositorios públicos reales, uno por perfil:
   - Greenfield (< 2.000 SLOC).
   - Medio con deuda (2.000-50.000).
   - Monorepo grande (> 50.000).
   - Uno por cada stack soportado.
   - Uno de un stack **no** soportado (verifica el pack base).
2. Para cada uno: `scan` → `plan` → `apply` → CI en verde → `rollback` → repo
   idéntico al original.
3. Medir de verdad el tiempo total y contrastarlo con la promesa de "menos de 5
   minutos" del PDF. Si no se cumple, se corrige el producto o se corrige la promesa.

**Criterios de aceptación:**
- Todos los perfiles pasan el ciclo completo.
- El tiempo medido queda registrado en el README como dato verificable.

---

### [ ] F6-3 — Materiales de venta
**Branch:** `docs/f6-landing-and-demo` · **Depends on:** F6-2

**Trabajo:**
1. Landing con la propuesta de valor, el precio y un `asciinema` de la demo real.
2. Informe de ejemplo (F4-4) publicado como muestra.
3. Documentación de usuario final, separada de la de contribuidores.
4. Caso de uso escrito con los números reales medidos en F6-2 — no estimaciones.

**Criterios de aceptación:**
- La landing responde en 30 segundos qué es, para quién y cuánto cuesta.

---

### [ ] F6-4 — Lanzamiento 1.0
**Branch:** `chore/f6-launch` · **Depends on:** F6-3

**Trabajo:**
1. Congelar la API pública de `StackPack`: a partir de 1.0, romperla tiene coste.
2. Política de soporte y de versiones publicada.
3. Canal de soporte y proceso de incidencias.
4. Primeros tres clientes piloto con descuento a cambio de retroalimentación
   estructurada.

---

## 5. Execution order and dependencies

```
PHASE 0 ─────────────────> PHASE 1 ────> PHASE 2 ────> PHASE 3 ────> PHASE 4 ────> PHASE 5 ────> PHASE 6
(foundation)              (i18n)        (stacks)      (modes)       (lifecycle)   (licensing)   (launch)
```

Phases are sequential, but **inside each phase there is parallelism**:

- **Phase 0:** F0-1 first. Then F0-2, F0-3 and F0-5 in parallel. F0-4, F0-6 and
  F0-7 depend on F0-3.
- **Phase 2:** F2-1 → F2-2 → F2-3, and then **F2-4, F2-5 and F2-6 are parallel**.
  It is the best point of the plan to share out work.
- **Phase 3:** F3-5 only depends on F2-2, so it can be brought forward.

### Execution queue

**The next task is always the first one in this list.** It is the answer to
any question about the state of the plan or about what comes next, whoever
asks it and in whatever language. If the developer changes a priority —like
bringing forward the switch to English, which gets more expensive the more the
project grows—, the entry is moved and the reason is written in the matching
criterion. When a task is closed, its PR takes it out of the queue; when a new
task is created, the same PR places it. `pnpm check:coherence` fails if a
pending task is missing, if a completed one is still there, or if any comes
before something it depends on.

The order of Phase 0 follows four criteria, in this order of priority:

1. **First, English as the main language.** Decision of 2026-09-13 (F0-41):
   instructions, plan, documentation, comments, tests and what the product
   generates by default switch to English. It goes before everything because
   every later task reads and writes in that language: done first, the next
   tasks are already written in English and every session reads fewer tokens;
   done last, everything they produced would have to be translated too. Inside
   the block, first the control that stops new Spanish and the instructions
   read in every session; then the names, so the translations land on their
   final path; then the plan, which is what is read the most.
2. **Then, making green mean something.** Before touching what can lose data,
   the tests and controls that claim to cover it have to fail when it breaks. A
   risky change on a net full of holes is the scenario reviews have found again
   and again.
3. **Next, the guarantees we sell and do not hold today** (risks R5 and R7):
   writing outside the repository, a `rollback` that loses work, an
   irreversible installation. The journal format is decided before changing it
   again, and its contract is documented after the last change, not before.
4. **Last, detection, conventions and publishing infrastructure**, which do not
   put a client's repository at risk.

The following phases go in their dependency order. Inside each one, the
controls that watch the work of the phase go before that work.

<!-- queue:start -->

#### Phase 0 · 1. English as the main language

- **F0-42** — the plan, the most read file after `CLAUDE.md`.
- **F0-47** — the assistant hands over the next-session prompt without being asked. Right after F0-42: it is ten lines of `CLAUDE.md` and saves a round trip in every multi-session task after it.
- **F0-18** — the rest of the documentation and all the ADRs.
- **F0-43** — comments and tests of the core.
- **F0-44** — comments and tests of the CLI, the packs and the scripts.
- **F0-45** — the product speaks English by default; Spanish stays in the profile.

#### Phase 0 · 2. Making green mean something

- **F0-34** — the only full-cycle e2e does not exercise the commit check.
- **F0-22** — the tests in `packages/*/test/` do not go through the typecheck, and the control of the `quality` job watches itself.
- **F0-32** — the mutation control gives empty greens through gaps in its parsers.
- **F0-46** — the name and link controls of F0-16 pass without looking in some cases and flag valid English names.
- **F0-36** — decide whether the journal guard joins the mutation battery before touching it again.
- **F0-7** — 90 % coverage threshold in `core`, the declared mitigation of R5.

#### Phase 0 · 3. Guarantees we sell and do not hold today

- **F0-10** — a symbolic link allows writing outside the repository: the boundary `SECURITY.md` presents.
- **F0-9** — a new operation type would be ignored by `plan` and run by `apply`.
- **F0-37** — policy for old journals and a remedy that leaves the tree clean, before changing the format again.
- **F0-38** — `rollback` overwrites work: content hash in the journal.
- **F0-39** — pin down with tests the messages F0-38 makes final.
- **F0-11** — dependency installation stays outside the journal.
- **F0-33** — live code that only one test reaches, in the return notice.
- **F0-31** — contract of `readJournal`, with the format already stable.
- **F0-35** — full contract of the journal and its versioning policy.

#### Phase 0 · 4. Detection, conventions and publishing

- **F0-26** — `doctor` and the `branches` validation look at data without understanding it.
- **F0-25** — exemptions by name in the branch control.
- **F0-20** — decide the merge strategy.
- **F0-28** — the `git branch -d` advice, according to that decision.
- **F0-19** — the client's branch template contradicts itself in Spanish.
- **F0-21** — leftovers of the plan and of the branch diagram.
- **F0-23** — the history scan to its own workflow.
- **F0-2** — a single source for the version, used by the journal and `upgrade`.
- **F0-4** — dogfooding: our own hooks and linters.
- **F0-6** — automated versioning and changelog.
- **F0-12** — the remaining controls from review findings (forbidden terms, protected facts...).

#### Phase 1 — Internationalisation

- **F1-1** — `@plumbward/i18n` package.
- **F1-2** — Node/TS pack to the catalogues.
- **F1-3** — CLI messages in both languages.
- **F1-4** — parity between languages.
- **F1-5** — provenance of each rule.

#### Phase 2 — Stack coverage

- **F2-1** — multi-stack detection.
- **F2-2** — universal base pack.
- **F2-3** — conformance kit.
- **F2-13** — golden snapshots, before the packs they watch arrive.
- **F2-9** — assistant operating limits to the base pack.
- **F2-12** — agent tooling per stack.
- **F2-4** — Python pack.
- **F2-5** — PHP / Laravel pack.
- **F2-6** — Go pack.
- **F2-7** — monorepos.
- **F2-8** — guide for pack authors.
- **F2-11** — real boundary for third-party packs.

#### Phase 3 — Application modes and workflow

- **F3-5** — governance of the branch flow.
- **F3-6** — delivery flow and assisted review.
- **F3-1** — baseline of the existing debt.
- **F3-2** — ratchet over what changes.
- **F3-3** — CI only over the diff.
- **F3-4** — no getting worse.
- **F3-7** — testing coupled to the change.
- **F3-8** — security posture.
- **F3-9** — controls derived from incidents.
- **F3-10** — guided session close.

#### Phase 4 — Lifecycle

- **F4-1** — `init` wizard.
- **F4-2** — `upgrade` with detection of customisations.
- **F4-3** — `doctor --fix`.
- **F4-4** — commercial report.
- **F4-5** — detect a new version without telemetry.
- **F4-6** — targeted changelog.
- **F4-7** — capability catalogue.
- **F4-8** — guided flows.

#### Phase 5 — Licensing

- **F5-1** — `@plumbward/licensing`.
- **F5-2** — licence service.
- **F5-3** — entitlements.
- **F5-4** — tolerance to network failures.
- **F5-5** — annual subscription and tiers.

#### Phase 6 — Launch

- **F6-1** — publishing on NPM.
- **F6-2** — E2E over real repositories.
- **F6-3** — sales materials.
- **F6-4** — 1.0 launch.

<!-- queue:end -->

### Shortest path to a sellable demo

If at some point the product has to be shown before the plan is finished, the
defensible minimum is: **F0-1 → F0-3 → F0-5 → F2-1 → F2-2 → F4-4**. With that
there is a serious repository, universal coverage through the base pack and a
report to show whoever decides the purchase.

---

## 6. Risks and open decisions

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| ~~R1~~ | **Closed on 2026-09-10.** The name under consideration, `aegiscode`, was taken on npm, including `@save3asy/aegiscode`: a namesake competitor in our same category | — | Renamed to Plumbward, organisation registered on npm and domains acquired. Task F0-8 completed |
| R7 | Documenting guarantees the code does not fully hold | Loss of credibility exactly at the point we sell | The fresh-context review (F3-6) detected it in F0-5; tasks F0-9, F0-10, F0-11 and F2-11 |
| R2 | The licence model is source-available: it can be copied | Loss of revenue | What is sold is the continuous updating and the support, not the binary. Conscious decision (ADR 0002) |
| R3 | Every new pack is a permanent maintenance surface | The cost grows with the catalogue | The conformance kit (F2-3) and the catalogue open to third parties (F2-8) |
| R4 | The "5 minutes" promise may not hold on large repos | Commercial credibility | Measure it in F6-2 and adjust the product or the message, never hide it |
| R5 | An `apply` that corrupts a client's repo | Loss of the client and of word of mouth | Journal, rollback, dry-run by default and 90% coverage in `core` (F0-7) |
| R6 | Changes in the tools we generate (ESLint 10, ruff...) | The templates go stale | It is precisely what the client pays for with the subscription; budget for continuous maintenance |

**Open decisions, to be closed in their phase:**

1. ~~**Code licence**~~ — closed on 2026-09-09: **BUSL-1.1**, with `scan` and
   `report` free to use and an automatic change to Apache-2.0 after four
   years. Reasoning and discarded alternatives in
   [ADR 0003](adr/0003-busl-license.md).
2. ~~**Product name**~~ — it was closed as "AegisCode" on 2026-09-08 and reopened on discovering that the niche was taken by a namesake competitor. Closed for good on 2026-09-09: **Plumbward**, with the npm organisation and the domains already registered.
3. **Telemetry**: the recommendation is **none by default**, explicit opt-in.
   We sell trust; instrumenting the CLI contradicts it.

---

## 7. How to measure that the plan is going well

| Indicator | Target |
|---|---|
| Stacks with their own pack | 5 at the end of Phase 2 |
| Repositories where the tool does nothing | 0 after F2-2 |
| Coverage of `@plumbward/core` | ≥ 90% |
| `scan` time on a 100k SLOC repo | < 10 s |
| Full cycle time on an average repo | < 5 min (verified, not estimated) |
| Client repository corruption incidents | 0 |
