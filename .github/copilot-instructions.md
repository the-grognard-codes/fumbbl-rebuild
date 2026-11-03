# Copilot repository instructions

## Ruleset
- BB2025 is the only supported ruleset. Keep rules implementations in `bb2025` packages and reusable domain infrastructure in `common` packages. Reject unsupported ruleset input explicitly.

## Services
- Prefer instantiable service classes with instance methods over static utility classes/methods; create a service instance at the call site instead of calling static methods.

## Naming
- Do not use legacy `f` or `p` prefixes for new fields or parameters.

## Change list entries
- Record user-visible changes under Unreleased in `CHANGELOG.md`. The public `site/updates.json` records actual merged PRs; add entries there only after merge.

## Browser runtime
- Browser V2 is the supported product runtime. Retain V1 as explicit development-only diagnostics.
- Preserve native engine commands and assets used by browser play, replay and recovery.
