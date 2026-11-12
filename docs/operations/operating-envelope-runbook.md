# Local single-worker operating-envelope capture

Run only against an owned local FFB Compose stack. The default is
`ffb-match-review`. Select a separate project and ports before startup when
another test owns the default services. No production or external fault targets
are used. Production limits remain 32 resident sessions, 16 sockets and 128 ingress tasks.

## Provenance

The harness is new on the #508/#39 branch. No isolated earlier harness was imported. Reviewed and reused the native fixture pattern from `SetupSessionMovementTest`, fresh-connection/checkpoint fixture from `JdbcHealthyWorkerMariaDbTest`, and actual Jetty socket pattern from `JdbcPublicationMariaDbTest`, all present in baseline `d3dabde26026654930768bf18799777d84b5d589`. The test-only `EnvelopeTransportProbe` accesses the production transport to observe numeric samples and schedule owner-thread controls; it changes no runtime limits or scheduling.

## Reproduce

1. Check out the exact implementation/harness revision named in the results report. Use pinned `tools/target-build.ps1 verify`, browser unit/build and lobby browser checks before measurement. Run the accounting and routing checks with `node --test tools/diagnostics/summarize-operating-envelope.test.mjs tools/diagnostics/envelope-local-stack.test.mjs`.
2. Choose the stack before starting services. Use `node tools/dev-local.mjs --restart --quick` only when the default stack and localhost:5000 are available for this task. Otherwise follow the isolated startup procedure below. Inspect server/proxy startup. Record validation failures and competing activity. Wait for other builds/load tests to finish for an uncontended comparison. Captures taken alongside another workload must be labeled contended and cannot certify capacity. Quick startup skips tests and requires separate validation.
3. Run `node tools/diagnostics/run-operating-envelope.mjs .tools/envelope-<unique-name>` from that checkout. The script refuses an existing result or schema, creates only `ffb_envelope_test`, reads the local Docker secret without printing it, and drops its schema in `finally`. It uses pinned Java/Maven through `target-build.ps1`. After an interrupted process, inspect ownership before manually removing the schema; never drop the development database.
4. Run `node tools/diagnostics/summarize-operating-envelope.mjs .tools/envelope-<unique-name>`. Preserve manifest, numeric measurement, summary and external resource samples. Inspect errors and target failures before interpreting percentiles. A nonzero harness exit means partial coverage, even if a JSON artifact exists.
5. For a baseline, use an isolated checkout of the named baseline and copy only the reviewed harness files from the final harness commit. Record both revisions and imported file hashes. The checked-in gzip fixture contains only synthetic fixture players and native state (no real identities or bearers); the runner expands it into an ignored seed file. Set `ENVELOPE_SEED_FILE` to the same absolute ignored seed file for both runs. Both manifests record source and seed hashes. Do not copy #508 production changes. Baselines before slice 2 deliverable A have **control timing unavailable** and cannot establish all-task compliance.

## Workload and interpretation

The fixture restores 32 active native sessions by cycling two valid coaches through real TCP/WebSocket loads. It then admits two coaches, one spectator and 13 idle sockets. Only one match is actively played at a time across three repetitions; this is not a claim of 32 connected matches, eight concurrently active two-coach matches, or a maximum-throughput result. Each repetition performs eight durable end-turn actions with at least 2,000 ms between iterations, plus current-match and detailed browse traffic. Warmup/restoration samples are retained separately from request-phase distributions. Native expiry and disconnect work are collected even without request IDs.

The local Firebase SDK double feeds production verification, cache and breaker code. Its controlled unavailable calls last 250 ms; it is not a measurement of external Firebase latency or HTTP retries. A loopback TCP forwarder supplies database failure without stopping the shared database. Twenty-request outage bursts spaced by 100 ms and recovery calls record actual dependency attempts. The real database shares a dev-local container; CPU/RSS samples identify that contention limitation.

Slow delivery uses one controlled Jetty write callback with 15 real TCP sockets present. It distinguishes watchdog close from a worker cleanup barrier. It is a deterministic transport fault, not an OS TCP bandwidth measurement. Durable recovery uses a new application instance and the same durable repositories, rather than killing a production process. Completed-session release and socket cleanup counters must be inspected, not inferred from successful request replies.

Numeric task kinds are 0 ingress, 1 other control, 2 decision expiry, 3 disconnect. Queue and full execution distributions are separate. The collector deduplicates the bounded sample ring by sequence and reports gaps against cumulative counts. Never replace missing control samples with ingress p99. Percentiles use nearest rank; all request outcomes remain in end-to-end distributions. A small sample p99 is often its maximum. Tasks over 100 ms / approximately 250 ms / 2,000 ms remain target evidence, not permission to relax ADR 0006.

The ingress saturation phase deliberately holds one test control task for 250 ms before submitting 160 serialized WebSocket writes. This is a declared queue-pressure fixture, not healthy gameplay. Its control execution remains in all-task measurements and is separated by phase. Socket closure may discard admitted but not yet executed messages; every submitted request remains counted.

## Refresh the synthetic retention timestamp

