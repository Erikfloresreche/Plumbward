# ADR 0003 — Business Source License 1.1 for the code

- **Status:** accepted
- **Date:** 2026-09-09
- **Affects:** `LICENSE`, the commercial strategy and Phase 5

## Context

We have to choose the licence the code is published under. The decision is
shaped by a real tension in the product:

- Our strongest sales argument is **"you can audit exactly what it does"**.
  That pushes towards code the client can read.
- The business model is selling licences per repository. That pushes towards
  protecting the code.

## Decision

**Business Source License 1.1**, with these parameters:

- **Change Date:** 2030-09-09 (or the fourth anniversary of each version,
  whichever comes first).
- **Change License:** Apache-2.0.
- **Additional Use Grant:** every command that **does not modify** the target
  repository is free to use in production, with no limit on repositories. As
  of today they are `scan`, `plan` and `doctor`. The rest falls under the
  licence's default terms, which require buying a commercial licence.

  The grant is worded by **property** ("does not modify the repository") and
  not as a closed list, so that it does not go stale every time we add a
  command. The enumeration is illustrative and dated.

## Discarded alternatives

**Open core (Apache-2.0) with paid packs.** It maximises adoption, which is the
sales channel. It is discarded because the transactional engine —plan, journal,
rollback, managed blocks— is the hard and differentiating part. Giving it away
lets a competitor build on top without having paid the cost of designing it,
and the packs, which would be the paid part, are the easy part to replicate.

**Everything proprietary in a private repository.** Maximum protection, but it
loses the organic adoption channel and, above all, forces us to ask a security
team to trust a black box that is going to write to their repository. That is
asking too much.

## Consequences

**In favour:**

- The repository can be public. A prospective client audits the code before
  buying, which is exactly what we want them to do.
- Nobody can resell it or offer it as a competing service.
- The free `scan` is protected by the licence, not only by a product decision
  we could reverse. It is a credible commitment.
- Every version ends up as Apache-2.0. That defuses the "what if you
  disappear?" objection, which always comes up in an enterprise purchase.

**The cost we accept:**

- BUSL **is not an open source licence** under the OSI definition. Some people
  will criticise it, and it will not appear in free software listings.
- Some companies have policies that forbid non-OSI dependencies. We will lose
  those clients or have to negotiate a separate commercial licence.
- It is a less known licence than MIT or Apache, and that raises questions in
  the purchasing process. It is worth having the one-sentence explanation
  ready.

## Text verification

Checked on 2026-09-09 against two canonical sources: the prose published at
https://mariadb.com/bsl11/ and, above all, MaxScale's `LICENSE25.TXT` file in
the MariaDB repository, which is the **template form for adopters** —parameter
block plus four numbered covenants— and therefore the artefact to compare
against.

Two things were corrected: the word `Section`, replaced by `License` in the
trademark paragraph, and the restoration of the full `Notice` block, which was
missing entirely. That block contains the statement that the BUSL **is not an open
source licence**, which is precisely the cost this ADR says it accepts;
omitting it would have been inconsistent.

**Two documented traps, so that nobody "corrects" them back:**

1. The copyright attribution of an adopter file is
   `(c) 2020 MariaDB Corporation Ab`, **not** the `(c) 2024 MariaDB plc` the
   website shows today. They are different artefacts. Our file is correct.
2. The MariaDB website renders the covenants as **two** instead of four,
   welding the `(b) insert the text "None"` of the second one to the third and
   the fourth. It is a layout bug on the website. Our four covenants are
   correct.

**Still pending:** a legal review before invoicing the first licence. It
remains to be decided whether the two links to the MariaDB FAQ, included here
verbatim for fidelity, are kept or removed: many adopters remove them.
