# Plumbward — Instructions for AI assistants

A DevSecOps governance CLI that analyses a repository and installs CI, linters,
hooks, secret scanning and context rules for AI assistants.

The full execution plan, with every task and its acceptance criteria, is in
[docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md). **Read it before
starting any task** and tick its checkbox when you finish.

---

## 0. How to pick up the project from scratch

If you open the session with no prior context —the normal case, because every
task starts in a new session (§6)—, everything you need is in the repository.
Read it in this order:

| Order | File | What it gives you |
|---|---|---|
| 1 | This file | Operating limits and working rules |
| 2 | `docs/EXECUTION_PLAN.md`, header | **Where we are**: the global status line says which tasks are closed |
| 3 | `docs/ARCHITECTURE.md` | How the code works and **why** each piece is where it is |
| 4 | `docs/BUSINESS_MODEL.md` | What we sell, to whom, and what we cannot promise |
| 5 | `docs/adr/` | The big decisions, with the alternatives that were discarded |
| 6 | `.claude/napkin.md` | Repo tricks that already cost a mistake. Read it all: it is short on purpose |

Of the plan and the architecture, read only the task and the sections it touches (§6).

Check the real state before trusting what is written:

```bash
pnpm install                                                    # a fresh clone has no dependencies
git branch --show-current && git status --short
gh run list --branch "$(git branch --show-current)" --limit 3   # CI already says whether it is green
pnpm check:coherence
```

**The order of the tasks is already decided in the plan: it is the execution
queue in §5.** When anyone asks, in whatever words and language, about the
state of the plan or the next task, the answer comes from the queue: the next
one is the first. No other order is invented in each session. If the developer
decides on another priority, the task is moved in the queue, with its reason,
and `check:coherence` checks that the new order respects the dependencies. If
the real state contradicts the queue —a task branch half done, uncommitted
changes—, say so before starting anything else.

---

## 1. Operating limits (non-negotiable)

### Forbidden: git commands that change state

`commit`, `push`, `pull`, `fetch --prune`, `merge`, `rebase`, `checkout`,
`switch`, `reset`, `revert`, `cherry-pick`, `stash`, `tag`, `branch -d`,
`remote add/remove`, `clean`.

**The developer working at the time runs them by hand.** Leave the changes in
the working tree, say exactly which files you touched and deliver the commit
message ready to copy.

You may use the read-only ones: `status`, `log`, `diff`, `show`,
`branch --list`, `branch --show-current`, `blame`, `ls-files`, `rev-parse`.

`check:coherence` checks that every `git` command in §0 is in this list: if
one is added to the guide without allowing it here, CI says so.

**Why:** whoever signs the commit answers for what enters the history. An
automatic push puts code in a shared repository without anyone having looked
at it, and undoing it is then a problem for the whole team, not for one
machine.

### Forbidden: database commands that write

Migrations (`migrate`, `db:push`, `db:seed`, `upgrade`), `INSERT`, `UPDATE`,
`DELETE`, `DROP`, `TRUNCATE`, `ALTER`, backup restores and any database CLI
that alters data or schema.

**The developer runs them by hand.** Write the migration file or the query and
explain how to run it, but do not run it.

You may run inspection `SELECT`s and query the schema if a development
connection is available.

**Why:** a migration has no undo button. The cost of a mistake is not a badly
written file, it is lost data.

### English, everywhere

Code, identifiers, comments, tests, documentation, commit messages and Pull
Request titles and descriptions: **all in English**. Commit messages and PR
texts are delivered as text, for the developer to use when making the commit.

Only two exceptions:

- Files generated **for the client** follow the language of their profile (§4).
- Files listed in `scripts/english-only.json`: pending translation (F0-16,
  F0-18, F0-42 to F0-45) or permanent exceptions, each with its reason. New
  text in a pending file is written in English too.

`pnpm check:coherence` fails on Spanish anywhere else, and on a listed file
that no longer has any.

Format: Conventional Commits, with the task identifier in the body.

```
feat(pack-python): detect Poetry and uv and generate their pipeline

Implements F2-4. Adds the Python pack with ruff, mypy and pytest support,
selecting the dependency manager from the files present in the repository.
```

### When a task is finished, always deliver these three texts

Saying the task is done is not enough. Deliver, ready to copy:

1. **The commit message**, in English, in Conventional Commits, citing the
   task identifier in the body.
2. **The Pull Request title**, in English and on a single line. Same
   Conventional Commits format as the commit, under 70 characters. It is the
   only thing shown in the PR list and in notifications, so it has to say what
   changes without opening it.
3. **The Pull Request description**, in English, following
   `.github/PULL_REQUEST_TEMPLATE.md`: task, what changes and why, acceptance
   criteria copied from the plan, and how it was verified.

Then ask the developer, **without taking it for granted**:

> Do you want me to review the Pull Request, or will someone else on the team?

### Reviewing your own Pull Request: only in a fresh context

If the developer asks for the review because nobody else is available and the
PR would be blocked, it is done **by opening a fresh context, without the
history of the conversation that produced the code**.

**Why:** reviewing your own work with the context that generated it reproduces
exactly the same blind spots. The same assumptions are taken for granted and
the same cases are missed. A clean context only has the diff in front of it,
and judges it by what it says, not by what it was meant to say.

