# ADR 0004 — Annual subscription instead of a perpetual licence

- **Status:** accepted
- **Date:** 2026-09-09
- **Affects:** the whole of Phase 5, the `LICENSE`, and the lifecycle design (Phase 4)

## Context

The original model was a perpetual licence per repository of €1,500-2,500,
with twelve months of rule updates included.

While designing Phase 5 the question came up of what happens in month 13, and
the answer is uncomfortable: **the tool keeps working perfectly**. The hooks
are still installed, the CI still passes, the rules are still applied. The
client perceives no loss, and therefore does not renew.

Renewal rates of maintenance contracts on a perpetual licence are around
30-60% and decline every year. It is a model that only works if you keep
selling new licences indefinitely at the same pace.

## Decision

**Annual subscription per repository**, with volume tiers for agencies.

`scan` and `report` stay free forever and with no limit on repositories,
guaranteed by the *Additional Use Grant* of the `LICENSE` and not only by a
product decision.

A one-off payment is accepted as an **entry offer** for clients who resist the
subscription, but the product is designed for subscription from day one.

## Discarded alternatives

**Keeping the perpetual licence with twelve months.** Discarded because it
forces a choice between two bad ways out: degrading what is installed to force
the renewal —hostile, and in head-on contradiction with ADR 0002— or accepting
a low and declining renewal rate.

**Subscription per developer.** A worse fit: the value is delivered per
repository, each one with its configuration, its baseline and its history.
Besides, the repository fingerprint the scanner already computes ties licences
to repositories naturally.

**Usage-based model, per audited Pull Request.** Attractive on paper, but it
brings cost uncertainty to the client right at the moment you are asking them
to trust that you will not break their repository. Discarded for now; to be
reconsidered if a high-volume segment appears.

## Consequences

**In favour:**

- Revenue accumulates instead of restarting every January. With 500 new
  repositories a year and 90% retention, it goes over €1.03M in the fourth
  year, compared with flat revenue for the same commercial effort.
- It multiplies the valuation: ARR is valued at 5 to 15 times; one-off payment
  revenue, at 1 to 3. It is the difference between being able to raise a round
  and not, with the same euros earned.
- It aligns incentives. With the perpetual licence, in month 13 we stop having
  any obligation to improve. With a subscription, improving is the only way to
  get paid next year.

**The cost we accept:**

- **More commercial friction**, above all in the Spanish agency market, used to
  buying tools only once.
- **A real obligation to deliver continuous value.** Configuring the repository
  once and disappearing is no longer enough. The whole of Phase 4 —version
  detection, targeted changelog, capability catalogue, guided flows— goes from
  desirable to **the reason the client pays for the second year**.
- **Measurement stops being optional.** Without the ratchet report showing how
  much debt went down, the renewal conversation is a matter of faith. F3-4
  becomes critical for the business, not only for the product.

## Compatibility with ADR 0002

ADR 0002 establishes that the licence is validated locally and that no outage
of our infrastructure can block a client's work. A subscription needs to check
its validity periodically, which apparently clashes.

It does not clash, if it is implemented like this:

1. The cryptographically signed licence **carries an expiry date** and is
   verified locally against a public key embedded in the package.
2. It is revalidated against the API **only on `upgrade`**, never on `plan`,
   `apply`, `scan`, `doctor` or `rollback`.
3. The offline grace margin is wide: if the API does not respond, the cached
   licence is used while it is still valid.
4. An expired subscription **stops bringing new rules**. It never degrades,
   blocks or uninstalls anything already applied.

The client who stops paying keeps exactly what they had on the last day they
paid, working forever. That is what makes the model defensible in front of a
procurement department, and what separates a subscription from a hostage.