The archived seed has a real activity timestamp and will be abandoned by the unchanged 24-hour policy on a later day. Before a new comparison, create one fresh ignored copy, then use that same file for both runs. Only `saveResume.lastPlayerActivityAt` changes; the checksum is recomputed. Keep Python's arbitrary-precision integers for the native payload.

Run this Python recipe once from the checkout (choose a new output filename if it exists):

```python
import gzip, hashlib, json, time
from pathlib import Path
seed = json.loads(gzip.decompress(Path(
    "ffb-server/src/test/resources/operating-envelope/synthetic-turn.json.gz"
).read_bytes()))
seed["payload"]["saveResume"]["lastPlayerActivityAt"] = time.time_ns() // 1_000_000
body = json.dumps(seed["payload"], ensure_ascii=False, separators=(",", ":"), allow_nan=False)
text = '{"payload":' + body + ',"sha256":"' + hashlib.sha256(body.encode()).hexdigest() + '"}'
with Path(".tools/envelope-seed-fresh.json").open("x", encoding="utf-8") as output:
    output.write(text)
```

In PowerShell set `$env:ENVELOPE_SEED_FILE = (Resolve-Path .tools/envelope-seed-fresh.json).Path` before invoking either runner. Preserve that input with the results. The 2026-11-10 report archives the exact refreshed seed, both hashes and the timestamp change. This is fixture preparation, not a runtime retention-policy change.

The final capture records one whole reconnect from immediately before abrupt disconnect through new socket/authentication and duplicate confirmation. Its single-sample percentiles are explicitly not a stable tail estimate. The measured engine runs in a host test JVM; dev-local startup is a separate check and MariaDB is the actual local container. Do not use the result as container sizing.

The corrected healthy workload requires both lobby reads to be ACCEPTED and waits at least 2,000 ms between iterations, matching the shared bucket refill. Summaries retain admitted-read and rejected-read latency separately, alongside every outcome and full worker timing. Earlier 500 ms captures mix throttling with admitted work and are superseded for equal-work comparisons. Both baseline and integrated runtime include #507 option A, merged in PR #518 (merge 53655f62f, before baseline d3dabde260); its final notice-budget correction eb1d1dbe3 is an ancestor of each. See the publication-authorization outcome for the approved passive-viewing policy.

## Repeated comparison

To preserve another local test, use a separate Compose project and distinct
loopback ports, database and backup volumes. Set `ENVELOPE_DOCKER_PROJECT` to
that project's name, for example `ffb-pr521-review`. Both runners verify the
database's project/service ownership and discover its single loopback port from
Docker. The default remains `ffb-match-review`. Do not restart the shared
dev-local launcher while another test owns it. Record any concurrent workload
as competing host activity and avoid capacity claims from contended captures.

### Isolated startup

The shared launcher has fixed ports and shared process state. Do not invoke it
for the isolated project. Prepare an ignored Compose override on top of
`containers/local/compose.match-review.yaml` and preserve its source hash and
rendered non-secret configuration with the results.

1. Select an unused project such as `ffb-pr521-review` and verify that loopback
   ports 5173 (Hosting), 22236 (proxy), 22235 (server) and 23318 (database) are
   free. Never stop another owner's listener to obtain a port.
2. Use `docker compose -p <project>` with the base file and the override. Replace
   the published port lists with `!override`, use a distinct server image tag,
   and retain project-scoped database/backup volumes. Mount an ignored copy of
   server.match-review.ini with server.base set to http://127.0.0.1:22235 and
   database port 23318. That URL is the existing approved acceptance profile.
   Reuse authorized local secret files through environment variables, without
   printing their contents or copying credentials into evidence.
3. Build the server, start only this project's database, run its schema-bootstrap
   service, and start its server. Confirm schema marker 9 and server health.
   Do not change the shared stack or its managed-state file.
4. Copy the local Hosting artifact into an ignored directory. Set its public
   gameWebSocketUrl to ws://127.0.0.1:22236/browser/v2. Start an owned proxy from
   local.nginx.conf using listen 22236, backend/Host 22235, and the already
   supported localhost:5173 origin. Start Hosting on 5173 with separate emulator
   hub/logging ports. Keep all process IDs, configuration hashes and logs.
5. Probe the isolated /play page and the real WebSocket authentication gate on
   initial connection and reconnect. Set ENVELOPE_DOCKER_PROJECT for both
   captures. After testing, stop only the recorded owned processes and project
   containers. Retain volumes unless their removal is separately authorized.

Use `node tools/diagnostics/run-operating-envelope-series.mjs <baseline-checkout> <integrated-checkout> <new-output-directory>` for a same-session series. It runs baseline/integrated/integrated/baseline/baseline/integrated/integrated/baseline, records dev-local container stats before and after every run, and requires matching harness and seed hashes. Each run includes one workload warmup repetition followed by three measured repetitions. Warmup tasks and requests remain in the raw capture and full-task accounting. Healthy distributions use phases healthy-0 through healthy-2.

Report every run's full-worker and accepted-action p99, then the median and range of those per-run values for each revision. Include the pre-run server/database CPU samples and explain host variation when interpreting the spread. Historical captures from other sessions provide context for their own workload. The single pair from 8eddbff3f is retained as a descriptive observation while the repeated series supplies the current comparison.
