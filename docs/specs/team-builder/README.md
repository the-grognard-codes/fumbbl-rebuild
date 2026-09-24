# Match-ready team builder: implementation slices

Status: slices 01–04 implemented locally; slice 05 implemented with live Firebase sign-in acceptance deferred at the user's request, 2026-09-24. Implements the [accepted contract](../../team-builder-contract.md) and [ADR](../../adr/0001-account-owned-match-ready-teams.md). GitHub issues are disabled for this repository, so these reviewable specs live here until issue tracking is available.

The existing v2 service already has internal account IDs, owner-scoped saved teams, a Human catalog, Java validation, and create/join freezing. These slices extend that path and replace the separate public-page rule implementation. They do not create a new game authority or expand BB2025 content.

| Slice | Reviewable result | Depends on |
| --- | --- | --- |
| [01 — Named team contract](01-named-team-contract.md) | Versioned draft fields and one server legality module | Accepted contract |
| [02 — Account-owned saved teams](02-account-owned-saved-teams.md) | Durable save/list/load/update/delete and eligibility metadata | 01 |
| [03 — Named match teams](03-named-match-teams.md) | Create/join revalidation and immutable named match snapshots | 02 |
| [04 — Public team builder](04-public-team-builder.md) | Signed-in React builder at `/teambuilder` | 02; can proceed alongside 03 |
| [05 — Play selection and closeout](05-play-selection-and-closeout.md) | Named owned-team selection and integrated acceptance | 03 and 04 |

Each slice should end with its own changed-file list, exact focused and project-required checks, compatibility limits, and a next-slice handoff. Existing databases, backup volumes, and frozen matches must be preserved during development and verification. No production deployment, catalog expansion, or old-site JSON migration is part of these slices.

## Local verification

- The repository-wide `mvn clean install` passed. Java server reactor tests, browser client tests (66 passing), static site build/check/tests, and the three combined browser tests passed. The signed-in browser fixture also verified confirmed deletion after a saved team's Play selection.
- A disposable MariaDB marker-6 database was upgraded with `007-named-saved-teams.sql`, rolled back to marker 6 before new writes, upgraded again, and restarted. A format-2 saved team and frozen match kept identical SHA-256 hashes; a new format-3 saved team coexisted with the old row. Existing containers and volumes were untouched.
- The PowerShell 7 JSON-schema helper passed with the installed PowerShell 7.6.6 through an approved host-access command: one valid draft and ten invalid contracts. The default Codex workspace sandbox cannot resolve its WindowsApps executable; runtime decoders and their contract tests also passed.
- Final acceptance still requires real Firebase sign-in with two player accounts and a spectator against the deployed environment, including create/join, frozen roster after edit/delete and restart, and cross-account denial. No deployment has been made.
