# Issue #523 outcome

Branch: `codex/523-engine-worker-fail-fast`, based on `55f0be032`.
Scope and acceptance: [local issue mirror](issue-523.md).

- A throwable escaping the worker's existing recoverable exception handler
  closes admission and marks health failed before logging. A nonzero JVM halt
  bypasses the normal shutdown drain, so the damaged engine cannot continue
  running commands. Log context follows the selected transport lane and includes
  only recognized request types and canonical match IDs. On a VM-reported heap
  OOM, HotSpot dumps and exits before Java can run this handler.
- `GET /health/engine` is available only to loopback callers. It checks worker
  liveness and progress within the last 10 seconds, including idle polls. Docker
  reports unhealthy after three failed five-second probes once the server has
  started. Its restart policy responds to a nonzero exit; a stall only changes
  the health status.
- Dev-local keeps dumps in the host bind mount documented in
  [the local runtime README](../../../containers/local/README.md). Hosted dev
  uses a private systemd state subdirectory and restarts after five seconds.
  Each JVM launch gets a distinct filename, including Docker restarts with
  the same PID. Retention behavior and the checkpoint format were left unchanged.

Self-review checked the actual match-review Compose profile used by `dev-local`,
confirmed that the hosted proxy forwards only the existing WebSocket route,
and checked that failed work cannot enter the graceful drain. The fatal
logging path requests exit even if logging throws.

Validation:

- `tools/target-build.ps1 test -Module ffb-server`: 826 server tests discovered,
  no failures or errors, 15 opt-in skips. A follow-up run of
  `SetupApplicationReadOnlyLoadTest` passed all three tests, including the added
  fault injection that restores the last accepted native revision and save
  proposal from the committed repository record after a failed checkpoint.
  Maven used Temurin 21.0.12.1 and an explicit Mockito startup agent because the
  Windows sandbox blocked Mockito's dynamic attach.
- The queue and route tests verified health while working, a 503 for stalled
  or unavailable state, recovery after progress resumes, and a real child JVM
  exit with a single contextual error log and no shutdown hooks.
- The server package built successfully. All 539 browser tests and 11 dev-local
  Node tests passed.
  Docker Compose rendered the expected bind mount, probe and restart policy.
  An isolated container ran the new entrypoint with a synthetic 32 MiB heap
  workload: two JVM heap OOMs, two Docker restarts, and two nonempty dumps
  (19.25 MB each) visible on the host.
- Local Ubuntu accepted the unit with a stand-in executable for the unavailable
  hosted Java path. A temporary systemd service with the same restart policy
  and delay restarted after exit 1 and received a fresh invocation ID.

No live hosted rollout or full browser/DB crash-and-reconnect run was performed.
The worker exit, Docker and systemd restart policies, and native checkpoint
recovery were tested separately.

The [review follow-up](https://github.com/the-grognard-codes/fumbbl-rebuild/pull/528#issuecomment-6843454310)
checked two more launch cases. An isolated Docker container with an unwritable
dump destination logged a warning, wrote a synthetic OOM dump in `/tmp`, and
exited with status 3. That temporary dump is discarded when the container stops.
Local systemd passed the candidate's exact `-XX:HeapDumpPath` argument to a test
process and expanded it to two distinct invocation IDs across an automatic
restart. The invocation ID avoids a filename collision if the host reuses a PID.

The unit and runbook now distinguish the restart policy while the service is
running from the recovery and cutover approval required to enable it. A new
health route test verifies that a non-loopback peer receives 404 even if it
sends a loopback forwarding header. Protocol dispatch and fatal logging use
the same request type names, so new types need only one wire name declaration.
The review rerun of `tools/target-build.ps1 test -Module ffb-server` found 828
server tests, with zero failures or errors and 15 opt-in skips.
