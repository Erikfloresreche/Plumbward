# Execution plan — Enterprise DevSecOps & AI Governance CLI

> Living document. It is the source of truth for the development of the
> product: what is built, in what order, on which branch and with which
> criterion it is considered finished. Each task is closed by updating its
> checkbox in this file, inside the same Pull Request that implements it.

**Last updated:** 2026-09-15
**Global status:** Phase 0 in progress — F0-1, F0-3, F0-5, F0-8, F0-13, F0-14, F0-15, F0-16, F0-17, F0-18, F0-24, F0-27, F0-29, F0-30, F0-40, F0-41, F0-42, F0-43, F0-44, F0-45, F0-47 and F0-48 completed. Remaining: F0-2, F0-4, F0-6, F0-7, F0-9 to F0-12, F0-19 to F0-23, F0-25, F0-26, F0-28, F0-31 to F0-39, F0-46 and F0-49.
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
   F0-44 renamed the last three to `Types and coherence`, `Secret scanning` and
   `Full cycle on real repositories`; the ruleset is updated by hand with that
   PR.
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

### [x] F0-18 — Repository documentation in English
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

### [ ] F0-21 — Leftovers in the plan and the flow diagram
**Branch:** `docs/f0-plan-leftovers` · **Depends on:** F0-15

**Origin:** review of PR #6, point 9.

**Work:** the §3.2 diagram still says `docs/f2-guia-packs` and
`main (release)`; F3-5 has two points numbered `2.`; the "already delivered"
list of F0-12 does not include the controls that have been added since, and
F0-12 still says `CLAUDE.md` "is around 130 lines" when it is over 250.

**What becomes a mechanical control:** extend the branch name control to the
§3.2 diagram, which it does not look at today. The control count of F0-12 is
derived from `check-coherence.mjs` instead of being written by hand, which is
what makes it go stale every time one is added. The rest is a one-off fix.

**Acceptance criteria:**
- The §3.2 diagram uses branch names that pass the control, and the control
  looks at them.
- F3-5 numbers its points without repeating.
- F0-12 does not state any number —of controls or of lines— that the repository
  contradicts.

---

### [ ] F0-22 — Follow-ups from the F0-14 review
**Branch:** `fix/f0-f014-review-followups` · **Depends on:** F0-15

**Origin:** review of PR #7, point 11 of F0-15.

**Work:**
1. The control that checks the `quality` job exists runs **inside that same
   job**: with `if: false`, `continue-on-error: true` or removing its steps,
   the control disappears with it. It must be checked from another job, or
   better, the job must be a required check (it has been since F0-13) and the
   check must verify it still is by reading the ruleset.
2. The check of `if` conditions does not recognise `- if:` as a list item,
   inverted operands or `startsWith`, and does not look at `e2e.yml`.
3. The default branch is only read from `origin`: a repo whose remote is called
   `upstream` does not provide that source.
4. The tests in `packages/*/test/` do not go through the typecheck: the
   `tsconfig` files only include `src/`.
5. `listBranchNames` strips only the first segment of a remote's name: a remote
   with `/` in its name produces wrong branch names.
6. The tests that run `runApply` print the whole CLI output in the CI log.

**What becomes a mechanical control:** points 1 to 5. Point 6 is ergonomics,
not correctness. An `integration` inferred from a stale `origin/HEAD` and
written to `config.yml` is **not** mechanisable —it depends on the team reading
the file— and the wizard confirmation solves it (F4-1).

**Acceptance criteria:**
- Emptying the `quality` job makes CI fail from another job.
- There is a test for each of points 2 to 5, and it fails when its fix is
  reverted.

---

### [ ] F0-23 — Move the full history scan to its own workflow
**Branch:** `ci/f0-history-scan-workflow` · **Depends on:** F0-15

**Origin:** review of PR #6, point 12. It lives in `ci.yml` behind a condition,
so it shows up as *Skipped* on every PR and raises the doubt of whether
something is failing. In a workflow triggered only by schedule and by hand, it
would not show up. It ran for the first time on 2026-09-11: the full history is
clean.

**What becomes a mechanical control:** nothing. It is a structural change with
no new rule to watch.

**Acceptance criteria:**
- The scan lives in its own workflow, with `schedule` and `workflow_dispatch`
  triggers.
- No PR shows a *Skipped* job for this reason.

---

### [x] F0-24 — `rollback` and messages outside the branch it wrote to
**Branch:** `fix/f0-pr7-review-followups` · **Depends on:** F0-15

**Origin:** points 13 and 14 of F0-15, from the third and fourth reviews before
the merge of PR #7.

**Why it is split:** the review left eight unrelated follow-ups, and one of
them —the `git branch -d` advice— cannot be done until F0-20 decides the merge
strategy, so the whole task was blocked by its smallest point. They are spread
over F0-24, F0-26, F0-27 and F0-28: a branch implements exactly one task (§3 of
`CLAUDE.md`), and a PR of eight unconnected fixes forces exactly the giant
review that §6 asks to avoid. The two that share code stay here: both are
"`apply` wrote to another branch and nobody noticed".

**Work:**
1. **High priority.** `rollback` on `Prod` overwrites `Prod` files with a
   journal from an `apply` that wrote to the isolated branch: the journal
   stores the starting branch, not the written one, is ignored by git and
   survives checkouts. Reproduced: it takes `Prod`'s `package.json` back to an
   earlier version. It also happens on `develop`. The journal must store the
   branch it wrote to, and `rollback` must refuse on any other.
2. After an `apply` failure —an `EACCES`, for example—, the automatic revert
   leaves HEAD on `chore/setup-ai-governance` and the message says "the
   repository is intact". The files are, but the current branch is no longer
   the starting one. The message must say which branch it is left on and how to
   go back. The same after `rollback`.
The other six follow-ups of this review are in F0-26 (validation and
detection), F0-27 (the mutation job) and F0-28 (the `git branch -d` advice).

**What becomes a mechanical control:** one test per point; the `rollback` one
reproduces the case from the review.

**Acceptance criteria:**
- `rollback` refuses to act on a branch other than the one `apply` wrote to,
  and there is a test that reproduces the `Prod` case.
- There is a test for point 2, and it fails when its fix is reverted.

---

### [ ] F0-25 — Follow-ups from the review of PR #10
**Branch:** `fix/f0-branch-control-followups` · **Depends on:** F0-15

**Origin:** fresh-context review of PR #10 (F0-15). The two blockers were fixed
inside the PR; these are the non-blocking ones, which go to the plan and not to
the open branch (§6.4 of `CLAUDE.md`).

**Work:**
1. **Two exemptions are still by name, not by author.** `branchExemption`
   exempts `Prod`/`develop` and `revert-<n>-<valid branch>` without looking at
   the author: anyone can call their branch `revert-1-develop` and skip the
   whole control. The real impact is low —it is a convention control, not a
   security one— but the back door that point 1 of F0-15 closed is still ajar
   in another shape. Decide whether it is also tied to the author (the
   `revert-*` branch is created by whoever presses the button, who is someone
   with write permission) or accepted, and write it down where it can be read.
2. **Operational regression with Dependabot, not written down.** The exemption
   now requires a `GITHUB_ACTOR` ending in `[bot]`. If a person pushes a commit
   to a `dependabot/...` branch, the actor is that person and the branch fails
   the format: CI red on a legitimate branch. With the previous prefix it did
   not happen. The decision is deliberate and correct, but it is not written
   down in the plan or in the JSDoc.
3. **The allow list of control 8 is cut at the first full stop.** The pattern
   `/Sí puedes usar los de sólo lectura:([\s\S]*?)\./` silently truncates the
   list if someone adds to §1 a `git log --format=%h` or any command with a
   full stop. It fails loudly, which is the safe direction, but the message
   points to the wrong place and is hard to diagnose.

4. **Control 8 does not have a single automatic test.** It has been validated
   with nine mutants by hand, in two reviews. It is the textbook argument of
   point 4 of F0-15 —inline logic inside a script that ends in `process.exit`—
   applied to the control born from that same review, and the new error path
   (the `git` whose subcommand cannot be read) has no test either. The solution
   is already proven in F0-15: move the body to a pure function, in its own
   module, and cover it with the mutants that are run by hand today.

5. **Cosmetic.** The message of the minimum assertion says "1 of the 1 tasks".

**What becomes a mechanical control:** 1, 3 and 4, with tests. Point 2 is a
note: no control can see that a bot branch has stopped being one because a
person pushed to it.

**Acceptance criteria:**
- The decision of point 1 is written down, and if it is tied to the author
  there is a test that rejects `revert-1-develop` from an author without
  permission.
- Point 2 is written down in the JSDoc of `branchExemption`.
- Adding to §1 a command with a full stop does not truncate the allow list, and
  there is a test that pins it.
- Control 8 lives in its own module with tests that cover, at least, the nine
  mutants already tried by hand: command in prose, in a block, in a table, with
  `-C` and with `-c`, allowed with `=`, unreadable subcommand, `gitlab`/`legit`
  which are not commands, and the §1 list cut short.

---

### [ ] F0-26 — Validation and detection: `doctor`, branch names and `branches`
**Branch:** `fix/f0-branch-config-validation` · **Depends on:** F0-15

**Origin:** points 3, 4, 5 and 7 of the reviews of PR #7, split from F0-24 (see
there why it was split). The four are the same failure with four faces: **the
tool looks at a piece of data, does not understand it, and carries on as if
nothing happened.**

**Work:**
1. `doctor` treats every PR as reviewed with `branches-ignore` or `paths` in
   `pull_request`, and warns falsely with `on: pull_request` and
   `on: [push, pull_request]`.
2. With a branch called `chore`, `apply` fails after confirming with a raw git
   error (`refs/heads/chore' exists`). It writes nothing, but the prior check
   does not detect it.
3. A non-text value in `branches` (`release: 2024`) is discarded without a
   warning.
4. `ciPushBranches` deduplicates case-insensitively, and GitHub filters are
   case-sensitive: `integration: prod` and `release: Prod` leave `Prod` out.

**What becomes a mechanical control:** one test per point.

**Acceptance criteria:**
- There is a test for each of the four points, and it fails when its fix is
  reverted.
- No value in `branches` is silently discarded: it is either used or warned
  about.

---

### [x] F0-27 — Run `check:mutations` in CI
**Branch:** `ci/f0-mutation-job` · **Depends on:** F0-15

**Origin:** point 8 of the reviews of PR #7, split from F0-24 (see there why it
was split). It goes alone because it does not touch product code: it is
infrastructure, and mixing it with behaviour fixes forces two different things
to be reviewed in the same PR.

**Work:** `pnpm check:mutations` does not run in CI, so it is not yet a
control: it depends on someone launching it. Add it as a job, at least on the
PRs that touch `branches.ts`, `context.ts`, `commands.ts` or the CI templates.
That way it stops running inside the assistant's session, which is what takes
the longest (§6.2 of `CLAUDE.md`).

**What becomes a mechanical control:** the job itself, and one more that was
needed when setting it up: the `paths:` filter that decides when it runs is a
list written by hand, and the mutation list grows. If a new mutation touches a
file the filter does not name, the job stops running without turning red —it
does not run, it does not fail—. `check:coherence` derives the list from
`check-mutations.mjs` and compares (`scripts/mutation-paths.mjs`, with its
test).

And a third, from the review: the script reported "detected" for any exit other
than 0, and `spawnSync` returns `status: null` when it cannot launch the process
or the timeout fires. A broken environment —`pnpm` missing, a half-done
`install`, a runner out of memory— produced "30 of 30 detected" in green without
running a single test. Now the verdict is explicit
(`scripts/mutation-outcome.mjs`, with its test) and the battery first runs dry,
without mutating anything.

