# ADR 0001 — Separate the plan from the execution

- **Status:** accepted
- **Date:** 2026-09-08
- **Affects:** the whole core

## Context

The original specification described a monolithic `init`: analyse the
repository and write the configuration as it goes. That is what most project
generators do, and it is what a developer expects.

But our buyer is not a developer trying out a tool on a personal project. It is
a company that is going to run a binary downloaded with `npx` on a production
repository with years of history.

## Decision

No module writes to disk. They all declare their intent by emitting
`Operation[]`, which are aggregated into a `ChangePlan`. The plan can be
rendered without touching anything, and only `applyPlan` materialises it,
leaving a trace in a journal.

Operations are a closed union of six types. Adding a seventh forces the
compiler to demand its handling in the simulator, the executor, the rollback
and the renderer.

## Discarded alternative

Write directly, with a `--dry-run` option that prints what it *would* have
done.

It is discarded because a `--dry-run` implemented apart from the real path
**lies sooner or later**: they are two code paths that diverge as soon as
someone adds a special case. Here there are not two paths: `plan` and `apply`
consume the same `ChangePlan`, and the simulation computes the result by
reading the real files.

## Consequences

**In favour:**

- `plan` can really exist and be auditable in a Pull Request. Without this
  there is no enterprise sale.
- `apply` is reversible, because each operation is executed one at a time and
  the file it touches is known before touching it.
- A third-party pack has no access to the file system: it can only ask. This
  is what will make opening the catalogue viable.
- The result is deterministic and therefore runnable in CI.

**The cost we accept:**

- More code and more indirection than writing with `fs.writeFile`.
- Every new capability has to be expressed as an operation. If tomorrow it
  were needed, for example, to rename files, calling `fs.rename` would not be
  enough: the operation type has to be added and made reversible.

That cost is exactly the point. It is what prevents the tool from acquiring
capabilities that cannot be undone.
