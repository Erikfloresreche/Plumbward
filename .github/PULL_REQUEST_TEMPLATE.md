## Task

<!-- Task ID from docs/EXECUTION_PLAN.md, e.g. "F2-4 — Python pack".
     If this PR does not map to a planned task, say so and explain why. -->

## What changes and why

<!-- Explain the intent, not the diff. A reviewer can read the diff;
     what they cannot read is the reasoning behind it. -->

## Acceptance criteria

<!-- Copy the criteria from the task in docs/EXECUTION_PLAN.md. -->

- [ ]

## How this was verified

<!-- Commands run, scenarios covered, anything checked by hand. -->

## Definition of Done

<!-- Abridged. The canonical list lives in section 4 of
     docs/EXECUTION_PLAN.md; if they differ, the plan wins. -->

- [ ] `pnpm build`, `pnpm typecheck` and `pnpm test` pass
- [ ] Tests cover the new behaviour
- [ ] Generated files carry explanatory comments in the configured language
- [ ] Every new error path is reversible, or writes nothing
- [ ] The task checkbox is ticked in `docs/EXECUTION_PLAN.md`
- [ ] Every review finding became a mechanical control, or is recorded as
      non-mechanisable with the reason
