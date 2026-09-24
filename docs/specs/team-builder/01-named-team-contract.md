# 01 — Named team contract

## Outcome

The versioned server draft accepts the identity of a match-ready Human team without changing the existing Human exhibition rules. A team name, player names, and jersey numbers become explicit choices; roster slots remain separate.

## Work

- Extend the server's `TeamDraft`, strict JSON decoder, catalog evaluation, and browser protocol types with `teamName`, `playerName`, and `jerseyNumber`. Each player retains its stable ID, `slot`, position and purchased skills. Do not accept client prices, base skills, calculated totals, ownership or dice.
- Use jersey numbers 1–99, unique within a team; keep slots unique from 1–16 for roster order. Names are bounded plain text: 1–50 Unicode code points for the team and 1–30 for a player after trimming and NFC normalization, with control characters rejected. Names are display data, not identity keys; duplicate names are allowed.
- Keep the existing Human catalog version and 1,150,000-gold preset unchanged. Extend the one Java `TeamValidation` implementation to check the new fields alongside all existing roster, skill, captain, resource and budget rules. Ensure the validation response identifies the field that failed.
- Give the changed draft shape an explicit version separate from the rules/catalog version. Update browser decoders, request schema and pinned wire fixtures together; reject unsupported shapes explicitly rather than silently treating a roster slot as a jersey number. Retain the existing 16 KiB ingress limit or justify any change with measured payloads.

## Acceptance

- A valid named Human draft receives the same legal cost/skill result as the equivalent current draft. Duplicate/out-of-range jersey numbers and invalid names receive stable, field-specific errors; unrelated rules outcomes do not change.
- The server does not trust client-supplied totals or ownership fields. Browser decoders reject unknown or mismatched draft shapes.
- This slice proves draft evaluation only. It does not save a new document, change a match snapshot, or change the public site.

## Likely files and focused checks

`ffb-server/.../team/bb2025/{TeamDraft,TeamValidation}.java`, `ffb-server/.../local/BrowserTeamJson.java`, `browser-client/src/team-protocol.ts`, team schemas and wire fixtures. Exercise focused Java catalog/validation and browser protocol/schema checks, then the required project build gate for changed modules.
