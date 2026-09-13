# Plumbward business model

Strategy document. It defines what we sell, to whom, for how much and —just as
important as all of that— **what we cannot promise**.

It is a living document: every decision that changes the model is reflected
here and, if it is structural, in an ADR.

**Last updated:** 2026-09-09

---

## 1. The problem the client buys

It is not *"my repository is missing continuous integration"*. That does not
hurt enough to pay for.

What hurts is:

> My team generates code with AI assistants faster than I can review it, and I
> do not know what is slipping through.

The consequences are concrete and all of them cost money: senior developers
turned into bottlenecks, technical debt that accelerates, secrets in the git
history, and a different architecture for every developer who asks a different
assistant for the same thing.

## 2. The positioning

> **The quality control layer for teams that code with AI.**

We cover the three phases of the cycle. No competitor covers all three:

| Phase | What we do |
|---|---|
| **Before** the AI writes | Context rules, agent *skills* installed according to the stack, every rule anchored to official documentation |
| **While** it writes | Operating limits: the assistant does not run git or write to the database; a person launches those actions |
| **After** | Mechanical controls in hooks and CI: what does not comply does not get in |

**The line that sets us apart:** the rules in a `.cursorrules` file are
suggestions the assistant can ignore. We turn them into **controls it cannot
skip**. A competitor that only generates rule files stays in the top half of
that table.

## 3. What we promise and what we do not

This section exists so that nobody writes on a landing page something a
technical CTO can take apart in thirty seconds.

### We do not promise

- **Bug-free code.** There is no mechanical way to prove that a program is
  correct. Anyone who promises it is lying or does not know.
- **Replacing human review.** We reduce its cost; we do not remove it.
- **Detecting business logic errors.** A mechanical control does not know what
  you wanted to build.

### We do promise

- **Every known category of failure has a control that stops it**, the list is
  public and auditable, and every control cites the official documentation it
  relies on.
- **Nothing is written to your repository without showing it first**, and
  everything is reversible.
- **Quality does not go backwards**: the ratchet prevents a Pull Request from
  making the metrics worse, even if the absolute values are still high.
- **Measurable value**: how much debt went down, how many PRs were audited, how
  many secrets were stopped before reaching the history.

This honesty is a **selling point**, not a limitation. A technical buyer trusts
whoever delimits their scope sooner than whoever promises magic.

---

## 4. Pricing model

**Annual subscription per repository, with volume tiers.**
Decision taken on 2026-09-09; it replaces the one-off payment with 12 months of
updates. The reasoning is in [ADR 0004](adr/0004-annual-subscription.md).

| Plan | Indicative price | For whom |
|---|---|---|
| **Diagnosis** | Free forever | `scan` and `report`. No limit on repositories |
| **Team** | €400-600/repository/year | Single product, small team |
| **Agency** | Tiers of 10 and of 50 repositories | Agencies and consultancies. It is the natural expansion path |
| **Enterprise** | Custom | Private packs with the client's internal standards, SSO, support SLA |

### Why the diagnosis is free, and forever

`scan` and `report` are the commercial hook: they create the need the rest of
the product solves, and they are shared by email with whoever signs the
purchase.

It is not a revocable marketing promise: it is written in the *Additional Use
Grant* of the `LICENSE`, so it is a legal commitment. That makes it credible.

### Why per repository and not per developer

Value is delivered per repository: each one has its configuration, its baseline
and its metrics history. It also fits what is already built —the repository
fingerprint in `scanner/git.ts` ties licences to repositories one to one— and it
gives a clean expansion path: you come in through one project and grow inside
the account.

---

## 5. Why a subscription and not a one-off payment

### The trap of the perpetual model

With a perpetual licence plus twelve months of updates, month 13 arrives and
**the tool keeps working perfectly**. The hooks are still there, CI still
passes. The client perceives no loss, so they do not renew.

There are only two ways out, and one is unacceptable:

1. **Degrade what is installed** to force the renewal. Hostile, and it flatly
   contradicts [ADR 0002](adr/0002-local-first-licensing.md).
2. **Make what is new worth enough** to pay again.

We choose the second, and the whole recurrence engine of §6 comes from it.

### The numbers

To reach **€1M a year**:

| Model | What it takes |
|---|---|
| One-off payment of €2,000 | **500 new sales every year, indefinitely.** Every January starts from zero |
| Subscription of €600/repo/year | ~1,700 active repositories, but **they accumulate** |

With 500 new repositories a year and 90% retention:

| Year | Active repositories | Revenue |
|---|---|---|
| 1 | 500 | €300k |
| 2 | 950 | €570k |
| 3 | 1,355 | €813k |
| 4 | 1,720 | **€1.03M** |

Same sales effort. The difference is that the base does not evaporate.

### The effect that weighs more than revenue

