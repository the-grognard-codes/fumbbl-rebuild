# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

For newly scoped work, create or locate a GitHub issue before implementation.
Keep a Markdown mirror in `TODO.md`, `issues.md`, or the relevant local spec with
the issue URL, decisions, and acceptance evidence. GitHub owns issue state,
assignment, and discussion; the local document keeps the design and handoff
readable in the checkout. Update both when scope or status changes, and link the
closing PR or verification in the issue before closing it. Historical completed
work does not need retroactive issues.

Review a backlog migration before creating issues in bulk. Issue bodies and local
mirrors must not contain credentials, tokens, private account identifiers, or
private game data. Use the designated project administrator for project logins
and credential management; reserve test identities for application testing.
The initial eleven-issue migration is recorded in
`.notes/issue-migration-plan-2026-09-26.md`.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`, including labels.
- **List issues**: use `gh issue list` with appropriate state and label filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: use `gh issue edit`.
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve an ambiguous
number with `gh pr view <number>` and fall back to `gh issue view <number>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

The map is one issue labelled `wayfinder:map`, with child issues used as tickets.

- Create child tickets as GitHub sub-issues where supported.
- Otherwise link them through the map task list and add `Part of #<map>` to each child.
- Use `wayfinder:<type>` labels for `research`, `prototype`, `grilling`, or `task`.
- Represent blocking through native GitHub issue dependencies where available.
- Otherwise add a `Blocked by: #<number>` line to the child.
- Claim work with `gh issue edit <number> --add-assignee @me`.
- Resolve work by commenting with the answer, closing the child, and recording its
  context pointer in the map's Decisions-so-far section.
