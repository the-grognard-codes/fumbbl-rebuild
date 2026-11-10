# Feature: Quick dev-local start for manual testing

GitHub issue: _not yet created_

## Abstract

Add an opt-in quick mode to `tools/dev-local.mjs` that brings up the dev-local
stack for manual testing without running the full local browser validation
gate or the Maven test phase inside the review server image build. The default
`--start` and `--restart` behaviour, and every handoff and deployment path,
keeps the full gate.

## Objective

Cut a dev-local start for hands-on testing from roughly 12+ minutes to a few
minutes, without weakening the validation that handoffs and DEV deployments
rely on.

## Context / Existing Behavior

`node tools/dev-local.mjs --start|--restart` currently runs, in order:

1. `validateLocalBrowser` ([tools/validation/browser-local.mjs](../../tools/validation/browser-local.mjs)):
   `npm ci` for `browser-client`, Playwright Chromium install, `site` build, then
   every interaction and hosted browser suite in up to four shard processes.
   Recorded runs took 400–780 s for the suites alone.
2. `assemble.mjs --environment local-dev`, which builds `site` again.
3. `docker compose up -d --build server`. The image build
   ([containers/local/Dockerfile](../../containers/local/Dockerfile)) runs
   `mvn -B -ntp -DargLine=-Xmx3g -pl ffb-server -am clean package`, including all
   ffb-common and ffb-server tests. Recorded Maven times were 2.5–3.5 min when the
   build-context layer was invalidated, and under 40 s when it was cached.
4. Health waits, review ADC check, current-matches index, nginx proxy, Firebase
   Hosting emulator, `live-local-test.mjs` proxy probe, computer player daemon.

[parallel-validation.md](parallel-validation.md) (DEV local section) states
that DEV local validation finishes before stopping services and that "No CLI
option skips validation". `tools/deploy.mjs --environment dev-local` invokes
`dev-local.mjs --restart`. The existing guard test in
[tools/test/dev-local.test.mjs](../../tools/test/dev-local.test.mjs) asserts that
a validation failure prevents both start and restart from stopping services.

## In Scope

- A `--quick` flag accepted alongside `--start` or `--restart`.
- Skipping `validateLocalBrowser` in quick mode.
- A Docker build argument that lets quick mode skip Maven test execution.
- Amending `docs/specs/parallel-validation.md` to describe quick mode and its
  limits.
- Updating `browser-client/README.md` and `deployment/README.md` where they
  document dev-local commands.
- Regression tests in `tools/test/dev-local.test.mjs`.

## Out of Scope

- Changing the contents, sharding or coverage gate of the browser suites.
- Changing CI, `dev-remote`, or `prod` validation.
- Skipping `npm ci` by lockfile hash, removing the duplicate site build, running
  the Docker build in parallel with validation, a hosted-only validation mode, or
  keeping the database running on `--restart`. These are separate follow-ups.
- Building the server JAR on the host instead of in Docker.

## Functional Requirements

- `node tools/dev-local.mjs --start --quick` and `--restart --quick` start the
  stack without calling `validateLocalBrowser`.
- `--quick` is rejected with `--stop`, on its own, or with any other unknown
  argument; the usage message lists it.
- Without `--quick`, behaviour is unchanged: the full gate runs first and a
  failure stops nothing.
- In quick mode the review server image is built with Maven tests skipped via
  `-DskipTests` (test sources still compile). Without `--quick` the image build
  runs the tests exactly as today.
- The Dockerfile takes the Maven flag through a build `ARG` with an empty
  default, wired through `compose.match-review.yaml` `build.args` from an
  environment variable that only `dev-local.mjs` sets. A plain
  `docker compose build` with no variable set still runs the tests.
- Quick mode still builds the current local-dev Hosting artifact, rebuilds the
  server image from current working files, waits for health, runs the
  `live-local-test.mjs` proxy probe, and starts the computer player.
