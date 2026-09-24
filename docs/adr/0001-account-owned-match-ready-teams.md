---
status: accepted
---

# Account-owned, match-ready teams use server rules

The public team builder currently calculates BB2025 legality in a standalone browser script, while match preparation accepts a different, server-validated team document. We will make `/teambuilder` a React client of the versioned server catalog and use the same Java validation module when evaluating a draft, saving a team, and independently creating or joining a match. The server binds each saved team to one internal account ID and freezes a separate match team for each match. This places rule changes and legality checks in one module and prevents a locally valid-looking export from being mistaken for a playable team.

We considered extracting the standalone script's rules into an internal browser module, as proposed by architecture review Candidate 03. That would improve DOM testability but preserve a second rules implementation beside the authoritative server catalog. The browser may calculate provisional guidance from catalog data; only server validation can accept a saved team or match team. See [the accepted contract](../team-builder-contract.md) for the resulting product behavior.
