# Plumbward architecture

Reference document: what the product does, how it is built and **why each piece
is where it is**. If you are going to touch the code, read it first.

To find out what gets built next, go to
[EXECUTION_PLAN.md](EXECUTION_PLAN.md).

---

## 1. The problem and the answer

AI assistants generate code much faster than a human can review it. The volume
of Pull Requests soars, senior developers become a bottleneck and the project's
standards get diluted. The known solution —setting up CI, linters, hooks and
secret scanning— costs between 8 and 16 hours per repository, and almost nobody
spends them.

Plumbward automates that work. But what defines the product is not *what* it
installs, but **how it installs it without you being able to lose anything**.
The whole design starts from a single idea:

> Never write to someone's repository without first showing them exactly what
> is going to happen, and without being able to undo it completely afterwards.

## 2. The command cycle

| Command | What it does | Does it write to disk? |
|---|---|---|
| `scan` | Diagnoses the repository and scores it from 0 to 100 | **Never** |
| `plan` | Shows the exact diff of what it would do | **Never** |
| `apply` | Materialises the plan, leaving a reversible record | Yes, with a journal |
| `rollback` | Undoes the last run completely | Yes, restoring |
| `doctor` | Checks that what was installed is still healthy | No |

`scan` does not require a licence by design: it is the commercial hook. The
report creates the need that the rest of the product solves.

---

## 3. The central decision: separating the plan from the execution

It is the decision from which almost all the others derive.

The intuitive approach would be to walk the repository and write files according
to what is found. It is what most generators do.

**Here it is forbidden.** No module writes to disk. Modules *describe their
intent* by returning objects:

```ts
{
  kind: 'createFile',
  path: '.gitleaks.toml',
  content: '…',
  managed: true,
  reason: 'Sets up secret detection before secrets reach the history.',
}
```

Those are **data, not actions**. And data can be inspected, sorted,
deduplicated, simulated, shown and reverted. An `fs.writeFile()` scattered
across the code allows none of that.

From there come the four properties that make up the product:

**`plan` can exist.** The user sees the result before authorising it. Without
this there is no enterprise sale: no company lets a binary downloaded with `npx`
touch its repository blindly.

**`apply` can be reverted.** Because each operation runs one at a time and the
file it touches is known, its previous state can be photographed before touching
it.

**Packs declare, they do not act.** A pack only returns operations; the core is
what decides and writes. It is a convention, not yet a technical boundary: see
§4.5 and task F2-11 before accepting third-party packs.

**The result is deterministic.** Same repository + same configuration = same
plan, always. It is what allows running it in CI and trusting the result.

---

## 4. The five safety mechanisms

### 4.1 Operations are a closed union — [core/src/types.ts](../packages/core/src/types.ts)

There are exactly **six** operation kinds: `createFile`, `patchJson`,
`patchYaml`, `ensureBlock`, `addDependency` and `execCommand`.

Being a closed union lets the compiler demand that new cases are handled, but
**today that guarantee is only real in part of the code**:

| Where | Does the compiler enforce it? |
|---|---|
| `executeOperation` in `apply.ts` | Yes: every branch returns, with no final `return` |
| `targetKey` and `describeOperation` in `plan.ts` | Yes |
| `simulatePlan` in `simulate.ts` | **No**: the `switch` has no guard, and a new kind would be silently ignored |
| `render.ts` | **No**: it does not discriminate on `kind` exhaustively |
| `revertEntries` | Not applicable: it replays snapshots, it does not reason by kind |

The `simulate.ts` gap is the dangerous one: a new kind would not show up in
`plan` but would run in `apply`, which is exactly the divergence this whole
design exists to prevent. It is recorded as task **F0-9**.

The `reason` field is **mandatory** in all of them. It is not documentation: it
is what gets printed in the plan. The conformance suite rejects any operation
with an empty `reason`. A change that cannot be explained is not applied.

### 4.2 The simulation uses an overlay — [core/src/simulate.ts](../packages/core/src/simulate.ts)

`plan` does not estimate the result: it **computes** it. It reads the real
files, applies every transformation in memory on an `overlay` and shows the
final result.

