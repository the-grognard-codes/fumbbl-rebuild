# Branch and release controls

Apply these repository settings after merging the workflow changes. Workflow
files can request an environment, but only GitHub repository settings can make
that environment require approval or make a tag immutable.

## `main` branch rule

- Require pull requests before merging and block force pushes and deletion.
- Require these checks from the `Checks` workflow: `Validate`, `Java 21 target
  verification`, and `Static delivery`; also require `GitHub Actions lint` and
  `Secret scan` from `Workflow and secret checks`.
- Require review-conversation resolution. Approval count may remain zero for a
  solo repository.
- Allow only squash merges and delete branches after merge.
- Keep administrator bypass available only for incident recovery.

## Release tag rule

- Protect `moles-v*` with a tag ruleset that blocks update and deletion, and
  allows creation only by release maintainers.
- Create tags only from commits already on `main`. The production workflow also
  checks that invariant before deploying.

## Environments

- Create a `development` environment without approval requirements.
- Create a `production` environment and require an approver before deployment.
- Restrict each environment's deployment branches/tags to the intended release
  path (`main` for development; `moles-v*` tags for production).

The complete contributor workflow and release procedure are in
[development-and-release.md](../docs/development-and-release.md).