The review looks for correctness bugs, breaches of the Definition of Done,
clashes with the architecture invariants and inconsistencies with the plan.
**It delivers findings; it does not approve or merge.** A person always does
the merge.

This is an escape valve so work is not blocked, not a substitute for human
review. When another person is available, that person reviews.

### A finding ends in a control, not in a written rule

When a review finds something, **it becomes a mechanical control** —a test, a
CI check— or **it is explicitly recorded as not mechanisable, saying why**.

Never "I'll just note it here".

**Why:** this file is already over 200 lines. At 400 nobody applies them
reliably, neither a person nor an assistant, because every new rule dilutes the
others. A test that fails always fails, and does not depend on anyone
remembering. It is the same thesis the product sells —rules get ignored,
controls do not— applied to ourselves.

Some findings cannot be mechanised: claiming in the documentation that a
security boundary exists when the code does not implement it, for example. For
that class, the defence is the fresh-context review, and it is said so.

---

## 2. Architecture invariants

They are not broken without an ADR in `docs/adr/` that justifies it:

1. **Nobody writes to disk on their own.** Every module declares its intent by
   emitting `Operation[]`. Only `applyPlan` materialises, and it leaves a
   journal so it can be reverted.
2. **`.governance/config.yml` is the source of truth.** The CLI is a
   deterministic function of it: same config + same repo = same plan, always.
3. **The pack catalogue is the scaling axis.** Supporting a new stack is
   publishing a package that implements `StackPack` and passes conformance.
   The core is not touched.

---

## 3. Workflow

- Branches: `Prod` (releases) and `develop` (integration). One branch per plan
  task, named `<type>/f<phase>-<slug>` **with the slug in English** —the branch
  name stays in the history just like the commit—, created from `develop`.
  Example: `fix/f0-protected-branches`. `pnpm check:coherence` checks it on
  every PR.
- A branch implements **exactly one task**. If unplanned work appears, a new
  task is added to the plan; the current one is not widened.
- The developer creates the branches and does the merges. You say which one is
  next.

---

## 4. Code standards

- Strict TypeScript. `any` is forbidden; use `unknown` and narrow the type.
- Every exported function declares its return type. Interfaces for every public
  contract.
- Files generated **for the client** carry explanatory comments in the language
  their profile sets, never bare literals.
- Every new behaviour comes with its test. A bug is fixed starting with the test
  that reproduces it.
- No new error path may leave the repository half done: it either takes part in
  the journal or does not write.

## 5. Commands

```bash
pnpm install
pnpm build       # turbo run build
pnpm typecheck
pnpm test        # vitest run
pnpm vitest run <path>         # locally, only what you touch (§6)
```

---

## 6. Token conservation and atomic sessions (mandatory)

Every step of a conversation resends the whole conversation. A long session
does not cost more for what is written, but for everything it drags along.

1. **One task, one session.** Tasks, branches and review rounds are not piled
   up in the same chat. When a PR is merged or a milestone is closed, a new
   session is opened: §0 and the plan are enough to pick up.
2. **Heavy work goes to CI.** Mutations, e2e and the full suite run in GitHub
   Actions. Locally, only the tests of what you touch: `pnpm vitest run <path>`.
3. **Targeted reads.** Never a large file or the whole repository: `grep -n`
   and exact line ranges. The plan is over 2,000 lines.
4. **On an open PR only blockers are fixed.** Follow-ups go to the plan as a
   new task.
5. **Proportional review.** The first review is complete, in a fresh context.
   After that, only the diff of the fixes and with a light model (Haiku or
   Sonnet), never the heavy one. A small fix already tested with mutants does
   not get another round. The whole repository is never re-read or rebuilt to
   review a fix.
6. **Manual close and new session.** The assistant leaves the task ready and
   delivers the texts. The developer does the merge. Everything after that,
   without exception, starts in a new session: the assistant says so when
   closing.

**Why:** the session of PR #7 (F0-14) used more than 80 % of the usage window:
five review rounds in a fresh context, and each follow-up fixed inside the PR
triggered another round.

**Not mechanisable:** no control can see how long a session lasts or what is
read in it. The defence is this section and the question in §0.

### Agent tools

- **napkin** (`blader/napkin`): the repo runbook in `.claude/napkin.md`. The
  skill is in `.agents/skills/napkin/`, pinned in `skills-lock.json` and linked
  from `.claude/skills/napkin`, which is where Claude Code looks for it. An
  entry is added when something not mechanisable has already cost a mistake;
  what can be mechanised goes to a control. It is curated only when adding,
  even though the skill asks for it on every read. The repository is public:
  nothing personal.
  `pnpm check:coherence` checks the skill hash, the link, and that the runbook
  follows its rules (date, "Do instead", at most 10 per category).
- **caveman**: an optional plugin of each developer, not versioned. It only
  compresses chat replies; commits, PRs, documentation, napkin and memory are
  written in normal prose. It cuts output tokens, which are a tiny part of the
  spend: it does not replace rule 1.
- **Forbidden: `caveman-setup` and any gateway that routes the assistant's
  requests through an external service.** It contradicts the local-first,
  no-telemetry stance ([ADR 0002](docs/adr/0002-local-first-licensing.md)).
- A new skill is third-party code with access to the repository: review it in
  full before installing it, with `npx skills add`, so it ends up in the lock.