- Quick mode prints a clear line at start and at readiness, for example
  `Dev-local ready (quick mode: browser validation and server tests skipped)`.
- `tools/deploy.mjs` never passes `--quick`.
- Quick-mode starts are not acceptable evidence for the delivery workflow's
  validation step.

## Acceptance Criteria

- `--start --quick` reaches `Dev-local ready` without running `npm ci`,
  Playwright install, or any browser suite, and the Docker build log shows
  Maven ran with tests skipped.
- `--start` without `--quick` still runs the full browser gate and Maven tests.
- `--stop --quick`, `--quick` alone, and an unknown extra argument exit with
  status 2 and the usage message, before any stop or build operation.
- `deploy.mjs --environment dev-local` still runs the full gate.
- `parallel-validation.md` no longer states that no CLI option skips validation;
  it describes quick mode as manual-testing only, excluded from handoff evidence
  and deployment.
- Wall-clock time for a quick start after a Java change is recorded in the
  outcome notes alongside a full start for comparison.

## Constraints

- Work on the current working branch; the owner has waived a separate branch
  and the full CI publishing gates for this tooling change.
- Preserve unrelated working-tree changes.
- Follow existing repository conventions (`tools/` ESM style, uppercase error
  codes, no legacy `f`/`p` prefixes).
- Keep the computer-player token and Node version preflight before any stop or
  build operation in both modes.
- Do not commit or push unless explicitly requested.

## Implementation Guidance

- `prepareLocalStart(restart, { validate, ... })` already injects the validator;
  pass a no-op validator for quick mode rather than branching inside it.
- Replace the `process.argv.length !== 3` check with explicit parsing of one
  mode plus an optional `--quick`.
- Dockerfile sketch: `ARG MAVEN_FLAGS=""` in the build stage, then
  `mvn -B -ntp -DargLine=-Xmx3g ${MAVEN_FLAGS} -pl ffb-server -am clean package`.
  Compose sketch: `args: { MAVEN_FLAGS: "${DEV_LOCAL_MAVEN_FLAGS:-}" }`. Set
  `DEV_LOCAL_MAVEN_FLAGS=-DskipTests` only in the quick-mode `docker compose`
  environment in `dev-local.mjs`.
- Note that a quick build and a full build share layer cache keys except for the
  build argument, so switching modes triggers one rebuild of the Maven layer.
  This is expected.
- Record the change under Unreleased in `CHANGELOG.md` if the project treats
  developer tooling as user-visible; otherwise note it in the outcome file.

## Validation

- Extend `tools/test/dev-local.test.mjs`:
  - quick mode does not call the validator and still stops services in the
    same order as today;
  - full mode still calls the validator first, and a validator failure still
    stops nothing;
  - argument parsing rejects `--stop --quick`, `--quick` alone and unknown
    arguments with status 2 and no stdout from stop/build steps.
- Run `node --test tools/test/validation.test.mjs tools/test/browser-local.test.mjs tools/test/deploy.test.mjs tools/test/dev-local.test.mjs`.
- Manually run one `--start --quick` and one full `--start`, recording both
  durations.

## Completion Notes

Implemented on the existing `main` working branch; changes remain uncommitted.
No branch, worktree, issue, PR, push, merge, or publication was created. The
existing `.notes/` screenshots, `site/src/development/index.html`, and handoff
file were left untouched.

Files changed:

- `tools/dev-local.mjs`: parse the optional quick flag, reject invalid arguments
  with status 2 before side effects, inject a no-op validator in quick mode,
  scope Maven flags to Compose, and label quick startup/readiness. The token and
  Node preflight still runs first. Full mode clears an inherited Maven override
  so it cannot accidentally skip server tests.
- `containers/local/Dockerfile`: accept an empty-default `MAVEN_FLAGS` build
  argument in the existing Maven invocation.
- `containers/local/compose.match-review.yaml`: wire `DEV_LOCAL_MAVEN_FLAGS`
  into the server build argument, defaulting to empty.