It matters because operations accumulate: if three operations patch
`package.json`, the simulation must reflect all three chained, not the last one.
That is why the plan can tell "modify" from "already up to date".

### 4.3 The journal keeps photographs — [core/src/apply.ts](../packages/core/src/apply.ts)

Before touching a file, `apply` stores its previous content in base64 inside
`.governance/journal.json`, together with whether the file existed or not.

`rollback` does not have to guess: it walks the journal backwards, restores the
contents and deletes the files that did not exist. The success criterion is
literal: after an `apply --no-install`, `git status --porcelain` must be empty.

**The journal remembers which branch it was written on, and `rollback` only acts
there.** `apply` isolates the changes in `chore/setup-ai-governance`, and the
journal goes into the `.gitignore` the pack installs, so it survives checkouts.
A journal that remembered the *starting* branch would make `rollback` on `Prod`
restore on `Prod` photographs taken on the isolated branch: it reverts nothing,
it deletes whatever `Prod` has had since then. That is why `writtenOnBranch` is
read **after** switching branches, and on any other branch `rollback` refuses
without writing and keeps the journal so it can be reverted from the right
place.

With `--no-branch` and a detached HEAD there is no branch to record, and
`writtenOnBranch` stays `null`. **That `null` is compared like any other name**
(F0-29): the journal is reverted with a detached HEAD on the same commit, and it
is refused from a branch even if the branch points to that commit, by symmetry
with a journal that has a branch, which is refused with a detached HEAD. **That
refusal does not protect uncommitted work:** going back to the commit with
`git checkout` carries the working-tree changes along, and the next `rollback`
overwrites them, just as with branch journals. Neither the branch nor the commit
says whether the files are still the ones `apply` left; checking it is task
**F0-38**. Two alternatives were discarded. Rejecting the combination before
writing punishes a legitimate use —CI runs check out a detached HEAD— to protect
something the commit already protects. Accepting it without `rollback`, as F0-24
left it, turned into irreversible what used to be revertible.

**The branch name says where you are, not whether it is the same place.** A
branch deleted and recreated with the same name on another commit, or a commit
made on the isolated branch after the `apply`, pass a check by name and lose
data all the same: the photographs are of the tree that existed at that commit.
That is why the journal also stores `writtenOnCommit`, read at the same time as
`writtenOnBranch`, and `rollback` requires both. That commit is also the
starting one —`headMoved` aborts if HEAD moves between the plan and the
confirmation, and the isolated branch is created from HEAD without committing—,
so there is no second field to maintain, and the return notice uses it to name
where to go back to when the run started with a detached HEAD.

Journals from earlier versions are not reverted: v1 stored the starting branch
and v2 did not store the commit, and in neither of them can it be checked that
you are still in the same place. `readJournal` throws `OutdatedJournalError` and
refers you to git, in the same direction as ADR 0005: when in doubt, less
action.

Reverting does not undo the `checkout` either: the files come back, the branch
does not. That is why the journal also stores `startedOnBranch`, and both
`rollback` and the automatic reversion of a failed `apply` say which branch the
repository is left on and which command takes you back to the starting one. If
the automatic reversion **could not** do it either, the advice changes entirely:
there are half-written files, so first you revert where you are and only then go
back. Neither is the `checkout` proposed yet, nor is the command that deletes
the isolated branch given: deleting it would make the `rollback` impossible,
because it only reverts from that branch.

**Known gap:** `execCommand` operations do not record snapshots. What the
package manager writes to the lockfile and to `node_modules` during installation
stays outside the journal, and `rollback` does not undo it. Task **F0-11**.
That is why both the E2E test and the test script in §7 use `--no-install`.

And the most important thing: **if `apply` fails halfway, it reverts itself**.
The "half configured" state does not exist, and it is the worst place to leave a
client's repository.

### 4.4 Managed blocks and hashed headers — [ast/src/blocks.ts](../packages/ast/src/blocks.ts)

This mechanism is what will make the subscription model technically possible.

> **The `upgrade` command does not exist yet** — it is task F4-2. What follows
> describes the mechanism already built that it will rest on, not current
> behaviour.