**Acceptance criteria:**
- `check:mutations` runs in CI and a surviving mutation turns the PR red.
- The job goes in one of its own, with no matrix `if:` (napkin: a matrix `if`
  disappears without failing).

---

### [ ] F0-28 — The `git branch -d` advice after the chosen merge strategy
**Branch:** `fix/f0-delete-branch-advice` · **Depends on:** F0-20

**Origin:** point 6 of the reviews of PR #7, split from F0-24 (see there why it
was split). **It is the one that blocked the whole task:** it cannot be fixed
until F0-20 decides whether to merge with *squash* or with a *merge commit*,
and keeping it inside left the other seven waiting on someone else's decision.

**Work:** the `git branch -d` advice that `isolatedBranchBlocks` prints does
not work after a *squash merge*: git does not recognise the branch as merged
and refuses to delete it, so the message sends the user to a command that
fails. Adjust it to what F0-20 decides.

**What becomes a mechanical control:** a test of the advice text, tied to the
strategy written down in F0-20.

**Acceptance criteria:**
- The command the CLI prints works with the chosen merge strategy.
- There is a test that fails if the advice goes back to the form that does not
  work.

---

### [x] F0-29 — `apply` cannot promise a `rollback` it will not be able to do
**Branch:** `fix/f0-unrevertable-journal` · **Depends on:** F0-24

**Origin:** finding 2 of the fresh-context review of PR #11. **It is a
regression introduced by F0-24**, not an old gap.

**The symptom:** with `--no-branch` and a detached HEAD, `prepareBranch` returns
early, `apply` writes on the detached HEAD and `writtenOnBranch` ends up
`null`. The F0-24 guard always refuses, so that journal can never be reverted.
Before F0-24 that `rollback` worked.

**Already done in F0-24, and not this task:** withdraw the false promise. Step 4
of the success output no longer says "`plumbward rollback` puts everything back
as it was" when the journal cannot be reverted; it says so, and refers to git.
That was repairing a lie the PR itself introduced, not design.

**Work:** decide what `apply` does with that combination, beyond not lying. Two
ways: reject it before writing, or accept it making the cost clear. Storing the
starting commit (F0-30) opens a third and better one: identify the place by
commit instead of by name, so that `rollback` becomes possible again with a
detached HEAD and the regression disappears instead of being documented.

**What becomes a mechanical control:** a test of the decision taken. The
withdrawal of the promise in F0-24 had its own in `rollback-branch.test.ts`;
this task replaces it, because the decision makes the promise true again.

**Decision (third way):** `writtenOnBranch === null` is compared like any other
name. The journal written with a detached HEAD is reverted with a detached HEAD
on the same commit; from a branch it refuses even if the branch points to that
commit, and the message says to go back with `git checkout --detach <commit>`.
Only a journal with no branch **and** no commit —which `apply` does not write—
is still refused. Discarded: rejecting the combination before writing, because
it punishes a legitimate use (CI runs check out detached) to protect what the
commit already protects; and accepting it without `rollback`, because it makes
irreversible what was reverted before F0-24. Written in `assertSameBranch` and
in `docs/ARCHITECTURE.md`.

**Acceptance criteria:**
- The decision is written down, with the discarded alternative and why.
- `apply --no-branch` with a detached HEAD does what that decision says, and
  there is a test that pins it.

---

### [x] F0-30 — The journal identifies the place by commit, not only by name
**Branch:** `feat/f0-journal-commit-identity` · **Depends on:** F0-24

**Origin:** findings 3 and 4 of the fresh-context review of PR #11.

**Why it matters:** F0-24 compares **branch names**, and `revertEntries` writes
blindly as soon as the name matches. A branch deleted and recreated with the
same name on another commit, or work done on the isolated branch after the
`apply`, pass the guard and lose data all the same. The name says where you
are, not whether it is the same place.

**Work:**
1. Store in the journal the commit it wrote on. `readHead` already returns it;
   today it is thrown away.
2. `rollback` compares it as well as the name, and refuses if the place has
   changed.
3. Also store the starting commit. Today, if it started with a detached HEAD,
   the notice says `git checkout <commit>` and leaves the user to fill in a gap
   they cannot fill: the commit is known in `runApply` (`headBefore.commit`)
   and is not stored.

**What becomes a mechanical control:** one test per point; the one for point 2
deletes and recreates the branch on another commit.

**Acceptance criteria:**
- `rollback` refuses on a branch with the same name created on another commit,
  and there is a test that reproduces it.
- The notice to go back names the starting commit instead of `<commit>`.

---

### [ ] F0-31 — Write down the `readJournal` contract
**Branch:** `docs/f0-read-journal-contract` · **Depends on:** F0-24

**Origin:** finding 5 of the fresh-context review of PR #11.

**Work:** `readJournal` is exported in `packages/core/src/index.ts` and now
throws `OutdatedJournalError` where it used to return the journal. The
direction is the safe one, but it is a change to a public API contract. Today
the only consumer is `rollbackLastApply`; write it down in the JSDoc before
there is another.

**What becomes a mechanical control:** nothing by itself. No control can see
that a future consumer expected the old contract; the defence is that it is
written where it is read.

---

### [ ] F0-32 — Follow-ups from the review of the F0-27 PR
**Branch:** `fix/f0-mutation-control-followups` · **Depends on:** F0-27

**Origin:** fresh-context review of the F0-27 PR. The three blockers —constants
with a digit invisible to the control, a green verdict without running a test,
and the filter read from the wrong `paths:` block— were fixed inside the PR.
These are the non-blocking ones (§6.4 of `CLAUDE.md`).

They all share one shape: the mutation control measures with its own parsers
—regular expressions over YAML and over JavaScript— and every gap in the parser
is a green that means nothing.

**Work:**
1. **High priority.** The control forbids the emergency exit that the workflow
   itself documents: `mutations.yml` warns that, if the job enters the ruleset,
   the `paths:` filter has to be removed; with no filter, `workflowPaths`
   returns `[]` and `check:coherence` turns red with fifteen files not covered.
   A workflow with no filter always runs and is strictly safer: "there is no
   filter" has to be told apart from "the filter leaves files out".
2. Two mutants survive `scripts/mutation-paths.test.mjs`: removing
   `if (sangria(line) <= indent) break` and changing `if (!entrada) break` to
   `continue`. In both cases the test passes because another path cuts the list
   all the same. The difference between truncating the list and skipping a
   malformed entry is losing one path or losing all of them.
3. The `readdirSync` of the workflows directory ended up inside the `try` that
   diagnoses network failures: if `.github/workflows` cannot be read, the whole
   of control 4 is disabled while printing "the remote branches could not be
   listed", which is false.
4. `mutationInputs` reads `TESTS` with `/const TESTS = \[([\s\S]*?)\]/`: a
   commented-out path inside the array counts as a file —it demands in the
   filter something that no longer runs, a false red— and a `]` inside a comment
   cuts the array and silently loses the paths after it —a false green—.
5. In the workflow filter, an entry in double quotes is returned with the
   quotes inside, and a comment at the end of the line cuts the list there.
   Both fail towards red, but they blame the wrong file.
6. Control 1b (`if: matrix.node`) still looks only at `ci.yml`, while control 4
   started walking the directory in F0-27. A future workflow with a matrix
   would not have that control. It does not hurt today: `mutations.yml` has no
   matrix.

**Not mechanisable, and that is why it is written here:** the filter covers the
files that are mutated, not all the ones that can make a mutation survive. The
`TESTS` import production code that is not in the filter
—`packages/core/src/`, `packages/cli/src/apply.ts`—, so a change there can leave
a mutation alive without the job ever running. It meets what F0-27 asks —"at
least" those PRs—, but the derived control gives an impression of completeness
it does not have. Really closing it requires the import graph, not a list.

**What becomes a mechanical control:** points 1 to 6, each with its test. The
previous paragraph, no: it stays written where it is read.

**Acceptance criteria:**
- Removing the `paths:` filter from `mutations.yml` leaves `check:coherence`
  green.
- The two mutants of point 2 die: `pnpm check:mutations` is not the control of
  this file, so they are checked by hand by mutating and running.
- There is a test for each of points 3 to 6, and it fails when its fix is
  reverted.

**Acceptance criteria:**
- The JSDoc of `readJournal` says what it throws and in which cases.

---

### [ ] F0-33 — The notice with no commit at all describes an impossible state
**Branch:** `fix/f0-unreachable-notice-branch` · **Depends on:** F0-30

**Origin:** finding 3 of the fresh-context review of the F0-30 PR.

**Work:** `returnToCommit` has a branch for `startedOnCommit === null` that
cannot be reached from the CLI: `startedOnBranch === null` means a detached
HEAD, and detaching requires a commit to exist; in a repository with no commits
the scanner returns the name of the unborn branch, not `null`. The two call
sites derive branch and commit from the same read of HEAD, so the pair
`(null, null)` does not happen. It only exists in a test that builds it by hand.
Decide between making it impossible through types or justifying why it stays.

**What becomes a mechanical control:** if it is removed, its test goes with it;
if it stays, a test that triggers it through the real path.

**Acceptance criteria:**
- No live code remains that only a test can run.

---

### [ ] F0-34 — The e2e reverts with a commit the repository does not have
**Branch:** `test/f0-e2e-journal-commit` · **Depends on:** F0-30

**Origin:** finding 4 of the fresh-context review of the F0-30 PR.

**Work:** the e2e writes the journal with `writtenOnCommit: null` and reverts
with `currentCommit: null` on a repository that does have commits: a
combination that does not happen in production. `assertSameCommit` passes
through `null === null` and exercises nothing. It is napkin point 3 —data that
makes the mutation invisible— in the only test that claims to cover the full
cycle.

**What becomes a mechanical control:** pass the real commit of the test
repository and check that mutating the commit check kills the test.

**Acceptance criteria:**
- The e2e uses the real commit in `applyPlan` and in `rollbackLastApply`.
- Removing `assertSameCommit` turns the e2e red.

---

### [ ] F0-35 — Write down the contract changes of journal v3
**Branch:** `docs/f0-journal-v3-contract` · **Depends on:** F0-30, F0-31

**Origin:** finding 5 of the fresh-context review of the F0-30 PR.

**Work:** F0-30 changed the public surface exported in
`packages/core/src/index.ts` three times: `ApplyOptions.writtenOnCommit` and
`RollbackOptions.currentCommit` are new required fields, and `Journal.version`
went from 2 to 3, so `readJournal` throws `OutdatedJournalError` where it used
to return a v2 journal. F0-31 only covers the JSDoc of `readJournal`. Write all
of it down, with the journal versioning policy.

**What becomes a mechanical control:** nothing by itself, just as in F0-31: no
control sees what an external consumer expected. The defence is that it is
written where it is read.

**Acceptance criteria:**
- The JSDoc of the exported types says which fields are new and since when.

---

### [ ] F0-36 — The commit mutation is named after something other than what it mutates
**Branch:** `fix/f0-mutation-name-collision` · **Depends on:** F0-30

**Origin:** finding 6 of the fresh-context review of the F0-30 PR.

**Work:** the `Comparar sólo la rama, no el commit` entry of
`scripts/check-mutations.mjs` predates F0-30 and mutates `headMoved`, not
`assertSameCommit`. Whoever reads the list will conclude that the journal guard
is covered by the battery, and it is not: the battery does not mutate
`packages/core/`. Rename it, and decide whether the journal guard enters the
battery —which drags along the `paths:` filter of `mutations.yml`— or is left
out saying so.