- `tools/test/dev-local.test.mjs`: cover accepted/invalid arguments, quick/full
  validation and stop ordering, Compose environment isolation, and prerequisite
  failure before side effects in both modes; retain the browser-failure guard.
- `tools/test/deploy.test.mjs`: assert the exact dev-local invocation is
  `dev-local.mjs --restart`, with no quick flag. `tools/deploy.mjs` was inspected
  and required no source change.
- `docs/specs/parallel-validation.md`: document the manual-testing exception and
  exclude it from handoff evidence and deployment.
- `browser-client/README.md`: document quick start/restart and their limits.
- `deployment/README.md`: document quick commands, retained checks, full deploy
  validation, and the Maven build-cache distinction.
- `CHANGELOG.md`: record the tooling change under Unreleased.
- `docs/specs/dev-local-quick-start.md`: record implementation and validation
  evidence here.

Validation:

- `node --test tools/test/validation.test.mjs tools/test/browser-local.test.mjs tools/test/deploy.test.mjs tools/test/dev-local.test.mjs`:
  **38 passed, 0 failed, 0 skipped**, exit 0 (1.72 seconds reported by Node).
  No test failure output to report.
- `git diff --check` for the changed tracked files: passed.
- Standalone `docker compose -f containers/local/compose.match-review.yaml config --quiet`:
  not run because `M6_ADC_FILE`, `M6_DB_PASSWORD_FILE`, and
  `M6_DB_ROOT_PASSWORD_FILE` were all unset in the shell. No values were invented.
  The quick-start command's own `config --quiet` passed using its existing
  read-only container-mount discovery.
- The sandboxed Docker availability probe initially failed with
  `permission denied while trying to connect to the docker API at npipe:////./pipe/docker_engine`
  and a Docker configuration access denial. Following
  `C:/Users/jaken/.codex/EXECUTION_ENVIRONMENT.md`, the same read-only probe
  succeeded outside the sandbox (Docker 29.7.2); the authorized quick start used
  that execution context. Credential contents were not inspected or copied.

Manual quick-start outcome:

- `node tools/dev-local.mjs --start --quick`: **exit 0, 73.14 seconds wall clock**,
  reaching `Dev-local ready (quick mode: browser validation and server tests skipped): http://localhost:5000/play`.
  The local stack is running for owner review.
- Build output was recorded in the ignored local evidence file
  `.tools/dev-local-quick-start-validation.log`. It shows
  `mvn -B -ntp -DargLine=-Xmx3g -DskipTests -pl ffb-server -am clean package`,
  `Tests are skipped.` for both `ffb-common` and `ffb-server`, and `BUILD SUCCESS`.
  Maven reported 18.054 seconds. The clean build compiled 8 common and 123 server
  test source files, confirming that test compilation remains enabled.
- No `npm ci`, Playwright installation, or full browser suite ran. The current
  Hosting artifact and server image were built; database/server health, Firebase
  ADC, the live proxy probe (1 passed), and computer-player readiness all passed.

Remaining validation limits / owner overrides:

- No full non-quick start, full browser validation, or full
  `./tools/target-build.ps1 verify` was run, per the owner's explicit scope.
  Server test execution remains intentionally unverified in this run; full-mode
  validator ordering/failure and Maven flag selection are covered by the scoped
  regression tests.
- The ticket's paired full-start timing and measurement specifically after a
  Java edit were not performed: no Java changes belong to this tooling task,
  and the owner requested only one quick start while excluding full validation.
  This run did rebuild the Maven layer and compile Java sources. The ticket's
  existing roughly 12+ minute full-start figure is historical context, not a
  fresh comparison measurement.
- The standalone Compose check remains unperformed with shell-provided variables
  because all three required `M6_*` variables were unset; the script-managed
  Compose check passed as described above. No other implementation requirements
  were omitted, and no out-of-scope follow-ups were implemented.