The comments these files carry are generated for the client, so they follow the
profile language: English by default, Spanish with `language: es`. The plan
carries that language, so `plan` and `apply` write the same header.

There are two cases:

**Files that are entirely ours** (`.gitleaks.toml`, `eslint.config.js`). They
carry a header with the hash of the generated content:

```
# plumbward:managed v=0.1.0 hash=a3f2c81b0d94
# File generated by the governance CLI.
# If you edit it by hand, `plumbward upgrade` will stop updating it
# and will warn you about the conflict instead of overwriting your changes.
```

`upgrade` will have to recompute the hash and compare it. If it matches, the
client did not touch the file and it is regenerated with the new rules; if it
does not match, the client customised it and **it is respected and a warning is
given**, never overwritten.

**Careful when implementing it:** `withManagedHeader` computes the hash over the
generated content **before** prepending the header. The value stored in `hash=`
is therefore not the hash of the file as it ends up on disk. The comparison has
to be made against the body without the header, not against the whole file.

**Client files** (`.gitignore`, `tsconfig.json`). Only a fragment between
markers is inserted:

```
# >>> plumbward:begin gitignore-artifacts
# Automatically managed block. Do not edit inside the markers:
# `plumbward upgrade` will regenerate its content.
.governance/journal.json
# <<< plumbward:end gitignore-artifacts
```

`upgrade` rewrites only what is **between** the markers. A single line outside
them is never touched.

### 4.5 Path containment — [core/src/fs.ts](../packages/core/src/fs.ts)

`resolveInRepo()` rejects absolute paths and anything that escapes with `../`.
An E2E test checks that case.

**What it does NOT cover today:** the check is purely lexical (`path.resolve`
and `path.relative`, without `realpath`). If the repository contains a symbolic
link to a directory outside it, a path that goes through it passes validation
and the write leaves the repository. Task **F0-10**.

And there is a more important limit that should not be misread: **this is not a
sandbox**. A pack is an object loaded in the same Node process and nothing stops
it from importing `node:fs` and writing on its own. That it does not do so is a
**convention checked in review and in the conformance suite**, which only
inspects the returned operations, not side effects. Before accepting
third-party packs a real boundary is needed (task F2-11).

---

## 5. Package map

It is split into six packages to **force dependencies to go in a single
direction**:

```
                    ast
                     ▲
                     │
                   core
                     ▲
                     │
                  scanner
                     ▲
                     │
                 packs-sdk
                     ▲
                     │
               packs/node-ts
                     ▲
                     │
                    cli
```

The exact edges, as the `package.json` files declare them:

| Package | Depends on |
|---|---|
| `ast` | — (it is a leaf) |
| `core` | `ast` |
| `scanner` | `core` |
| `packs-sdk` | `core`, `scanner` |
| `packs/node-ts` | `core`, `packs-sdk`, `scanner` |
| `cli` | `ast`, `core`, `scanner`, `packs-sdk`, `pack-node-ts` |

`ast` does not know `core` exists. `core` does not know the packs exist. The
packs do not know the CLI exists. If a web interface or a GitHub Action is
needed tomorrow, everything but `cli` is reused.

### `@plumbward/ast` — non-destructive editing

The problem: reading a `package.json` with `JSON.parse`, adding a script to it
and writing it with `JSON.stringify` **destroys the client's formatting and
comments**. In a `tsconfig.json` full of explanatory comments, that is
unacceptable.

| File | Why it exists |
|---|---|
| [json.ts](../packages/ast/src/json.ts) | Patches JSON with `comment-json`, preserving comments and key order |
| [yaml.ts](../packages/ast/src/yaml.ts) | The same for YAML, preserving comments and anchors |
| [pointer.ts](../packages/ast/src/pointer.ts) | RFC-6901 pointers (`/scripts/lint`) to point at where to patch without knowing the structure |
| [blocks.ts](../packages/ast/src/blocks.ts) | Blocks with markers and managed headers (§4.4) |

### `@plumbward/core` — the transactional engine