**What becomes a mechanical control:** the entry itself, if it is added.

**Acceptance criteria:**
- No mutation name describes a piece other than the one it mutates.

---

### [ ] F0-37 — A pending v2 journal is left without `rollback`
**Branch:** `fix/f0-v2-journal-remedy` · **Depends on:** F0-30

**Origin:** finding 7 of the fresh-context review of the F0-30 PR.

**Work:** whoever updates the CLI with an unreverted v2 `apply` loses
`plumbward rollback`: `readJournal` throws `OutdatedJournalError`. The direction
is the safe one and it is documented, but it withdraws a capability that for a
v2 was still possible by branch name, which is the level F0-24 accepted. And the
remedy the error suggests, `git checkout -- .`, does not delete the new
untracked files the `apply` created —an earlier defect, which now reaches many
more cases—. Decide what is offered to those journals and fix the remedy.

**What becomes a mechanical control:** a test of the remedy that leaves the
tree really clean, checked with `git status --porcelain`.

**Acceptance criteria:**
- The error text leads to a clean tree, untracked files included.
- The decision about v2 journals is written down, with the discarded
  alternative.

---

### [ ] F0-38 — `rollback` does not check that the files are still the ones `apply` left
**Branch:** `fix/f0-rollback-content-check` · **Depends on:** F0-29

**Origin:** findings 1 and 2 of the fresh-context review of PR #14 (F0-29).
They predate F0-29: they happen all the same with journals written on a branch.

**The symptom:** the branch and the commit say where it was written, not whether
the tree is still as `apply` left it. Two cases verified with real git:
- After `apply`, `git switch -c rescue` and an uncommitted edit. `rollback`
  refuses and says to go back to the place with `git checkout`; the checkout
  carries the edit along, and the `rollback` there overwrites it.
- After `apply`, `git switch -c work` and a commit of the governance files. On
  going back to the place, `rollback` prints "Reverted N operations" and the tree
  is left clean, but the governance files are still on `work`: it has reverted
  nothing.

**Work:** store in the journal a hash of what `apply` left in each file and
refuse, without writing, if the current content does not match. Also decide the
order of the checks, so the message talks about the real reason and does not
send the user to a place from which `rollback` is not correct either. It changes
the journal format: see F0-35 and F0-37.

**What becomes a mechanical control:** the two scenarios above as tests with
real git, checking the content of the files afterwards.

**Acceptance criteria:**
- `rollback` does not overwrite any file whose content differs from what
  `apply` left, and in that case it keeps the journal.
- Following the advice of a `rollback` message never leads to lost work nor to
  a "Reverted" that reverts nothing.

---

### [ ] F0-39 — `rollback` messages without tests and two different go-back advices
**Branch:** `fix/f0-rollback-message-coverage` · **Depends on:** F0-29

**Origin:** findings 4 and 5 of the fresh-context review of PR #14 (F0-29).

**Work:**
- No test pins the text of `assertSameCommit` for a journal written with a
  detached HEAD ("HEAD is still detached…"): swapping the two `cause` texts
  would pass the battery.
- `branch-notice.ts` advises `git checkout <sha>` and `rollback.ts`,
  `git checkout --detach <sha>`. They do the same; choose one form.

**What becomes a mechanical control:** a test of the message with a detached
journal and another that pins the chosen form in both places.

**Acceptance criteria:**
- Swapping the two `cause` texts in `assertSameCommit` makes a test fail.
- Both messages advise going back to a commit with the same command.

---

### [x] F0-40 — An execution queue that decides the next task
**Branch:** `chore/f0-execution-queue` · **Depends on:** nothing

**Origin:** developer decision of 2026-09-13. Choosing the next task depended on
each session proposing it and someone confirming it: a cost every time, and two
sessions could reach different answers.

**Work:** an ordered queue of all pending tasks in §5, with the ordering
criteria written down. Whoever asks about the state of the plan or the next task
gets the same answer: the first one in the queue. Changing a priority is moving
an entry, with its reason. `CLAUDE.md` §0 says so.

**What becomes a mechanical control:** `scripts/execution-queue.mjs`, wired into
`check:coherence` and covered by `scripts/execution-queue.test.mjs`. It fails if
a pending task is not in the queue, if a completed one is still there, if there
are duplicates or non-existent identifiers, or if a task comes before a pending
dependency, including those of "Phase N complete".

**Not mechanisable:** that the order is the best one. The control guarantees it
is complete and possible, not that it is sensible; that is defended by the
criteria written in §5 and by the review.

**Acceptance criteria:**
- The first entry in the queue is the next task, with no need to propose it.
- Creating a task without placing it, or closing one without removing it, turns
  CI red.

---

### [x] F0-41 — English as the main language: the control and the assistant instructions
**Branch:** `chore/f0-english-only-control` · **Depends on:** F0-40

**Origin:** developer decision of 2026-09-13. The whole repository moves to
English: assistant instructions, plan, documentation, comments, tests and what
the product generates by default. It is the industry convention, the one our
clients' teams follow, and it saves tokens: every session reads `CLAUDE.md`, the
runbook and parts of the plan, and Spanish spends more tokens for the same
information. It widens F0-16 and F0-18, which only covered names and
documentation, and opens F0-42 to F0-45.

**Work:**
1. **The control first, so no new Spanish gets in.** A check in
   `check:coherence` —pure logic in `scripts/`, with its test— that detects
   Spanish in versioned files (comments, strings, Markdown, YAML), reusing the
   unambiguous words of `branch-names.mjs` plus the characters specific to
   Spanish (`ñ`, `¿`, `¡`, accented vowels). With two explicit lists:
   - **Pending translation:** the files that have Spanish today. Each task of the
     block removes its own. A file outside the list with Spanish fails, and so
     does one on the list that no longer has any, so the list does not go stale.
   - **Permanent exceptions, each with its reason:** what must stay in Spanish,
     such as the `es` variant of what is generated for the client or the word
     corpus of `branch-names`.
2. Translate `CLAUDE.md`, `.claude/napkin.md` and
   `.github/PULL_REQUEST_TEMPLATE.md`, and revert in them the rules that fix
   Spanish for prose and comments. They are the ones read in every session.

**What becomes a mechanical control:** the check of point 1.

**Not mechanisable:** the fidelity of the translation. An English text that says
something other than the original passes the control; the defence is the
fresh-context review of each translation PR, comparing with the original.

**Acceptance criteria:**
- Adding a Spanish comment or paragraph to a file that is on neither list turns
  `check:coherence` red.
- A file on the pending list that is already in English also turns it red.
- `CLAUDE.md`, the runbook and the PR template are in English and set English as
  the language of the whole repository.

---

### [x] F0-42 — The execution plan in English
**Branch:** `docs/f0-english-plan` · **Depends on:** F0-16, F0-48

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
3. Register the Spanish literals the plan keeps as fragment exceptions (F0-48),
   and remove the plan from the F0-41 pending list.
4. Because of its size, over several sessions: one batch per part of the plan,
   each with its own commit on the same branch and `pnpm check:coherence` green.
   It is still one task, in two PRs: the translation is merged first, so that
   F0-48 starts from a `develop` that has its own plan entry; the close goes in
   a second PR from the same branch name, once F0-48 is merged.

**Progress:**
- [x] Batch 1: the format read by the two controls, across the whole plan
  (`**Branch:**`, `**Depends on:**`, `**Blocks:**`, `Phase N complete`,
  `<!-- queue:start -->`); header, §1 to §4, this task, and §5 to §7.
- [x] Batch 2: Phase 0, first half (F0-1 to F0-20).
- [x] Batch 3: Phase 0, second half (F0-21 to F0-46).
- [x] Batch 4: Phases 1 to 6.
- [x] Close, after F0-48: the kept literals registered as fragment exceptions,
  and the plan out of the pending list.

**What becomes a mechanical control:** the F0-41 one over the plan, and the
tests of the two parsers with the new format. The queue control also fails
when a task has no dependency line it recognises: before, a marker the parser
did not know read as "no dependencies", and a broken order passed.

**Acceptance criteria:**
- The plan contains no Spanish outside the declared exceptions.
- Breaking a dependency in the translated queue, or a branch name, turns CI red.

---

### [x] F0-43 — Core comments and tests in English
**Branch:** `refactor/f0-english-comments-core` · **Depends on:** F0-16

**Origin:** F0-41. Split from F0-44 so each PR can be reviewed in full.

**Work:** translate comments, JSDoc and `describe` and `it` descriptions in
`packages/core`, `packages/ast`, `packages/scanner` and `packages/packs-sdk`.
The texts that reach the user, even when thrown from the core
(`RollbackError`), belong to F0-45. Remove the files from the F0-41 pending
list.

**What becomes a mechanical control:** the F0-41 one over these packages.

**Acceptance criteria:**
- No file in those packages contains Spanish outside the declared exceptions
  and the texts left for F0-45.
- No behaviour changes: `pnpm typecheck` and their tests stay green.

---

### [x] F0-44 — CLI, packs and scripts comments and tests in English
**Branch:** `refactor/f0-english-comments-cli` · **Depends on:** F0-16

**Origin:** F0-41. The other half of F0-43.

**Work:** translate comments, JSDoc and test descriptions in `packages/cli`,
`packages/packs/`, `scripts/`, `.github/workflows/` and the root configuration.
The content generated for the client belongs to F0-45. Remove the files from
the F0-41 pending list.

**What becomes a mechanical control:** the F0-41 one over these files.

**Acceptance criteria:**
- No file in those paths contains Spanish outside the declared exceptions and
  the texts left for F0-45.
- No behaviour changes: `pnpm typecheck`, their tests and `check:mutations`
  stay green.

---

### [x] F0-45 — The product speaks English by default
**Branch:** `feat/f0-english-default-language` · **Depends on:** F0-41

**Origin:** F0-41. Clients follow the same convention by default. The product
is still bilingual —business decision of 2026-09-08—: Spanish is chosen in the
profile, not withdrawn. The wizard (F4-1) asks the company for the language.

**Work:**
1. CLI messages and errors that reach the user (`RollbackError`, branch
   notices, `doctor`...) in English. The CLI stays English-only until F1-3
   makes it bilingual.
2. `Profile.language` defaults to `en` —today `es` in
   `packages/packs-sdk/src/contract.ts`—, and with it the files the Node pack
   generates.
3. What today only exists in Spanish for the client is written in English, and
   the Spanish variant is kept behind `language: es`. Moving it to catalogues is
   F1-2.
4. Update the tests that compare texts and register the `es` variant as an
   exception of the F0-41 control.
5. The job ids of the workflows the Node pack generates (`calidad`, `secretos`,
   `gobernanza` in `packages/packs/node-ts/src/templates/ci.ts`) go to English,
   in both languages: they are identifiers, not text. Keep the check names that
   `workflow-checks.ts` derives from those workflows in step. Found in the
   review of F0-16: with no accent and no listed word, the Spanish-text test
   below does not see them.
