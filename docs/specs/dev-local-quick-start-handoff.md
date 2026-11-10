# Codex handoff: quick dev-local start

Paste the prompt below into Codex.

---

Implement the ticket in `docs/specs/dev-local-quick-start.md`. Read it in full
first; it is the source of truth for scope, requirements and acceptance
criteria. Also read `docs/specs/parallel-validation.md` (DEV local section),
`tools/dev-local.mjs`, `tools/validation/browser-local.mjs`,
`containers/local/Dockerfile`, `containers/local/compose.match-review.yaml`,
`tools/deploy.mjs` and `tools/test/dev-local.test.mjs` before editing.

**Owner decisions for this task (these override the normal delivery workflow):**

- Work directly on the current working branch. Do not create a new branch,
  worktree or GitHub issue.
- Skip the full CI and publishing gates in `docs/agents/feature-workflow.md`:
  no full browser validation run, no full `./tools/target-build.ps1 verify`, no
  PR, no push, no merge. Do not commit; leave the changes uncommitted for the
  owner to review.
- The working tree already has unrelated modifications (`.notes/` screenshots
  and `site/src/development/index.html`). Do not touch, revert or stage them.

**What to build (summary; the ticket has the details):**

1. `tools/dev-local.mjs`: accept `--quick` with `--start` or `--restart`. Reject
   `--quick` alone, `--stop --quick`, and any unknown argument with exit status 2
   and the usage message, before any stop or build step. Keep the computer
   token and Node version preflight first in both modes. In quick mode, pass a
   no-op validator to `prepareLocalStart`, set `DEV_LOCAL_MAVEN_FLAGS=-DskipTests`
   in the `docker compose` environment, and print that browser validation and
   server tests were skipped, both at start and in the ready line.
2. `containers/local/Dockerfile`: add `ARG MAVEN_FLAGS=""` in the build stage and
   insert `${MAVEN_FLAGS}` into the existing `mvn` command. Use `-DskipTests`,
   never `-Dmaven.test.skip`.
3. `containers/local/compose.match-review.yaml`: pass
   `MAVEN_FLAGS: "${DEV_LOCAL_MAVEN_FLAGS:-}"` under the server's `build.args`,
   so a build with the variable unset still runs the tests.
4. `tools/deploy.mjs`: confirm it never passes `--quick`. Add a test assertion if
   none covers its dev-local arguments.
5. `docs/specs/parallel-validation.md`: replace "No CLI option skips validation"
   with a description of quick mode as manual-testing only, never accepted as
   handoff evidence and never used by `deploy.mjs`. Update the dev-local command
   notes in `browser-client/README.md` and `deployment/README.md`.
6. `tools/test/dev-local.test.mjs`: add the regression tests listed in the
   ticket's Validation section, and keep the existing "browser failure stops
   nothing" test passing.

Stay within the ticket's In Scope list. The Out of Scope items (npm ci caching,
the duplicate site build, parallel Docker build, hosted-only validation,
keeping the database up on restart) are separate follow-ups; do not implement
them.

**Validation to run:**

```powershell
node --test tools/test/validation.test.mjs tools/test/browser-local.test.mjs tools/test/deploy.test.mjs tools/test/dev-local.test.mjs
docker compose -f containers/local/compose.match-review.yaml config --quiet
```

The compose `config` check needs the `M6_*` secret-file variables; if they are
not set in your shell, say so instead of inventing values. Do not read, print or
copy the secret, ADC or token files.

If the owner's environment allows it, do one `node tools/dev-local.mjs --start --quick`
and record the wall-clock time and whether the Docker log shows Maven skipping
tests. If you cannot run it (Docker, ADC or token not available), say so and
stop there; do not run the full non-quick start.

**Report back with:**

- the files changed and a one-line reason for each;
- test results, with the output for any failure;
- the quick-start timing, or why it was not measured;
- any requirement in the ticket you did not meet, or a place where you departed
  from it, and why.

Then fill in the ticket's Completion Notes with the same evidence.