| File | Why it exists |
|---|---|
| [types.ts](../packages/core/src/types.ts) | The six operation kinds and the plan and journal structures |
| [plan.ts](../packages/core/src/plan.ts) | `PlanBuilder`: accumulates, deduplicates, detects clashes between packs and sorts |
| [simulate.ts](../packages/core/src/simulate.ts) | Computes the result without writing (§4.2) |
| [apply.ts](../packages/core/src/apply.ts) | Runs, photographs, records and self-reverts (§4.3) |
| [rollback.ts](../packages/core/src/rollback.ts) | Undoes from the journal and deletes it so it is not applied twice |
| [fs.ts](../packages/core/src/fs.ts) | Path containment and comment style by extension |
| [hash.ts](../packages/core/src/hash.ts) | SHA-256 for the managed headers and the baseline |

Two details of `plan.ts` worth knowing:

**The application order is hard-coded** and it is not arbitrary: `createFile` →
`ensureBlock` → `patchJson` → `patchYaml` → `addDependency` → `execCommand`. A
file must exist before it can be patched, and dependencies must be declared
before running commands that use them.

**Clashes between packs are detected on their own.** If two packs want to write
different things to `/scripts/lint`, the builder detects it by comparing
fingerprints and reports it as a conflict. If they want to write the same thing,
it deduplicates it silently. This is what will let a Django + Next.js repository
receive two packs without them stepping on each other.

### `@plumbward/scanner` — read-only diagnosis

| File | Why it exists |
|---|---|
| [git.ts](../packages/scanner/src/git.ts) | Repository state and **fingerprint** (hash of the first commit) to tie the licence to |
| [walk.ts](../packages/scanner/src/walk.ts) | Fallback disk walk when the directory is not a git repository |
| [sloc.ts](../packages/scanner/src/sloc.ts) | Counts real lines of code and classifies the size |
| [stack.ts](../packages/scanner/src/stack.ts) | Detects stack, package manager and frameworks |
| [maturity.ts](../packages/scanner/src/maturity.ts) | Scores 0-100 with weights per signal |

In `git.ts`, the helper `git()` **returns `undefined` when the command fails**
instead of throwing: a repository without commits, without a remote, or that is
not a repository, are normal cases and not errors.

`sloc.ts` holds the thresholds that decide how much strictness can be applied:
fewer than 2,000 lines is `greenfield`, up to 50,000 is `ratchet`, above that
`non-disruptive`.

`maturity.ts` is the **commercial** piece: the weights do not reflect how hard
each signal is to put in place, but **how much pain it prevents**. That is why
secret scanning weighs 14 and the DevContainer weighs 4. Each missing signal
carries a `hint` that is the sales argument.

### `@plumbward/packs-sdk` — the extension contract

It is the business's scaling axis: adding support for Laravel must be publishing
a package, not modifying the core.

| File | Why it exists |
|---|---|
| [contract.ts](../packages/packs-sdk/src/contract.ts) | The `StackPack` interface (`detect`, `contribute`, `validate`), the `Profile` and `AgentBoundaries` |
| [dsl.ts](../packages/packs-sdk/src/dsl.ts) | `file()`, `json()`, `yaml()`, `block()`, `dep()`, `cmd()`: they make a pack read like a list of requirements |
| [registry.ts](../packages/packs-sdk/src/registry.ts) | Selects the applicable packs, sorts them by confidence and aggregates their operations |
| [conformance.ts](../packages/packs-sdk/src/conformance.ts) | The suite every pack must pass to be published |

`conformance.ts` checks something non-obvious: **it calls `contribute()` twice
and compares the results**. If they differ, the pack is not deterministic and
`plan` would be lying about what `apply` is going to do. The whole trust model
falls apart there, and that is why it is a conformance rule and not a piece of
advice.

### `@plumbward/pack-node-ts` — the only real pack today

[index.ts](../packages/packs/node-ts/src/index.ts) implements the contract; the
templates are split by topic in `templates/`.

The templates are **functions of the scan and the profile**, not static files.
The generated ESLint config differs if the project uses TypeScript, and the
strictness of the rules changes with `strictness`.

### `@plumbward/cli` — the interface

