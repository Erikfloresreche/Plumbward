# Plumbward

**AI governance and DevSecOps for teams that code with assistants.**

It analyses any repository and installs a complete DevSecOps environment
adapted to its stack and its size: continuous integration, linters, pre-commit
hooks, secret scanning and context rules for AI assistants.

> **Status: in active development, before version 1.0.** It is **not yet
> published on npm**: it is used by cloning the repository (see
> [Development](#development)). Today only the Node.js/TypeScript pack exists;
> the rest arrives in Phase 2. The full plan is in
> [docs/EXECUTION_PLAN.md](docs/EXECUTION_PLAN.md).
>
> When we publish, it will be under the `@plumbward/` scope.

---

## The problem

AI assistants have multiplied the volume of code and the speed of Pull
Requests. The consequences are always the same:

- Senior developers become a bottleneck reviewing badly structured code.
- Technical debt accelerates and architecture standards get diluted.
- Secrets end up in the git history.

Setting up the defence —CI, linters, hooks, secret scanning, context rules—
takes between 8 and 16 hours per repository. Almost nobody spends them.

## How it works

```bash
plumbward scan       # Diagnoses and scores maturity from 0 to 100
plumbward plan       # Shows the exact diff of what would change
plumbward apply      # Applies the changes, with a journal to undo them
plumbward rollback   # Undoes the last run
plumbward doctor     # Checks that the configuration is still healthy
```

A typical cycle is three commands: `scan` to see where you are, `plan` to see
what would change, `apply` to do it. And if something does not fit, `rollback`
leaves the repository as it was.

`apply` only writes directly on a **work branch** recognisable by its prefix
(`feat/`, `fix/`, `chore/`…, and assistant ones like `claude/` or `copilot/`).
On any other —`main`, `Prod`, `pro`, `live` or a name nobody foresaw— it first
creates a dedicated branch (`chore/setup-ai-governance`) and works there; also
with a detached HEAD. If that branch already exists, it stops without writing
anything. When in doubt, it protects. `--no-branch` turns this behaviour off if
you know what you are doing.

**Plumbward never guesses which branch you deploy from.** The CI it generates
checks every Pull Request, and the deployment workflow is only generated when
you set the branch in `.governance/config.yml`.

## Three guarantees

**Nothing is written without being shown first.** No module writes to disk on
its own: they all declare their intent by emitting operations that are gathered
into an auditable plan. `plan` computes and shows the exact result —not an
estimate—, and only `apply` materialises it.

**Files are reversible.** Before touching a file, its previous content is saved
in a journal. `rollback` restores it down to the last byte, and the criterion is
verifiable: after an `apply --no-install`, `git status --porcelain` is empty. If
`apply` fails halfway, the files are reverted on their own: the "half
configured" state does not exist.

Installing dependencies is the known exception: what your package manager does
in the lockfile and in `node_modules` does not go through the journal and
`rollback` does not undo it. It is recorded as pending (F0-11).

**Your edits are respected.** Generated files carry a hash in their header;
fragments inserted into your own files go between markers. On update, whatever
you changed by hand is never overwritten: you are warned.

## What it installs

It depends on the stack and the size of the repository, but in a
Node/TypeScript project it includes commented CI pipelines, ESLint and
Prettier, pre-commit hooks with Husky and lint-staged, secret scanning with
Gitleaks, Conventional Commits, a DevContainer, a unified `Makefile`, context
rules for Cursor, Claude and Copilot, and a `GOVERNANCE.md` that explains to the
team what has been installed.

Strictness adapts to size: in a small project everything is enforced from the
first file; in one of 200,000 lines only what changes is audited, so that CI
does not turn red on the first day.

## Architecture

A monorepo of packages with dependencies in a single direction, so that the
core can be reused outside the CLI:

| Package | Responsibility |
|---|---|
| `core` | Transactional engine: plan, simulation, application, journal and rollback |
| `ast` | Non-destructive editing of JSON and YAML, and delimited blocks |
| `scanner` | Git state, SLOC, stack detection and maturity report |
| `packs-sdk` | `StackPack` contract, operations DSL and conformance suite |
| `packs/*` | One package per stack. Adding support does not require touching the core |
| `cli` | Terminal interface |

The full explanation, with the reason behind each decision, is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Development

Requires Node.js >= 22.13 and pnpm.

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

Before contributing, read [CONTRIBUTING.md](CONTRIBUTING.md). If you work with
an AI assistant in this repository, its operating limits are in
[CLAUDE.md](CLAUDE.md) and are mandatory.

## License

[Business Source License 1.1](LICENSE). The code is readable and auditable by
anyone —it is part of the value proposition—, but it cannot be resold or
offered as a competing service.

The commands that do not modify your repository (`scan`, `plan`, `doctor`) are
free to use in production and with no limit on repositories. Those that do
modify it (`apply`, `rollback`) require a commercial licence per repository.

Each version converts to Apache-2.0 on the conversion date set in the
`LICENSE`, or four years after it is published, whichever comes first.
