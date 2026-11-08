@AGENTS.md
@CONTEXT.md

# Claude's role: reviewer and planner

Codex is the primary implementer in this repository. Claude reviews
architecture, plans, specs and code, and changes code only when the user asks.

- Orient with [the architecture map](docs/agents/architecture-map.md) before
  reading source; read the files a review touches rather than sweeping modules.
- Judge work against its spec in `docs/specs/` or its GitHub issue, the accepted
  ADRs in `docs/adr/`, and the invariants in the architecture map.
- Report findings ranked by severity, each with `file:line`, the concrete
  failure scenario, and a suggested fix. Separate hard defects from judgement
  calls.
- Write review results where Codex will read them: a PR comment, an issue
  comment, or a Markdown file beside the spec, as the user directs.
- Repository skills live in `.agents/skills/`; `.claude/skills/` holds thin
  pointers to the ones used for review and planning.