| File | Why it exists |
|---|---|
| [index.ts](../packages/cli/src/index.ts) | Defines the commands with `cac` and wraps everything in `guard()` so no error comes out as a raw stack trace |
| [context.ts](../packages/cli/src/context.ts) | Scans, loads the profile and builds the pack registry |
| [commands.ts](../packages/cli/src/commands.ts) | The logic of the five commands |
| [render.ts](../packages/cli/src/render.ts) | All terminal rendering, isolated from the rest |
| [diff.ts](../packages/cli/src/diff.ts) | Its own line diff, with no dependencies |

**`context.ts` merges the saved profile over the recommended one.** That way, a
`config.yml` written with an old version keeps working when new fields are
added.

**`diff.ts` does not use a library** on purpose: the generated files are
configurations of a few hundred lines, and a quadratic LCS with a safety cap is
enough. Every dependency not dragged in is one vulnerability less and a faster
`npx` start.

---

## 6. The technical stack and why each piece

| Tool | Why that one |
|---|---|
| **Strict TypeScript** | With `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. We sell rigour: we cannot generate it with lax code |
| **pnpm workspaces** | Real links between packages: `core` changes and `cli` sees it without republishing |
| **turbo** | Caches builds; without it every change recompiles the six packages |
| **tsup** | Bundles into a single executable. Critical: `npx` downloads it whole in every demo |
| **vitest** | Fast, with native ESM and TypeScript |
| **cac** | Minimal command router, without the dependency tree of better-known alternatives |
| **@clack/prompts** | Interactive confirmation of `apply`; it will be the base of the wizard (F4-1) |
| **execa** | Runs processes without going through a shell, which prevents command injection |
| **picocolors** | Terminal colour in 2 KB |
| **comment-json** and **yaml** | The only two that preserve comments when rewriting |

---

## 7. How to verify it works

### Level 1 — Automated suite

```bash
pnpm build && pnpm typecheck && pnpm test
```

The E2E tests in [e2e.test.ts](../packages/cli/test/e2e.test.ts) create a real
repository in a temporary directory and check the whole cycle:

- The scanner detects the right stack, size and mode.
- **`plan` writes nothing**: `git status` is empty afterwards.
- `apply` writes and **`rollback` leaves the repository byte-for-byte
  identical**, including a comment the test inserts by hand in `tsconfig.json`
  to check that patching does not destroy it.
- **A second `apply` produces no change** (idempotence).
- If an operation fails halfway, it reverts itself.
- The pack passes conformance.
- A pack cannot write outside the repository.

### Level 2 — Dogfooding

```bash
node packages/cli/dist/index.js scan
node packages/cli/dist/index.js plan --diff
```

Neither writes anything. `--diff` shows the exact content of each file that
would be generated.

### Level 3 — Full cycle on a throwaway repository

```bash
# From the root of the cloned repository:
PLUMBWARD=$(pwd)/packages/cli/dist/index.js

mkdir -p /tmp/plumbward-trial && cd /tmp/plumbward-trial
git init -b main && npm init -y
echo "console.log('hello')" > index.js
git add -A && git commit -m "initial"

node "$PLUMBWARD" plan --diff
node "$PLUMBWARD" apply --no-install
git status --short
node "$PLUMBWARD" doctor
node "$PLUMBWARD" rollback
git status --porcelain   # must be EMPTY
```

That last line is the definitive test. It is also worth running `apply` twice in
a row: the second one must report that the repository is already compliant.

### Level 4 — Real repositories

Task F6-2 of the plan. It is the only filter that catches what synthetic
repositories do not see.

---

## 8. Known open questions

They are documented here so nobody discovers them twice:

**Being a monorepo forces `non-disruptive` mode regardless of size.** It comes
from the original PDF, which treats "monorepo" and "large" as synonyms. On this
very repository, with ~4,300 lines, it applies soft rules when it could afford
the strict ones. To be reviewed in F2-7.

**The Node pack generates `GOVERNANCE.md` and `Makefile` at the root.** On a
monorepo that can clash with what already exists. To be solved in Phase 2.

**The assistant's operating limits only exist in the Node pack.** They must live
in the base pack, because they do not depend on the language. Task F2-9.
