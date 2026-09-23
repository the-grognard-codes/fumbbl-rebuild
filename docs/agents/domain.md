# Domain Docs

This repository uses a single-context domain-documentation layout.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- Relevant decisions under `docs/adr/`.

If either location does not exist, proceed silently. The domain-modeling workflows
create this documentation lazily when terminology or decisions are resolved.

## File structure

```text
/
├── CONTEXT.md
├── docs/adr/
└── source modules
```

## Use the glossary's vocabulary

When output names a domain concept, use the term defined in `CONTEXT.md`. Avoid
synonyms that the glossary explicitly rejects.

If a needed concept is absent, reconsider whether the term belongs to the project
or record the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an accepted ADR, identify the conflict explicitly
instead of silently overriding the decision.
