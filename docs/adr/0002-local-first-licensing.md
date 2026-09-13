# ADR 0002 — Local licence validation, with no remote logic

- **Status:** accepted
- **Date:** 2026-09-08
- **Affects:** Phase 5 (licensing) and the packaging

## Context

The original specification proposed two anti-piracy measures:

1. **Remote execution**: the rules and templates would not live in the NPM
   package, but would be downloaded from our API after validating the token,
   to prevent unauthorised copying.
2. **`ci-guard`**: inject into the client's repository a validation package
   that **would make their GitHub Actions pipelines fail** if the token stopped
   being valid.

The goal —protecting revenue— is legitimate. The means are the problem.

## Decision

All the code and all the rules travel in the NPM package. The licence is
validated against the API **only** on `init` and `upgrade`, and the result is
cryptographically signed in `.governance/config.yml`, verifiable locally
against an embedded public key.

`scan`, `plan`, `apply`, `rollback` and `doctor` work **offline and forever**.
No dependency capable of making the client's CI fail is injected. An expired
licence stops bringing new rules; it never degrades or blocks an already
configured repository.

## Discarded alternative

The PDF's, as it stands. It is discarded for two independent reasons, each one
sufficient on its own:

**It blocks the sale.** Downloading and running logic at runtime from an
external server is one of the first things a corporate security department
vetoes in a vendor review. We would have built a product that the target buyer
cannot approve.

**It contradicts the product.** We sell "you can see exactly what is going to
happen before it happens". A binary that downloads opaque instructions is the
opposite of that. And a package that deliberately breaks a client's CI reads,
from their side, as sabotage: it destroys the trust that is the product's
asset.

## Consequences

**In favour:**

- The product passes a vendor review.
- It works in air-gapped environments, which are common in banking and
  healthcare —two sectors that pay well.
- No outage of our infrastructure can block a client's work.

**The cost we accept:**

- The code can be copied. Someone with the will to do it can extract the rules
  and use them without paying.

We accept it knowingly: what is sold is not the binary, it is the **continuous
updating** of rules that go stale (ESLint 10 will come out, `ruff` will change
its options) and the support. A client who copies the package is left with a
snapshot that ages. The chosen code licence (see ADR 0003) also covers the
serious case, which is not internal copying but resale.