6. Inventory the Spanish texts that reach the user and that the F0-41 control
   does not see, because they carry no accent and no listed word, in
   `packages/core`, `packages/ast`, `packages/scanner` and
   `packages/packs-sdk` (`plan.ts`, `registry.ts`, `apply.ts`, `json.ts`,
   `yaml.ts`, `rollback.ts`, `conformance.ts`, `maturity.ts`), and in
   `packages/cli` and `packages/packs/node-ts` (`commands.ts:91`, `:96`,
   `:231`, `:233`; `index.ts:24`, `:36`; `workflow-checks.ts:100`, `:103`; the
   `config.yml` header lines in `context.ts`), and translate them with the
   rest. Found in the reviews of F0-43 and F0-44 (PR #24): only the literals
   with an accent or a listed word were declared as fragments, so the fragment
   list is not the whole inventory.
7. Update the header of `packages/ast/src/yaml.ts`, which says the generated
   YAML carries explanatory comments in Spanish: they follow the language of
   the profile.

**What becomes a mechanical control:** a test that generates with the default
profile and fails if Spanish appears, and another that with `language: es`
still generates Spanish. Plus a test that fails if a job id of a generated
workflow looks Spanish, with the same heuristic as the file-name control of
F0-16.

**Result (2026-09-15):**
- CLI messages and errors in English, including `describeOperation` in
  `packages/core/src/apply.ts` (`crear`, `parchear`, `ejecutar`), which the
  item 6 inventory had missed: it was found by scanning string literals for
  unaccented Spanish words, not by the fragment list.
- `Profile.language` defaults to `en`. Everything the Node pack writes into the
  client repository has an English variant and keeps the Spanish one, verbatim,
  behind `language: es`: AI rules, `GOVERNANCE.md`, workflows, hooks, Makefile,
  tool configurations, ESLint config, `package.json` scripts, the `.gitignore`
  block and the `config.yml` header, whose `language` line now says English is
  the default. Operation reasons and health checks are CLI output: English only.
- The managed-file header and the managed-block warning, which `plan` and
  `apply` add on their own, follow the profile too. `ChangePlan` carries
  `language`, so no caller passes it and both commands write the same text.
- Job ids of the generated workflows are `quality`, `secrets`, `governance` and
  `deploy` in both languages. Required checks come from the job `name`, which
  did not change in the Spanish variant, so an existing ruleset keeps working.
  `workflow-checks.ts` reads only the triggers, so it needed no change. The
  gitleaks rule ids and tags are identifiers as well and went to English in both
  languages; a client that regenerates `.gitleaks.toml` sees the findings its
  `.gitleaksignore` silenced under the old ids again, which fails towards more
  protection.
- Item 7: the header of `packages/ast/src/yaml.ts` already said the comments
  follow the language of the profile; no change.
- Controls: `packages/packs/node-ts/src/language.test.ts` fails if the default
  profile generates Spanish, if a file has no Spanish with `language: es`, if
  the pack writes something listed neither as bilingual nor as textless, if a
  job id differs between languages or looks Spanish to `spanishNameEvidence`,
  and if the plan does not carry the profile language.
  `packages/core/src/language.test.ts` checks the header and the block warning
  in `plan` and `apply`; `packages/ast/src/blocks.test.ts` and
  `packages/cli/src/context.test.ts` check their own texts. Every language
  dispatch and every point that passes the language on was mutated (51
  mutants): all detected.
- Not mechanisable: the Spanish detection sees accents and a short word list, so
  an English variant with unaccented Spanish passes; the name heuristic misses
  `secretos` and `desplegar`, and the equality between languages does not help
  if both are Spanish. CLI output has no language test beyond the repository
  control, which sees accents and listed words. For those, the defence is the
  fresh-context review.

**Acceptance criteria:**
- With no language configured, the CLI and the generated files are in English.
- With `language: es`, what is generated for the client stays in Spanish.
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

### [x] F0-47 — Hand over the next-session prompt without being asked
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

### [x] F0-48 — Exceptions by text fragment in the English control
**Branch:** `chore/f0-english-fragment-exceptions` · **Depends on:** F0-41

**Origin:** batch 4 of F0-42, 2026-09-13. `scripts/english-only.json` only
excuses whole files, and the plan keeps Spanish on purpose: closed branch
names, former check names, pre-rename identifiers, a real mutation entry name,
the characters the detector looks for. Taking the plan out of the pending list
turns `check:coherence` red. The two alternatives were discarded:
- Listing the whole plan as an exception: the control would stop reading the
  most read file after `CLAUDE.md`, and a new Spanish paragraph would pass.
- Rewriting the literals in English: they are facts, and F0-42 changes the
  language, not the facts.

**Work:**
1. An entry of `exceptions` may declare `fragments`: exact literals allowed in
   that file. The file is scanned with those literals removed, and any other
   Spanish fails as today. An entry without `fragments` still excuses the
   whole file.
2. A space in a fragment also matches a line break and its indentation: a
   literal the text wraps across two lines, like the former e2e check name in
   F0-13, is declared once.
3. The staleness rule reaches fragments: one that no longer appears in its
   file, or that contains no Spanish, fails.
4. A fragment shorter than ten characters fails: it would excuse one word
   everywhere in the file instead of one literal.
5. Document the format in the header of `scripts/english-only.mjs`.

**What becomes a mechanical control:** each rule above is a test in
`scripts/english-only.test.mjs` that fails against the F0-41 code.

**Acceptance criteria:**
- Spanish outside the declared fragments of a file turns `check:coherence` red.
- A fragment missing from its file, with no Spanish, or under ten characters
  turns it red.
- Every Spanish literal batches 2 and 3 of F0-42 kept in the plan can be
  declared as a fragment, the one wrapped across two lines included, without
  excusing the prose around it.

---

### [ ] F0-49 — Heading anchors in the link control, and fragment escapes documented
**Branch:** `fix/f0-anchor-links-fragment-escapes` · **Depends on:** F0-16, F0-48

**Origin:** fresh-context review of PR #22 (F0-18), 2026-09-13, and the batches
of F0-18. Two gaps in the controls the English block relies on:
- `scripts/doc-links.mjs` skips the anchor of a link. The F0-18 criterion "no
  internal link is broken" was checked by hand for anchors: a translation
  renames headings, and every `#anchor` pointing at them breaks without failing
  anything.
- The fragments in `scripts/english-only.json` are written with `\u` escapes,
  and nothing says why or how to edit them without losing them. The message the
  control prints for a file with Spanish only offers translating it or listing
  the whole file, not declaring a fragment. And `check:coherence` prints its
  verdict in Spanish.

**Work:**
1. `scripts/doc-links.mjs`: check the anchor of a link to a Markdown file
   against the headings of that file, same-file `#anchor` links included, with
   the slug rules GitHub renders: lowercase, punctuation removed except `-` and
   `_`, each space a hyphen (`# ADR 0001 — Separate the plan` is
   `#adr-0001--separate-the-plan`), and `-1`, `-2` for repeated headings.
   Headings inside code are not anchors; an explicit `<a id="…">` is. An anchor
   on a non-Markdown target (`#L42`) is still skipped.
2. Update the scope described in the header of `scripts/doc-links.mjs`.
3. Header of `scripts/english-only.mjs`: why fragments are written with `\u`
   escapes (`english-only.json` goes through the control itself), that the
   control compares the decoded text, and how to edit the list without undoing
   them (edit the line; never rewrite the file with `JSON.stringify`).
4. The message for a file with Spanish (`scripts/english-only.mjs`, "translate
   it, or list the file") also offers a fragment in an exception, for a literal
   kept on purpose.
5. `scripts/check-coherence.mjs`: the two verdict lines ("Coherencia: …") in
   English. Only those output strings; the comments of the file stay in F0-44.

Goes after F0-46 in the queue: both change `doc-links.mjs` and
`english-only.mjs`.

**What becomes a mechanical control:** items 1 and 4 are tests in
`scripts/doc-links.test.mjs` and `scripts/english-only.test.mjs` that fail
against the current code. Item 3 is prose and not mechanisable, but a lost
escape already fails: the decoded Spanish lands in `english-only.json`, which is
neither pending nor an exception. Item 5 is not covered by the English control:
both verdict lines carry no accent and no listed word, so `findSpanish()`
returns `undefined` for them (fresh-context review of PR #24). Item 5 is its
own test, which runs `check-coherence.mjs` and fails if either verdict line is
not the English one.

**Acceptance criteria:**
- A link to a heading that does not exist, in another file or in the same one,
  turns `check:coherence` red; `README.md` `#development` still passes.
- A repeated heading is reachable with its `-1` suffix; a heading inside a code
  fence is not an anchor; `file.ts#L42` is not reported.
- The failure message for a file with Spanish names the fragment option.
- `pnpm check:coherence` prints its verdict in English.

---

## PHASE 1 — Internationalisation of the template engine

**Objective:** make `Profile.language` really work.
**Estimate:** 1-2 work sessions.
**Why now and not later:** today there is **one** pack to translate. After
Phase 2 there will be five. The cost of this refactor is multiplied by five if
it is postponed, and it is exactly the kind of debt the product claims to fight.
**Phase exit criterion:** `language: en` in the config produces a repository
entirely in English, with the same file structure as `language: es`.

---

### [ ] F1-1 — `@plumbward/i18n` package
**Branch:** `feat/f1-i18n-package` · **Depends on:** Phase 0 complete

**Work:**
1. New package with a typed catalogue: the `en` keys derive from the type of
   the `es` catalogue, so that **a missing translation is a compile error**.
2. Minimum API: `translator(language)` returns a function `t(key, values)`
   with typed interpolation.
3. Support for long text blocks (the comment headers of the generated files),
   not only short strings.
4. Decide and document the key convention: `pack.nodeTs.eslint.header`.

**Acceptance criteria:**
- Adding a key to `es` without adding it to `en` breaks `pnpm typecheck`.
- The package depends on no other package of the monorepo (it is a leaf).

---

### [ ] F1-2 — Migrate the Node/TS pack to the catalogues
**Branch:** `refactor/f1-node-ts-i18n` · **Depends on:** F1-1

**Work:**
1. Extract all the Spanish text in `packages/packs/node-ts/src/templates/*`
   (CI, AI rules, tooling, docs) to the catalogue.
2. Translate it into English.
3. Also translate the `reason` of each operation: it is what the user reads in
   `plumbward plan`, the most important screen of the product.

**Acceptance criteria:**
- Not one Spanish literal outside the catalogue (a lint rule that checks it, if
  viable; if not, a documented manual review).
- The files generated in English are idiomatic, not a literal translation.

---

### [ ] F1-3 — CLI messages in both languages
**Branch:** `refactor/f1-cli-i18n` · **Depends on:** F1-1

**Work:**
1. Migrate [render.ts](../packages/cli/src/render.ts) and
   [commands.ts](../packages/cli/src/commands.ts) to the catalogue.
2. Language resolution, in order of precedence:
   `--lang` → `.governance/config.yml` → system `$LANG` → `es`.
3. `plumbward scan` must be able to choose the language **before** a config
   exists.

**Acceptance criteria:**
- `plumbward scan --lang en` on an unconfigured repo comes out entirely in
  English.

---

### [ ] F1-4 — Parity test between languages
**Branch:** `test/f1-language-parity` · **Depends on:** F1-2, F1-3

**Why:** the real risk of i18n is not translating badly, it is the plan
**doing different things** depending on the language. That would break
determinism.

**Work:**
1. A test that generates the plan with `es` and with `en` over the same test
   repo and compares: same number of operations, same paths, same order, same
   commands. Only the textual content may differ.
2. A test that checks that no translation was left empty or equal to its key.

**Acceptance criteria:**
- If someone adds an operation conditioned by language, the test fails.

---
### [ ] F1-5 — Provenance: each rule cites its source
**Branch:** `feat/f1-rule-provenance` · **Depends on:** F1-1

**Why in this phase:** it is the same lesson as i18n. Today there is one pack;
after Phase 2 there will be five, and adding a mandatory field to the contract
with five packs written costs five times more.

**Why it matters commercially:** it defuses the objection *"why should I trust
your standards?"*. The answer becomes: **no rule is our opinion, each one cites
the official documentation and the version it relies on**. And it gives the AI
assistant a verifiable source instead of an assertion, which is the difference
between it applying the rule and making it up.

**Work:**
1. Add to the `packs-sdk` contract a provenance structure: URL of the official
   documentation, tool version and date it was checked.
2. Make it mandatory for the generated security and style rules; optional where
   it is a convention of our own, and in that case **say so explicitly** in the
   generated file.
3. The conformance suite rejects a security rule without provenance.
4. `doctor` warns when a source has gone more than a year without review.

**Acceptance criteria:**
- The generated rule files cite their source next to each rule.
- A pack with a security rule without provenance does not pass conformance.

---

## PHASE 2 — Stack coverage

**Objective:** the tool **never** ends up doing nothing, whatever the
repository.
**Estimate:** 4-6 work sessions. It is the longest phase and the one with the
highest commercial return.
**Why it matters:** today, a repo that is not Node gets a blocking conflict and
zero value. That is a failed demo in front of a client. With this phase, the
addressable market goes from "JavaScript agencies" to "any team".
**Phase exit criterion:** `plumbward apply` produces real value on Node,
Python, PHP/Laravel and Go repos, and on one with an unsupported stack.

---

### [ ] F2-1 — Multi-stack detection in the scanner
**Branch:** `feat/f2-scanner-multistack` · **Depends on:** Phase 1 complete

**Current state:** [stack.ts](../packages/scanner/src/stack.ts) only recognises
`node-ts` and `go`.

**Work:**
1. Add detectors, each with its evidence and its confidence level:
   - **Python** — `pyproject.toml` (and inside it: Poetry / uv / PDM /
     setuptools), `requirements.txt`, `Pipfile`. Frameworks: FastAPI, Django,
     Flask.
   - **PHP** — `composer.json`. Frameworks: Laravel (`artisan`), Symfony.
   - **Java/Kotlin** — `pom.xml`, `build.gradle(.kts)`. Spring Boot.
   - **.NET** — `*.csproj`, `*.sln`.
   - **Ruby** — `Gemfile`. Rails.
   - **Rust** — `Cargo.toml`.
2. A repo can return **several** stacks: polyglot is the norm, not the
   exception (a Django backend with a Next.js frontend).
3. Extend `LanguageStat` and the SLOC count to the new extensions.
4. Extend the maturity report with per-language signals (`ruff`/`phpstan`/
   `golangci-lint` are already considered in
   [maturity.ts](../packages/scanner/src/maturity.ts); review Java and .NET).

**Acceptance criteria:**
- Tests with a sample `package.json` for each manager and framework listed.
- A Django + Next.js repo returns two stacks, ordered by real SLOC.
- The scanner still writes nothing to disk (invariant).

---

### [ ] F2-2 — Universal fallback pack
**Branch:** `feat/f2-pack-base` · **Depends on:** F2-1

**Why it is the most profitable task of the phase:** it covers at once *every*
stack with no pack of its own, and gives immediate value in any repository in
the world. It is what turns an "unsupported" into a sale.

**Work:**
1. A `base` pack that **always** applies, with low confidence (0.1) so that it
   is never the main pack.
2. It contributes what does not depend on the language:
   - Secret scanning with Gitleaks (config + workflow).
   - `.editorconfig`, `.gitattributes`.
   - `CODEOWNERS`, `SECURITY.md`, PR and issue templates.
   - `.env.example` derived from the variables the scanner finds in the code.
   - Generic AI context rules (`AGENTS.md`) built from the scan: detected
     stacks, structure, commands.
   - Dependency updates (Dependabot/Renovate) according to the detected
     ecosystems.
3. Remove from [registry.ts](../packages/packs-sdk/src/registry.ts) the
   blocking "no stack has been recognised" conflict: it can no longer happen.

**Acceptance criteria:**
- `plumbward apply` on a repo in a language with no pack (e.g. Elixir)
  installs secret scanning, CODEOWNERS and AI rules, and does not fail.
- The `base` pack never duplicates what a specific pack already contributes
  (checked by the `PlanBuilder`, which must report a conflict if it happens).

---

### [ ] F2-3 — Reusable conformance test kit
**Branch:** `test/f2-conformance-kit` · **Depends on:** F2-2

**Why before writing four packs:** without this, each pack is tested in a
different way and quality diverges. And when we open the catalogue to third
parties (the scaling axis of the business), this suite is the only thing that
stops a badly written pack from wrecking a client's repository.

**Work:**
1. `@plumbward/pack-testkit` package.
2. `describePackConformance(pack, scenarios)`: a standard battery that runs
   `checkPackConformance` over several synthetic repos and also checks:
   - **Idempotence**: applying twice produces no changes the second time.
   - **Reversibility**: `apply` + `rollback` leaves the repo byte for byte
     identical.
   - **Non-destructiveness**: it never overwrites a pre-existing client file
     without declaring it as a conflict.
   - **Respect for the mode**: in `non-disruptive` it does not touch source code
     files.
   - **Language parity**: it generates in `es` and in `en` with the same
     structure.
3. Utilities to build test repos in memory/tmp.
4. Migrate the existing `node-ts` tests to the kit.

**Acceptance criteria:**
- A new pack is validated with fewer than 20 lines of test.
- Deliberately introducing a failure (e.g. overwriting a client file) makes the
  kit fail.

---

### [ ] F2-4 — Python pack
**Branch:** `feat/f2-pack-python` · **Depends on:** F2-3

**Work:**
1. Manager detection: uv → Poetry → PDM → pip, respecting the one the repo
   already uses.
2. It contributes: `ruff` (lint + format), `mypy` (strict or gradual according
   to `strictness`), `pytest` with coverage, `pre-commit`, `bandit` or
   `pip-audit` for security, CI workflows with a matrix of Python versions.
3. Specific AI rules: typing, virtual environment management, project
   structure, and the pattern of the detected framework (FastAPI vs Django).
4. Non-destructive patching of `pyproject.toml` — it requires **TOML support in
   `@plumbward/ast`**, which today only has JSON and YAML. It is the expensive
   part of this task: budget it separately and use a parser that preserves
   comments.

**Acceptance criteria:**
- Passes the conformance kit on repos with Poetry, with uv and with
  `requirements.txt`.
- A `pyproject.toml` with comments and its own formatting keeps both after
  patching.

---

### [ ] F2-5 — PHP / Laravel pack
**Branch:** `feat/f2-pack-php-laravel` · **Depends on:** F2-3

**Why it has high priority despite not being the fashionable stack:** it is the
dominant stack in the segment of **Spanish development agencies**, which is
precisely the buyer of the €4,000 package.

**Work:**
1. Detection of Laravel (`artisan`, `composer.json`) versus Symfony versus plain
   PHP.
2. It contributes: PHPStan or Psalm with a level according to `strictness`,
   Laravel Pint or PHP-CS-Fixer, PHPUnit or Pest, `composer audit`, workflows
   with a PHP matrix.
3. Non-destructive patching of `composer.json` (it is JSON: it reuses
   `@plumbward/ast`).
4. Laravel-specific AI rules: where the business logic goes, use of Eloquent,
   form requests, avoiding N+1 queries — the exact mistakes an AI assistant
   makes in Laravel.

**Acceptance criteria:**
- Passes the kit on a real Laravel skeleton.
- Composer scripts are added without overwriting the ones the project already
  had.

---

### [ ] F2-6 — Go pack
**Branch:** `feat/f2-pack-go` · **Depends on:** F2-3

**Work:**
1. The scanner already detects Go; the pack is missing.
2. It contributes: `golangci-lint` with a reasoned set of linters, `gofumpt`,
   `go vet`, `govulncheck`, `go test -race -cover`, workflows with a matrix.
3. AI rules: idiomatic error handling, contexts, small interfaces.
4. Careful: Go has no "development dependencies". Check that
   `AddDependencyOp` with `manager: 'go'` translates into something sensible in
   [apply.ts](../packages/core/src/apply.ts) (`go install` of tools, or a
   `tools.go`). If it does not fit, it is a fix to the core, not to the pack.

**Acceptance criteria:**
- Passes the kit on a Go module and on a monorepo with several `go.mod`.

---

### [ ] F2-7 — Pack composition in monorepos
**Branch:** `feat/f2-monorepo` · **Depends on:** F2-4, F2-5, F2-6

**Why:** the scanner already detects monorepos and forces them to
`non-disruptive`, but the packs still reason about the root. In a monorepo with
`apps/api` in Python and `apps/web` in Next.js, an incoherent configuration is
generated today. And monorepos are, by size, the highest-ticket clients.

**Work:**
1. Extend `RepoContext` with the detected **workspaces** (pnpm/yarn/turbo/
   nx/lerna/Cargo/Go), each with its path and its stacks.
2. Allow a pack to contribute operations **with a path prefix** per workspace,
   without packs having to know about monorepos.
3. CI that only runs the jobs of the workspaces affected by the diff.
4. A clear strategy for the root: shared config at the top, specific config
   below.

**Acceptance criteria:**
- A Python + Next.js monorepo gets two coherent configurations and a CI that
  only runs what changes.
- The packs from F2-4 to F2-6 work without modifying them.

---

### [ ] F2-8 — Guide for pack authors
**Branch:** `docs/f2-pack-authoring-guide` · **Depends on:** F2-7

**Why:** it is the scaling lever of the business. If an enterprise client can
write its own pack with its internal standards, it stops buying a tool and
starts building on a platform. That changes the price and the retention.

**Work:**
1. `docs/PACK_AUTHORING.md`: contract, DSL, examples, common mistakes.
2. Executable template: `packages/packs/_template/`.
3. Document the guarantees the conformance kit checks, and why.

**Acceptance criteria:**
- Someone outside the project writes a minimal pack following only the guide.

---
### [ ] F2-12 — Install the agent tooling each stack needs
**Branch:** `feat/f2-agent-skills` · **Depends on:** F2-2

**Why:** today we generate rule files. But a team working with Claude Code,
Cursor or Copilot needs more than a `.cursorrules`: it needs the *skills* and
the agent configuration suited to its stack. **Nobody is packaging this**, and
it is one of the most differentiating things we can offer.

**Work:**
1. Detect which assistants the team uses (already in `Profile.aiAssistants`)
   and which agent tooling each one supports.
2. Install, according to the detected stack:
   - Claude Code skills in the matching directory.
   - Cursor rules in `.cursor/rules/`, split by domain instead of a single
     monolithic file.
   - A generic `AGENTS.md` for the rest of the assistants.
   - Configuration of the MCP servers that make sense for that stack, **without
     installing any automatically**: they are proposed and the team decides.
3. Everything generated goes through the same managed-block mechanism, so that
   `upgrade` can update it without overwriting what the team adds.
4. **Propose third-party agent tools** (origin: F0-17, where we use them
   ourselves): napkin as the repository runbook and the local part of caveman
   to compress replies. They are proposed, never installed without confirmation
   (ADR 0005), with version and hash pinned in a lock and the link each
   assistant needs to load them.
5. **Do not recommend any cloud gateway** that routes the assistant's requests
   through a third party, like `caveman-setup`: it contradicts the local-first,
   no-telemetry stance (ADR 0002) and is a compliance problem for the client.
6. A third-party skill or plugin runs with access to the client's repository:
   review its hooks and scripts before including it in the catalogue.
7. Port the F0-17 controls to `doctor`: hash of each skill against its lock,
   link present, and runbook within its curation rules.

**Acceptance criteria:**
- A Node/TS repository gets skills and rules that are coherent across the three
  assistants, with no contradictory instructions between files.
- Nothing connects to an external service without explicit confirmation.
- A skill altered with respect to its lock makes `doctor` fail.

---

### [ ] F2-13 — Golden snapshots of what each pack generates
**Branch:** `test/f2-pack-snapshots` · **Depends on:** F2-3, F0-12

**Why:** a pack produces files that end up inside the client's repository.
Today nothing stops a refactor from changing a marker, a block identifier or the
name of a generated script **without any test noticing** — exactly what
happened in F0-8 with the identifier of the `.gitignore` block.

**Work:**
1. Extend the conformance kit with snapshots of the full output of each pack
   over representative synthetic repositories.
2. Explicitly mark which parts of that output are **persisted tokens** — the
   ones written into client files, which cannot change without a migration—
   and make a change to them fail with a message that explains it, instead of
   simply updating the snapshot.
3. Also cover the diff between versions: what an `upgrade` would change.

**Acceptance criteria:**
- Changing a marker or a block identifier fails with a message that names the
  migration that would be needed.
- Updating a snapshot requires a conscious action, never a blind `--update` in
  CI.

---

### [ ] F2-11 — A real boundary for third-party packs
**Branch:** `feat/f2-pack-isolation` · **Depends on:** F2-8

**Origin:** review of F0-5.

**Why it matters:** the documentation claimed that a pack "has no access to the
file system". It is false: a pack is an object loaded in the same Node process
and can import `node:fs` and write wherever it wants. `checkPackConformance`
only inspects the **returned operations**; it cannot observe side effects.

As long as the CLI only loads packs included in its own package, the risk is
theoretical. The moment the catalogue opens —which is the scaling lever of the
business (F2-8)— installing a pack becomes running arbitrary code on the
client's machine. This task is **blocking for accepting external packs**.

**Work:**
1. Decide the mechanism: run the packs in a `worker_thread` with trimmed
   permissions, in a child process with the Node permission model
   (`--experimental-permission`), or sign and audit the catalogue packs.
   Write an ADR with the choice.
2. Implement it, and add to the conformance kit a test that detects a pack that
   tries to write directly.
3. Until then, state explicitly in the documentation and in the CLI output that
   only trusted packs are loaded.

**Acceptance criteria:**
- A pack that tries to write on its own is detected or prevented.
- The ADR justifies the chosen mechanism and what it leaves out.

---

### [ ] F2-9 — Take the assistant's operating limits to the base pack
**Branch:** `refactor/f2-boundaries-to-base-pack` · **Depends on:** F2-2

**Status:** implemented **only** in the Node/TypeScript pack (section 7 of the
generated rules, plus the Copilot instructions), with the `AgentBoundaries`
contract already in the `Profile`. It still has to be generalised.

**Why the base pack is its place:** an assistant not running `git push` or a
migration has nothing to do with the language of the project. Leaving it in
`node-ts` means that a Laravel or Django client does not get it, which is
exactly where a badly launched migration does the most damage.

**Work:**
1. Move `boundariesSection` from the Node pack to the base pack.
2. Publish it in every AI context file the base pack generates (`AGENTS.md`,
   `CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`), without duplicating
   it in the stack packs.
3. Extend the list of forbidden commands with those of each detected ecosystem:
   `php artisan migrate`, `python manage.py migrate`, `alembic
   upgrade`, `prisma migrate deploy`, `rails db:migrate`, `goose up`.
4. Translate the section into the i18n catalogues of Phase 1.
5. Health check in `doctor`: warn if the AI rule files have been edited by hand
   and have lost the section.
6. **Token conservation protocol** (origin: F0-17), in the same section and in
   every AI rule file: one task per session, heavy work to CI, targeted reads
   with `grep` and line ranges, and on an open PR only blockers. It does not
   depend on the stack or on the assistant: it is written once in the central
   configuration and translated into `CLAUDE.md`, `AGENTS.md`, `.cursorrules`
   and `.github/copilot-instructions.md`.

**Acceptance criteria:**
- A repository of any stack gets the limits, with the migration commands of its
  own ecosystem named explicitly.
- Disabling `agentBoundaries.git` in the profile removes them from every
  generated file at once, and the section numbering is still valid.
- The section reads the same in Spanish and in English.
- The token conservation protocol appears in every generated AI rule file, with
  the same content.

---

## PHASE 3 — Real governance: application modes and workflow

**Objective:** the tool works on large repositories with legacy code, not only
on new projects.
**Estimate:** 3-4 work sessions.
**Why it matters:** a 200,000-line repo is where the problem we sell hurts the
most and where the high ticket is — and it is exactly where a tool that turns
strict rules on all at once generates 4,000 errors and gets uninstalled in ten
minutes. The `ratchet` and `non-disruptive` modes are already **computed** in
[sloc.ts](../packages/scanner/src/sloc.ts) but today **they change nothing**.
**Phase exit criterion:** applying the tool to a large, messy repo leaves CI
green from day one, and still prevents it from getting worse.

---

### [ ] F3-1 — Baseline: a snapshot of the existing debt
**Branch:** `feat/f3-baseline` · **Depends on:** Phase 2 complete

**Work:**
1. Generate `.governance/baseline.json` (the `BASELINE_FILE` constant already
   exists in [types.ts](../packages/core/src/types.ts), with no implementation
   behind it).
2. Content: per file and per rule, the number of violations **accepted** at
   installation time, plus metadata (date, version, command that generated it).
3. A `plumbward baseline --update` command, which requires a clean tree and
   explains in its output what is being accepted and what it implies.
4. The baseline is **readable and reviewable in a PR**: no binary blobs.

**Acceptance criteria:**
- Regenerating the baseline over an unchanged repo produces an identical file
  (determinism).
- The file explains in its header, in the configured language, what it is and
  how it is reduced.

---

### [ ] F3-2 — Ratchet mode: strict rules only on what changes
**Branch:** `feat/f3-ratchet-staged` · **Depends on:** F3-1

**Work:**
1. In `ratchet` mode, the hooks apply the strict rules **only to the staged
   files**, and the soft rules to the rest.
2. In `non-disruptive` mode, the hooks only warn; nothing blocks.
3. Configuration generated so that the developer understands why their file is
   validated differently from the one next to it (explanatory comments).

**Acceptance criteria:**
- In a repo with 500 pre-existing errors, a commit of a clean file passes.
- A commit that touches a file with debt requires fixing **only the lines it
  touches**.

---

### [ ] F3-3 — CI that audits only the diff of the Pull Request
**Branch:** `feat/f3-diff-only-ci` · **Depends on:** F3-2

**Why:** it is the literal commercial promise of the product — "40% reduction
in PR review times" — and today it is not implemented.

**Work:**
1. Workflows that compute the changed files against the base branch and run the
   linter, types and secret scanning only on them.
2. An automatic comment on the PR with the summary: what was validated, what
   improved and what got worse with respect to the baseline.
3. Cover the case of the large PR and that of the outdated branch.

**Acceptance criteria:**
- A 3-file PR in a 200,000-line repo is validated in under a minute.
- The comment is useful for a human reviewer, not noise.

---

### [ ] F3-4 — The ratchet: no getting worse
**Branch:** `feat/f3-ratchet-metrics` · **Depends on:** F3-3

**Why:** it is the difference between "we install linters" and "governance".
And it is what makes the licence renew: the value accumulates month after
month, in a measurable way.

**Work:**
1. CI compares the metrics of the PR against the baseline and **fails if the
   debt goes up**, even if the absolute values are still high.
2. When a PR reduces the debt, the baseline is automatically updated downwards:
   the ratchet never goes back.
3. `plumbward report` shows the evolution of the maturity score and of the debt
   over time.

**Acceptance criteria:**
- A PR that adds a new `any` fails, even if the repo has 3,000.
- A PR that removes 10 violations lowers the baseline in the same merge.

---

### [ ] F3-5 — Governance of the branch flow (product feature)
**Branch:** `feat/f3-branch-governance` · **Depends on:** F2-2

**Why:** it is question 1 of the wizard in the PDF and today nothing exists. We
are using this flow internally (§3): this task turns that practice into
product.

**Work:**
1. The `base` pack generates and documents the branch strategy chosen in the
   profile, **with the branch names of the profile** —configured, or proposed
   and confirmed, never assumed:
   `Prod`, `main`, `trunk` or whatever the team uses (see F0-14).
2. A branch naming convention in the language of the history
   (`agentBoundaries.commitLanguage`, English by default), with the format
   `<type>/<description>`, and **a control that checks it in CI** reading the
   branch from `GITHUB_HEAD_REF` —never interpolating it into a `run:`, because
   the branch name is controlled by whoever opens the PR—. The generated AI
   rules have asked for it since 2026-09-11; the control in the client's repo
   is missing.
2. It generates the **branch protection rules** as a declarative file (GitHub
   ruleset) plus the instructions to apply them. Applying them automatically
   requires an admin token: it is offered, **never assumed**, and only with
   explicit confirmation.
3. It generates PR and issue templates, and `CODEOWNERS` from the real authors
   the git history returns.
4. It documents the flow in the `GOVERNANCE.md` the Node pack already
   generates.

**What configuring it by hand in F0-13 taught**, which makes the design
concrete:

- **The required checks come from the generated workflows.** They must match
  the `name` of each job exactly, and matrix ones are expanded (`Node
  22.13`, `Node 24`…). If the matrix changes and the rule does not, every PR is
  blocked forever. Since Plumbward generates both, it computes the exact list
  and updates both at once on every `upgrade`. **It is the advantage a tool
  that only protects branches does not have.** `doctor` warns if a required
  check matches no job.
- **Approvals according to the team:** 0 for a solo developer, who with 1 could
  never merge their own PRs; 1 or more for teams.
- **Which branches to protect:** `integration` and `release` from the profile,
  plus the GitHub default branch, which is read from the API. Protecting one
  branch too many is cheap; what is never inferred is which one is deployed
  from. If `release` is missing, what is known is protected and a warning is
  given (ADR 0005).
- **It is a new remote operation**, outside the six local operations of the
  core, so it requires an **ADR**. It must keep the guarantees: `plan` shows the
  exact rule, the existing ones are read first so as not to overwrite them,
  `apply` only with explicit confirmation, and the journal stores its identifier
  so that `rollback` deletes it.
- **It requires admin permissions:** it uses the `gh` session the user already
  has, never storing the token.
- **GitHub limit:** rules apply on public repositories with any plan, but on
  private ones they require Pro, Team or Enterprise. Detect it and explain it,
  instead of creating a rule GitHub ignores without warning.
- Multi-platform: GitLab and Bitbucket have equivalent APIs.

**Acceptance criteria:**
- After applying, the client's repo has its flow documented and the protections
  ready to turn on.
- Nothing touches the remote configuration of the repository without explicit
  confirmation.
- The required checks match the generated jobs, and changing the matrix updates
  the rule in the same `upgrade`.

---

### [ ] F3-6 — Delivery flow and assisted review in the generated rules
**Branch:** `feat/f3-delivery-workflow` · **Depends on:** F3-5

**Why:** the bottleneck the product promises to solve is not writing the code,
it is **reviewing it**. A small team, or one where only one person is left on a
Friday afternoon, piles up unreviewed PRs and ends up merging without looking.
This task turns into product the flow we already use internally (§3.3): the
client's assistant delivers the texts and, if needed, reviews.

**Work:**
1. The base pack adds to the generated AI rules a **delivery flow** section:
   when a unit of work is closed, the assistant delivers the commit message,
   the PR **title** and its description, in the language set by
   `agentBoundaries.commitLanguage`, with the format of the PR template the
   pack itself generates. The title on one line and under 70 characters: it is
   the only thing seen in the PR list.
2. An explicit **fresh-context review** rule: if the developer asks the
   assistant to review the PR, it must do so without the history that produced
   the code. It is what makes the review worth something; without it, the
   assistant only confirms its own assumptions.
3. An **ask first** rule: never assume the assistant reviews. It is offered;
   the team decides.
4. The review **delivers findings, it does not approve or merge**. The merge is
   done by a person, always. It must be written in the generated rules so that
   it does not erode with use.
5. A new profile option `assistedReview` (on by default) so that a team with
   guaranteed human review can turn the offer off.
6. **Proportional review** (origin: F0-17). The first review is complete; the
   following ones are limited to the diff of the fixes and use a light model. A
   small fix already tested does not get another round. When closing, the
   assistant reminds that the merge belongs to the developer and that what
   follows starts in a new session (F3-10 automates it).

**Acceptance criteria:**
- A configured repository gets the delivery flow in its AI rule files, coherent
  with the PR template and the branch flow generated for it.
- Disabling `assistedReview` removes the review part but keeps the delivery of
  the messages.
- The section makes explicit that assisted review is a relief valve against
  being blocked, not a substitute for human review.
- The generated rules limit follow-up reviews to the diff of the fixes.

---

### [ ] F3-7 — Testing laws coupled to the change
**Branch:** `feat/f3-test-coupling` · **Depends on:** F3-3

**Why:** it is the number one complaint about AI-generated code — it arrives
without tests— and it is **mechanically checkable**, which is what makes it a
control and not advice.

**Work:**
1. Compare the diff of the Pull Request with the exported symbols it touches:
   - **New** exported function with no test that covers it → fails.
   - **Modified** exported function whose test has not been touched → warns.
   - **Removed** exported function with orphan tests → fails.
2. Respect the mode: in `non-disruptive` it only warns, it never blocks.
3. An explicit, auditable escape hatch: an annotation that exempts a specific
   symbol, **with a mandatory reason**, visible in the review.
4. The error message says which test file is missing and where to create it.

**Acceptance criteria:**
- A PR that adds an exported function without a test is blocked with an
  actionable message.
- The exemption requires writing a reason and stays visible in the PR.

---

### [ ] F3-8 — Security posture, beyond secrets
**Branch:** `feat/f3-security-posture` · **Depends on:** F3-3

**Why:** Gitleaks detects leaked tokens. It does not detect **open doors**,
which are the other half of the problem, and the half an AI assistant
introduces most easily, because it copies documentation examples meant for
local development.

**Work:**
1. Controls for insecure default configurations, with the official source that
   backs each one (F1-5): `CORS: *`, debug mode on in production, needlessly
   exposed ports, permissive authentication, cookies without `Secure` or
   `HttpOnly`, TLS disabled.
2. Detection of environment variables used in the code but missing from
   `.env.example`, and the other way round.
3. Detection of default credentials in container and `docker-compose` files.
4. Each finding explains **why it is a problem** and how it is fixed. A warning
   that does not teach ends up silenced.

**Acceptance criteria:**
- The controls work on the stacks with a pack of their own.
- Each control cites its official source.
- Zero false positives on the F6-2 test repositories; a noisy control is
  disabled rather than tolerated.

---

### [ ] F3-9 — Controls derived from incidents
**Branch:** `feat/f3-incident-derived-controls` · **Depends on:** F3-7, F0-12

**Why it is the feature with the widest moat in the whole plan:** the ratchet
prevents getting worse in metrics. This prevents **repeating a specific
failure**. After a year, a client's Plumbward configuration contains the
mistakes its team no longer makes — and a competitor does not replicate that by
publishing a repository, nor does a platform give it away. It is a real
switching cost.

**Work:**
1. A **catalogue of parameterisable controls**: forbidden string, mandatory
   file, symbol-test coupling, coherence between documentation and commands,
   persisted token that cannot change, insecure configuration.
2. A flow that turns a finding into an instance of one of those controls with
   two or three answers. **A control is not derived from arbitrary prose**: a
   template is chosen and parameterised. Promising otherwise would be selling
   magic.
3. The resulting controls are versioned in the client's repository, in a
   readable format, and reviewed in a PR like any other change.
4. The register of derived controls feeds the F4-4 report: *"this year you
   turned 23 incidents into controls; none has happened again"*. **It is the
   renewal report, it does not have to be built separately.**

**Acceptance criteria:**
- A typical finding becomes a control in under a minute.
- The resulting control is readable by a person who was not in the incident.
- Disabling a control requires a written reason, visible in the review.

---

### [ ] F3-10 — Guided session close: `plumbward session close`
**Branch:** `feat/f3-session-close` · **Depends on:** F3-6, F1-3

**Origin:** F0-17. The token conservation protocol asks for a new session to be
opened when each task closes, but doing it by hand is friction: you have to
remember what comes next and write the opening. A manual, cumbersome step gets
skipped; a command that leaves everything on the clipboard gets used. It is the
thesis of the product —controls beat rules— applied to cost.

**Work:**
1. `plumbward session close [--next="<task>"]`, as a subcommand: the rest of
   the CLI uses standalone verbs (`scan`, `plan`, `apply`), not
   `session:close`.
2. **Preconditions.** Clean tree —no changes and no untracked files— and the
   branch pushed. If something fails, it lists it and does nothing else.
3. **Next task.** Without `--next`, the first pending task whose dependencies
   are closed, read from the plan that `.governance/config.yml` declares
   (`session.plan`: path and header pattern; by default `### [ ] <ID> — <title>`).
   The client does not have our `EXECUTION_PLAN.md`: the source is configurable.
4. **An opening prompt with pointers, not content.** Repository, task and its
   branch, last commit (hash and `--stat`) and what to read and in what order.
   **Never the diff**: putting it in the prompt is exactly the dragged-along
   context we want to avoid; the new session asks for it if it needs it. In the
   language of the profile.
5. Copy to the clipboard (`pbcopy`, `wl-copy`/`xclip`, `clip.exe`). Without a
   clipboard (SSH, CI), it prints it. It does not write to disk, so it does not
   emit `Operation[]`; the same config and the same repo give the same prompt
   (invariant 2).
6. Final message: the merge is done by the developer, and a new assistant
   session has to be opened and the prompt pasted into it.
7. **No `clear`.** Clearing the terminal does not empty the assistant's
   context: the new session does. Clearing the screen only hides what the
   developer perhaps wanted to read.

**What cannot be promised:**
- "Zero tokens": the new session still loads the rules and the system prompt.
  What is promised is **no accumulated context**, which is what costs.
- "The client sees how much it saves": there is no telemetry (ADR 0002).
  Measuring it would require a local report reading the logs of each
  assistant. It is another task, and whether it goes into `BUSINESS_MODEL.md`
  has to be decided first.

**Acceptance criteria:**
- With a dirty tree or the branch not pushed, it fails, lists the cause and
  copies nothing.
- The same config and the same repository produce the same prompt, byte for
  byte.
- The prompt contains no diff and fits in fewer than 20 lines.
- With no clipboard available, it prints the prompt and exits successfully.
- Messages in Spanish and in English.

---

## PHASE 4 — Lifecycle of the installed product

**Objective:** the tool is useful on day 200, not only on day 1.
**Estimate:** 3-4 work sessions.
**Why it matters:** the client pays an **annual subscription**, and the only
thing that justifies renewing it is the new value each version brings
([ADR 0004](adr/0004-annual-subscription.md)). Without `upgrade` and without
the recurrence engine of F4-5 to F4-8, there is no second year.
**Phase exit criterion:** a repo configured six months ago updates to the new
rules without losing a single client customisation.

---

### [ ] F4-1 — Interactive wizard `plumbward init`
**Branch:** `feat/f4-wizard-init` · **Depends on:** Phase 3 complete

**Work:**
1. An `init` command with `@clack/prompts` (already a dependency of the CLI).
2. Questions, **with a default value derived from the scan** so that pressing
   Enter gives a correct result —except the deployment branch, which has none
   on purpose—:
   - Branch strategy (F3-5).
   - Deployment target per environment **and the branch it is deployed from**
     (`branches.release`). It is the only thing Plumbward never infers (ADR
     0005): it is always asked, with no default value.
   - Strictness level, showing how many errors each option would generate **on
     their real repo** — the scanner already has the data to compute it.
   - AI assistants in use.
   - **Assistant operating limits** (`agentBoundaries`): whether it can run git
     and migrations, and in which language it writes the commit messages. By
     default all three are on; turning them off must require a conscious
     action.
   - Docker Compose and DevContainer.
   - Language.
3. The wizard **runs nothing**: it only produces the `Profile` and writes it to
   `.governance/config.yml`. Then it chains into `plan`.
4. `--yes` for CI and `--profile <file>` so that an agency can apply the same
   profile to ten repositories without repeating the questionnaire.

**Acceptance criteria:**
- `init --yes` on any repo produces a valid config without interaction.
- Cancelling halfway leaves nothing written.
- The wizard can be run again: it starts from the existing config if there is
  one.

---

### [ ] F4-2 — `plumbward upgrade` with customisation detection
**Branch:** `feat/f4-upgrade-drift` · **Depends on:** F4-1

**Why:** it is the heart of the subscription model, and the mechanism is
already half built: the managed file headers (`withManagedHeader`) and the
delimited blocks (`ensureBlock`) exist precisely for this.

**Work:**
1. Compare the hash recorded in the header of each managed file with the
   current content, to classify it: **intact** (it is regenerated), **modified
   by the client** (it is respected and a warning is given) or **deleted** (the
   user is asked).
2. In files with delimited blocks, update only the inside of the block.
3. `plumbward upgrade --dry-run`, which shows the exact diff, just like `plan`.
4. A clear report of what was updated, what was respected and what requires a
   human decision.
5. Migrations between versions of the `config.yml` format.

**A concrete case that already exists:** a `ci-prod.yml` generated by an earlier
version of Plumbward from an inferred branch is still there after updating,
because `apply` does not overwrite existing files. Today only `doctor` detects
it (F0-14); `upgrade` must be able to regenerate or remove it. The same goes for
an old `ci-dev.yml` that filters `pull_request` by branch: Pull Requests to
other branches are not checked. `doctor` has warned about it since F0-14;
`upgrade` must remove the filter.
**Acceptance criteria:**
- A file generated and then edited by hand is **never** overwritten.
- A file generated and left intact is updated to the new version.
- `upgrade` is reversible with `rollback`, just like `apply`.

---

### [ ] F4-3 — `doctor --fix`
**Branch:** `feat/f4-doctor-fix` · **Depends on:** F4-2

**Work:**
1. The `HealthCheck`s already declare `fixHint`. Add an optional field that
   provides the `Operation[]` that fix the problem.
2. `doctor --fix` builds a plan with those operations and passes it through the
   same confirmation, journal and rollback flow. No shortcuts.
3. JSON output (`--json`) to consume it from CI.

**Acceptance criteria:**
- `doctor --fix` leaves the repo green in the cases it declares it can fix.
- It never writes outside the transactional flow.

---

### [ ] F4-4 — Commercial report `plumbward report`
**Branch:** `feat/f4-sales-report` · **Depends on:** F4-3

**Why:** whoever decides the purchase is not whoever runs the CLI, and they will
not read terminal output. This report is the sales tool: it is generated for
free, shared by email and creates the need the product solves.

**Work:**
1. `plumbward report --html` produces a self-contained report: maturity score,
   missing signals with their impact, an estimate of the DevOps work hours the
   tool saves, and a before/after comparison.
2. `--json` for integrations.
3. A sober, professional design, with no external dependencies and no
   telemetry.

**Acceptance criteria:**
- The HTML opens offline and reads well on a phone.
- The numbers it shows can be justified with the scan data; nothing made up.

---

### [ ] F4-5 — Detect that there is a new version, without telemetry
**Branch:** `feat/f4-version-detection` · **Depends on:** F4-2

**Why:** it is the first piece of the recurrence engine
([BUSINESS_MODEL.md §6](BUSINESS_MODEL.md)). If the client does not find out
that there is something new, the subscription is not renewed.

**Work:**
1. Query the public npm registry to know whether there is a more recent
   version. **Never an API of ours**: we do not want to know who runs what.
2. A local cache with a reasonable lifetime, so as not to query on every run.
3. A discreet notice at the end of `scan` and `doctor`, never blocking.
4. `--no-update-check` and an equivalent environment variable, for isolated
   environments and for CI.

**Acceptance criteria:**
- Without network, the CLI works the same and is not delayed by a single
  second.
- No identifiable data is sent to any server.

---

### [ ] F4-6 — Targeted changelog: only what applies to this repository
**Branch:** `feat/f4-targeted-changelog` · **Depends on:** F4-5

**Why:** this is the piece nobody builds. A generic changelog gets ignored. One
that says *"of the 14 changes in this version, these 3 affect you because you
use Next.js and have no containers"* gets read in full.

**Work:**
1. Each changelog entry declares which stacks, modes and capabilities it
   applies to. It is a change in the release format, not only in the CLI.
2. Cross the changelog with the scan of the repository and show **only** what
   is relevant, with the rest collapsed.
3. Link each entry to the specific change it would produce in the repository,
   to go straight to `upgrade --dry-run`.

**Acceptance criteria:**
- Two repositories of different stacks see different changelogs of the same
  version.
- An entry without applicability metadata does not pass the release CI.

---

### [ ] F4-7 — Capability catalogue and continuous offer
**Branch:** `feat/f4-capability-catalog` · **Depends on:** F4-6

**Why:** it is what turns the tool from a "configurator that runs once" into a
"service that improves your repository every quarter". Without this, the
subscription has no defence.

**Work:**
1. A declarative catalogue of capabilities, each with its requirements: which
   stack it needs, what must already exist in the repository, which mode allows
   it.
2. After an `upgrade`, scan again and compare against the catalogue, to find
   what the repository **now** supports and does not have.
3. Present it as an offer, never as an action: *"we now know how to dockerise
   projects like yours. Shall we do it?"*.
4. Remember what was rejected, so as not to propose it again on every run. A
   tool that insists gets uninstalled.

**Acceptance criteria:**
- Adding a capability to the catalogue makes the repositories that support it
  see it offered, without touching CLI code.
- Rejecting an offer silences it until the user asks for it.

---

### [ ] F4-8 — Guided flows, starting with dockerising Node/TS
**Branch:** `feat/f4-guided-flows` · **Depends on:** F4-7

**Why:** some capabilities cannot be generated blindly. Dockerising requires
knowing which services there are, which ports, whether there is a database and
how the project is built. An assistant that asks the minimum and generates the
rest is a very visible saving of hours — and a very demonstrable one in a sale.

**Risk, and that is why we start with only one:** if we promise "I'll dockerise
your project", we become the owners of every failure mode of every stack. It is
risk N2 of the business model. **Node/TypeScript first, and it is not extended
until it works without manual support.**

**Work:**
1. A guided-flow engine on `@clack/prompts`, reusable by other capabilities.
2. First flow: dockerising Node/TS. Detect the package manager, build script,
   ports, external services and environment variables; ask only what cannot be
   inferred.
3. Generate a multi-stage `Dockerfile`, `.dockerignore`, a `docker-compose.yml`
   for development, and documentation in the language of the profile.
4. **The result is still a `ChangePlan`**: reviewable with `plan`, applicable
   with `apply`, reversible with `rollback`. Not a single shortcut.
5. Check that the image builds before considering the capability complete.

**Acceptance criteria:**
- On a Next.js project and on an Express one, the generated image builds and
  starts.
- Cancelling halfway through the flow leaves nothing written.
- The flow asks nothing the scanner could have inferred.

---

## PHASE 5 — Local-first licensing

**Objective:** get paid, without breaking the trust that makes the product
sellable.
**Estimate:** 3-4 work sessions (plus the service, which is a separate project).
**Business decision taken on 2026-09-08:** see `docs/adr/0002`. All the code
ships in the NPM package. The licence is validated over the network **only** in
`init` and `upgrade`. `scan`, `plan`, `apply`, `rollback` and `doctor` work
**offline and forever**. Nothing is injected that could make the client's CI
fail.
**Phase exit criterion:** the product can be sold and invoiced, and it passes a
vendor review by a corporate security department.

---

### [ ] F5-1 — `@plumbward/licensing` package
**Branch:** `feat/f5-licensing-sdk` · **Depends on:** Phase 4 complete

**Work:**
1. HTTPS client for the licence API, with short timeouts and error messages
   that say what to do.
2. Repository fingerprint: the logic already exists in
   [git.ts](../packages/scanner/src/git.ts) (`fingerprint` from the first
   commit, with the remote URL as fallback). It only has to be consumed.
3. **Local cryptographic** verification of the received licence (a signature
   checked with a public key embedded in the package). That way the CLI
   validates without calling the API on every run.
4. What is sent, documented in the README and visible with `--verbose`: token,
   repository fingerprint, CLI version. **Never** code, paths, file names or
   the developer's email.

**Acceptance criteria:**
- Without network, an already licensed repo keeps working completely.
- A licence tampered with by hand is rejected for an invalid signature.
- The user can see exactly what is sent before it is sent.

---

### [ ] F5-2 — Licence service
**Branch:** separate repository · **Depends on:** F5-1

**Work:**
1. Minimum API: issue, validate, bind to a fingerprint, list and revoke.
2. Data model: licence → bound fingerprints, with the limit of the plan
   (1 repo, or 5-10 in the agency package).
3. Integration with the payment gateway: buying issues the token
   automatically.
4. Client dashboard: their licences, their bound repos and **the ability to
   unbind a repo themselves**, without opening a ticket. A repo gets migrated
   or renamed; if that forces writing an email, the experience breaks.

**Acceptance criteria:**
- Using a 1-repo licence on a second repo returns a clear error that explains
  how to unbind or upgrade.
- The dashboard lets the client solve it without human intervention on our
  side.

---

### [ ] F5-3 — Permissions per plan (entitlements)
**Branch:** `feat/f5-entitlements` · **Depends on:** F5-2

**Work:**
1. The licence declares which packs and features it entitles to.
2. Free and without a licence, forever: `scan` and `report`. They are the hook.
3. The end date of updates is recorded in the config: after that date,
   `upgrade` stops bringing new rules, but **everything installed keeps
   working**. Nothing ever breaks.

**Acceptance criteria:**
- An expired licence neither degrades nor blocks an already configured
  repository.
- The expiry notice is informative and appears well in advance.

---

### [ ] F5-4 — Tolerance to network failures
**Branch:** `feat/f5-offline-grace` · **Depends on:** F5-3

**Work:**
1. If the API does not respond during an `upgrade`, the cached signed licence
   is used while it is still valid.
2. No outage of our infrastructure may block a client's work.
3. A test that simulates the API being down and checks that everything carries
   on.

**Acceptance criteria:**
- With the API switched off, every command works with a valid cached licence.

---

### [ ] F5-5 — Annual subscription and volume tiers
**Branch:** `feat/f5-annual-subscription` · **Depends on:** F5-3

**Origin:** business decision of 2026-09-09,
[ADR 0004](adr/0004-annual-subscription.md). It replaces the one-off payment
model with twelve months of updates.

**Work:**
1. The signed licence carries an **expiry date**, verifiable locally against
   the embedded public key.
2. Revalidation against the API **only in `upgrade`**. Never in `scan`, `plan`,
   `apply`, `doctor` or `rollback`.
3. Tiers by number of repositories for agencies, with self-service binding and
   unbinding from the dashboard.
4. Expiry notices well in advance and through channels the client sees: CLI
   output and email.
5. **An expired subscription stops bringing new rules and nothing else.** It
   does not degrade, does not block, does not uninstall. The client keeps
   forever what they had on the last day they paid.

**Acceptance criteria:**
- A repository with an expired subscription keeps working completely with the
  configuration it already had.
- Without network, a repository with a valid cached licence is not affected.
- Moving from one tier to another does not force reconfiguring any repository.

---

## PHASE 6 — Distribution and launch

**Objective:** a product that can be bought exists.
**Estimate:** 2-3 work sessions.
**Phase exit criterion:** a client runs `npx @your-company/plumbward scan`, sees
the value, pays and applies.

---

### [ ] F6-1 — Publishing on NPM
**Branch:** `build/f6-npm-publishing` · **Depends on:** Phase 5 complete

**Work:**
1. Scope and organisation already resolved in F0-8: `@plumbward/*`,
   organisation registered on npm on 2026-09-09.
2. Packaging: a single executable through `tsup`, fast startup, correct `bin`.
3. Check `npx` on macOS, Linux and Windows, with the Node versions CI tests at
   that moment (today 22.13, 24 and 26).
4. Automatic publishing from `main` with changesets and provenance.
5. Check the package size: `npx` runs in every demo, and a slow download ruins
   the first impression.

**Acceptance criteria:**
- `npx @your-company/plumbward scan` works on the three platforms.
- Startup under 2 seconds.

---

### [ ] F6-2 — E2E validation over real repositories
**Branch:** `test/f6-real-repo-e2e` · **Depends on:** F6-1

**Why:** it is Phase 4 of the original PDF and the only filter that catches
what synthetic tests do not see.

**Work:**
1. A battery over real public repositories, one per profile:
   - Greenfield (< 2,000 SLOC).
   - Medium, with debt (2,000-50,000).
   - Large monorepo (> 50,000).
   - One per supported stack.
   - One of an **unsupported** stack (it checks the base pack).
2. For each one: `scan` → `plan` → `apply` → green CI → `rollback` → repo
   identical to the original.
3. Really measure the total time and compare it with the PDF's promise of
   "under 5 minutes". If it does not hold, the product is fixed or the promise
   is fixed.

**Acceptance criteria:**
- Every profile passes the full cycle.
- The measured time is recorded in the README as a verifiable figure.

---

### [ ] F6-3 — Sales materials
**Branch:** `docs/f6-landing-and-demo` · **Depends on:** F6-2

**Work:**
1. A landing page with the value proposition, the price and an `asciinema` of
   the real demo.
2. A sample report (F4-4) published as an example.
3. End-user documentation, separate from the contributor documentation.
4. A use case written with the real numbers measured in F6-2 — not estimates.

**Acceptance criteria:**
- The landing page answers in 30 seconds what it is, for whom and how much it
  costs.

---

### [ ] F6-4 — 1.0 launch
**Branch:** `chore/f6-launch` · **Depends on:** F6-3

**Work:**
1. Freeze the public `StackPack` API: from 1.0 on, breaking it has a cost.
2. Support and versioning policy published.
3. Support channel and incident process.
4. First three pilot clients with a discount in exchange for structured
   feedback.

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

#### Phase 0 · 2. Making green mean something

- **F0-34** — the only full-cycle e2e does not exercise the commit check.
- **F0-22** — the tests in `packages/*/test/` do not go through the typecheck, and the control of the `quality` job watches itself.
- **F0-32** — the mutation control gives empty greens through gaps in its parsers.
- **F0-46** — the name and link controls of F0-16 pass without looking in some cases and flag valid English names.
- **F0-49** — the link control ignores heading anchors, and the fragment escapes of the English control are undocumented.
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