**€1M of ARR is valued at €5-15M. €1M of one-off payment revenue is valued at
€1-3M.** An investor underwrites recurrence, not billing. With the same euros
brought in, it is the difference between being able to raise a round and not.

### How commercial friction is handled

A Spanish agency used to buying tools only once may resist the subscription.
The one-off payment is accepted as an **entry offer**, but the product is
designed for subscription from day one: converting it later is much more
expensive.

---

## 6. The recurrence engine

A subscription is renewed for one of two reasons: because losing it hurts, or
because what is new is worth it. The first is ruled out by ADR 0002. All of our
recurrence depends on the second.

Four pieces, all of them in the execution plan:

**Version detection without telemetry** (F4-5). The CLI knows there is a new
version by querying the npm registry. It never phones home.

**Targeted changelog** (F4-6). Not *"what's new"*, but **"what's new for your
repository"**: out of fourteen changes, three apply to you because you use
Next.js and have no containers. The rest is not shown. Nobody does this.

**Capability catalogue** (F4-7). On update the repository is scanned again and
compared against what we know how to do: *"we now know how to dockerize projects
like yours, shall we do it?"*. New, visible value, without the client having to
find out about anything on their own.

**Guided flows** (F4-8). For what needs human decisions —dockerizing requires
knowing the services, ports, database, how it is built—. The result is still a
reviewable and reversible `ChangePlan`.

### The link that closes the renewal

None of the above is any use if the value is not **measurable**. The ratchet
(F3-4) produces the report that justifies renewing:

> Your technical debt went down 38%. 240 Pull Requests were audited. 12 secrets
> were stopped before reaching the history.

**That report is the renewal.** Without numbers, renewing is a conversation
based on faith.

---

## 7. Competition

The market is forming right now, which is good and urgent at the same time.

**`@save3asy/aegiscode`** — published on 23 August 2026, described as *"AI Code
Governance & Architecture Guardrails"*. Practically our value proposition.
Three weeks ahead of us.

**GitHub / Microsoft** — this is the big risk, not the small one. They already
have rulesets, code scanning and Copilot Autofix. If they decide to package
this, they give it away.

### Where our defence lies

Not in generating configuration: that becomes a commodity and GitHub can give
it away. It lies in three places:

1. **Multi-platform.** GitLab and Bitbucket exist, and GitHub is not going to
   support them.
2. **Stack-agnostic.** The pack catalogue covers what a specific platform does
   not prioritise.
3. **The measurement layer.** Nobody is going to measure a client's debt better
   than whoever has been measuring it for two years. The accumulated history is
   a real switching cost, and it is the only thing that cannot be copied by
   publishing a repository.

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| N1 | GitHub makes it native | Multi-platform, multi-stack and owning the measurement |
| N2 | Guided flows are expensive to maintain: if you say "I'll dockerize you", you own every failure mode in every stack | Start with **one** stack (Node/TS) and do not widen until it works without manual support |
| N3 | One person does not sell enterprise | Self-service with free `scan` as the hook; agencies as the first paying segment; enterprise later or with a partner |
| N4 | Overpromising ("bug-free code") destroys credibility in the first technical meeting | §3 of this document is required reading before writing any sales material |
| N5 | A subscription has more friction than a one-off payment in the Spanish market | One-off payment as an entry offer, product designed for subscription |
| N6 | The competitor gets weeks ahead of us | Their scope is generating rules; ours includes applying and measuring them. Executing Phase 3 is the answer |

---

## 9. The metrics that really matter

| Metric | Why |
|---|---|
| **ARR** | It is what gets valued, and what says whether the business exists |
| **Net retention per account** | Above 100% means accounts grow on their own. It is the metric that separates a good business from a mediocre one |
| **Repositories per account** | Measures whether expansion inside agencies works |
| **Conversion from `scan` to a paid plan** | Measures whether the free hook hooks |
| **Debt reduced per account** | The renewal argument. If it does not go down, they do not renew |
| Support cost per account | The early indicator that guided flows are eating the margin |

---

## 10. Decisions taken and open

**Taken:**

- Annual subscription per repository ([ADR 0004](adr/0004-annual-subscription.md)).
- BUSL-1.1 licence ([ADR 0003](adr/0003-busl-license.md)).
- Local-first licence validation ([ADR 0002](adr/0002-local-first-licensing.md)).
- `scan` and `report` free forever, guaranteed by the licence.

**Open:**

- **Payment gateway.** Lemon Squeezy or Paddle act as *merchant of record* and
  handle the VAT of each EU country for a ~5% fee; Stripe charges ~2% but you
  handle intra-community VAT and the OSS yourself. Selling B2B to several
  countries from Spain, the first option probably pays off. To be decided
  before F5-2.
- **Exact price per tier.** The ranges in §4 are indicative. They are closed
  with the first three pilot clients (F6-4).
- **Trademark registration.** OEPM ~€150 per class, EUIPO ~€850. It is not
  needed to launch; it makes sense once there are sales to protect.
