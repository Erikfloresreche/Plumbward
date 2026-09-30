# ADR 0006 — The full cycle free on one repository; the measurement is paid for

- **Status:** proposed
- **Date:** 2026-09-30
- **Affects:** `LICENSE` (the *Additional Use Grant*), README, ADR 0003,
  ADR 0004, BUSINESS_MODEL §4 and §10, and Phase 5
- **Decided in:** F5-6, with the results of the private beta (M3) in hand

## Context

Today the licence splits the commands by what they do to the repository
([ADR 0003](0003-busl-license.md)): every command that does not modify it is
free in production and with no limit on repositories; `apply` and `rollback`
require a commercial licence per repository.

Three facts, found while replanning towards an early beta (F0-54), put that
split in question:

1. **What `apply` writes is plain text that can be copied** (risk R2). A client
   who pays for one repository can copy the generated CI, linters and hooks to
   the next one. Charging for the first setup charges for the part that is
   easiest to take for free.
2. **The recurring value is the measurement**: the baseline, the ratchet, the
   CI that audits only the diff and the report over time (F3-1 to F3-4, F4-4).
   It is what changes month after month, and it is what the renewal of
   [ADR 0004](0004-annual-subscription.md) needs to show.
3. **Paying before trying stops the beta.** Someone who has to buy a licence
   to see `apply` work on their own repository does not get to see the value
   the rest of the product sells.

## Proposal

**The full cycle —`scan`, `plan`, `apply`, `rollback`, `doctor`— is free in
production on one repository.** What is charged for:

- **Multi-repository policy:** a second repository and beyond, with the same
  profile applied to all of them (the agency tiers of BUSINESS_MODEL §4).
- **The ratchet in CI:** the CI that fails when the debt goes up and lowers the
  baseline when it goes down (F3-4).
- **The historical report:** the evolution of the score and the debt over time
  (F4-4).
- **Rule updates:** `upgrade` bringing new rules, as ADR 0004 already says.

## What the licence text allows today, and why the order matters

Two properties of the BUSL decide how this can be done:

- **The grant is worded by property, not by list.** ADR 0003 wrote it as
  "every command that does not modify the target repository", on purpose, so
  that it does not go stale. The consequence: a `report` with history that only
  reads the repository **is already free** under today's text, and so is any
  read-only CI audit of the diff. Charging for them requires narrowing the
  grant, not only deciding it here.
- **The grant is fixed per version.** Each published version keeps the grant
  it was published with, until its Change Date. If a version with a historical
  report goes out under today's grant, that version's report is free forever,
  whatever is decided later.

Hence the order: **this ADR is decided before any version with a historical
report is published.** F5-6 opens M4 for that reason, and its acceptance
criterion says so.

## Alternatives

**A. Keep today's split (ADR 0003).** `apply` and `rollback` are paid per
repository; everything that only reads is free.

- In favour: nothing changes. The rule is simple to explain: "reads are free,
  writes are paid".
- Against: it charges for the part R2 says is copyable, and it puts a payment
  before the first contact with the value. The measurement, which only reads,
  is free under that same rule, so the recurring part of the business stays
  outside what is charged.

**B. The full cycle free on one repository, measurement paid (proposed).**

- In favour: a team tries the whole product on its real repository without
  paying, which is the beta and the funnel at once. What is charged is what
  keeps changing and what the renewal shows. It fits R2: the copyable part is
  given away on purpose, and the part that cannot be copied —the history, the
  ratchet, the updates— is sold.
- Against: the grant has to be rewritten, with a limit by number of
  repositories and explicit exclusions for the history and the ratchet. A
  limit per repository is a legal condition, not a technical one: ADR 0002
  validates the licence only in `init` and `upgrade`, so the CI of a client who
  ignores the limit keeps working. That is accepted, as R2 already accepts it.
  Wording by exclusion also goes stale the day a new paid feature appears.

**C. The full cycle free with no limit; only measurement and updates paid.**

- In favour: the simplest grant to write, and the widest adoption.
- Against: agencies, the first paying segment (BUSINESS_MODEL §4), stop paying
  for what they use most: the same setup on many repositories. The revenue
  depends entirely on the measurement being adopted.

## Consequences if it is accepted

- `LICENSE`: the *Additional Use Grant* allows production use of every command
  on one repository, keeps every read-only command free on any number of
  repositories, and excludes by name the historical report and the ratchet in
  CI. The wording is reviewed against the BUSL template, as ADR 0003 did.
- README: the "License" section says what is free and what is paid in the same
  terms.
- ADR 0003: its decision is superseded in the part of the grant; the rest
  (BUSL, Change Date, Change License) stays.
- ADR 0004: "`scan` and `report` free forever" becomes "`scan` and the current
  `report` free forever; the history, paid". The subscription does not change.
- BUSINESS_MODEL §4: the Diagnosis plan becomes "Starter": the full cycle on
  one repository.
- Versions already published keep their grant. Nothing is taken away from
  anyone who already has it.

## Consequences if it is rejected

ADR 0003 stays as it is, and the historical report and the diff-only CI are
free for as long as they only read. The revenue rests on `apply` and
`rollback` per repository and on the updates.
