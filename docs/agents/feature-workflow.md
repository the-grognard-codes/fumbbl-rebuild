# Feature design and delivery workflow

This is the proposed path from an idea to completed work. The design record is
the source for later acceptance checks; GitHub issues track the work. Use the
smallest path that resolves the decisions and gives each implementer a clear
scope.

## Choose the design path

### A consequential decision in a major improvement or feature

1. Start with the idea and use `/grill-with-docs` to settle scope, feasibility,
   functional requirements, success criteria, constraints, and alternatives.
   Investigate facts in the repository or primary sources. Use a prototype when
   a design question needs a runnable answer.
2. Record an ADR when a decision is hard to reverse, would surprise a future
   reader, and involves a real trade-off. Refine the ADR until its decision and
   reason are clear. A large feature does not automatically need an ADR.
3. Review the proposed behavior and decisions with the user. Use `/to-spec` to
   capture the agreed problem, outcome, stories, implementation and testing
   decisions, and exclusions in a parent GitHub issue. Keep a local design
   mirror as described in [issue-tracker.md](issue-tracker.md).
4. Identify the required technical and nontechnical workstreams, their owners
   or responsible roles, deliverables, dependencies, and acceptance evidence.
   Use `/to-tickets` for independently verifiable implementation slices and
   their blocking relationships. Create separate tracked deliverables for
   nontechnical work that cannot fit a vertical implementation slice.
5. Treat each approved issue and its linked design records as the durable
   handoff for that workstream. Use `/handoff` when moving a live conversation
   to another session, directory, or person; point it to the existing records.

### A focused design without a consequential decision

1. Start with the idea or requirement. Use `/grill-with-docs` to settle scope,
   feasibility, functional requirements, success criteria, and exclusions.
2. Review the resulting plan with the user. For work that spans sessions, use
   `/to-spec` for the parent spec and `/to-tickets` for small, complete,
   independently verifiable slices. Include genuine blocking relationships.
   A single focused change can proceed from its approved issue without an
   artificial parent spec or multiple tickets.
3. Hand each ready slice to the implementation workflow below. Complete slices
   in dependency order; independent slices may proceed when their blockers are
   done.

## Implementation handoff for each slice

The **normal process**, also called the **usual method**, is the sequence below.
When the user requests this process for agreed work, that authorizes creating
the working branch, implementing, reviewing, validating, staging, committing,
pushing the working branch, opening the PR and merging it after required checks
and review requirements pass. Carry the authorized sequence through completion
without requesting permission again for those steps. Land changes in `main`
through the PR; direct pushes to `main` are outside this authorization.

The handoff identifies the issue, design record, acceptance criteria, branch
base, relevant constraints, and the authority granted for publishing and
merging. An implementer can then:

1. Start a short-lived branch from current `main`, using a separate worktree
   when the current checkout contains other work.
2. Implement the slice and its relevant tests, documentation, change-list entry,
   and media or visual assets. Keep the slice independently verifiable.
3. Review the diff against the issue and design intent, including behavior,
   repository standards, and unintended scope. Fix findings.
4. Run focused checks and the relevant project-required validation. Inspect
   visual or media output in its actual use context when applicable.
5. Stage only the intended files, commit with the repository's usual message
   style, push, and open a PR linked to the issue and parent spec.
6. Wait for required checks, resolve review comments and failures, and merge
   when the granted authority and branch rules allow it. Record the PR and
   acceptance evidence on the issue and local mirror.
7. Repeat for the next ready slice until every required technical and
   nontechnical deliverable is complete.

Merging runs GitHub checks; DEV Hosting publication is explicit through
`node tools/deploy.mjs --environment dev-remote`, after local browser validation
of the exact main commit. See [deployment usage](../../deployment/README.md).
The implementation handoff should name publication authority separately.

## Completion

Compare the finished result with the original plan and parent spec. Check every
functional requirement, visual and media requirement, exclusion, and the
original intent against the merged work and acceptance evidence. Record matches,
changes made during delivery, remaining gaps, and links to PRs and checks in a
Markdown outcome report next to the local design mirror. Present that report to
the user.

Then use `/retro` to examine what the coding sessions suggest improving in the
agent's environment. Its current purpose is process improvement; the outcome
report above is the product acceptance review.

## Authorization text for a future handoff

Name the agreed scope and use:

> Proceed with the work in the usual method: new working branch > implement
> the changes > self-review code for intended outcome and behavior > test and
> validate > stage changes > commit with standard message > open PR > merge.

For an approved spec, multiple issues or tickets, or work organized around an
ADR or design with several implementation slices, optionally append:

> Repeat until all slices are complete.

When included, this clause carries the full sequence through every approved
slice, in dependency order, rather than stopping after the first PR.

This authorization applies to the named work only; changes in scope are
recorded against the spec before implementation continues. Release or deployment
authority must be named separately.
