# Revise the standard implementation workflow

Tracking issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/311

## Objective and scope

Make the usual method end with tested, self-reviewed work and a results report.
Update `AGENTS.md` and `docs/agents/feature-workflow.md` consistently. Keep the
existing design paths and explicit publication process.

## Requirements and acceptance criteria

- Track each required slice in a GitHub issue and create a new working branch.
- Implement, self-review intended behavior, test, validate, and report results.
- Require explicit authorization for staging, committing, pushing, opening a PR,
  merging, or deployment.
- Completion evaluates implemented work without requiring a merge.
- The handoff example matches the revised sequence.

## Constraints and validation

Preserve unrelated changes. This slice changes documentation only; review the
diff for consistency, check Markdown links, and run `git diff --check`.
Application builds and tests are unnecessary for these documentation edits.

## Outcome

Implemented on branch `docs/revise-standard-workflow`. Both instruction files
now describe issue slices, a working branch, implementation, self-review,
validation, and reporting. The example handoff and completion criteria match.
Publication actions require explicit authorization. Changes remain unstaged and
uncommitted for review.

Self-review found no remaining default publication or merge steps. Whitespace
validation and relative Markdown link checks passed. No application code changed;
application tests were not run. No known gaps remain in this documentation slice.
