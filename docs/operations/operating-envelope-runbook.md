# Local single-worker operating-envelope capture

Run only against the owned `ffb-match-review` dev-local stack. No production or external fault targets are used. Production limits remain 32 resident sessions, 16 sockets and 128 ingress tasks.

## Provenance

The harness is new on the #508/#39 branch. No isolated earlier harness was imported. Reviewed and reused the native fixture pattern from `SetupSessionMovementTest`, fresh-connection/checkpoint fixture from `JdbcHealthyWorkerMariaDbTest`, and actual Jetty socket pattern from `JdbcPublicationMariaDbTest`, all present in baseline `d3dabde26026654930768bf18799777d84b5d589`. The test-only `EnvelopeTransportProbe` accesses the production transport to observe numeric samples and schedule owner-thread controls; it changes no runtime limits or scheduling.

## Reproduce

1. Check out the exact implementation/harness revision named in the results report. Use pinned `tools/target-build.ps1 verify`, browser unit/build and lobby browser checks before measurement. Run the summarizer accounting tests with `node --test tools/diagnostics/summarize-operating-envelope.test.mjs`.
2. Start `node tools/dev-local.mjs --restart --quick` and inspect server/proxy startup. Do not measure while builds or other load tests run. The quick startup is appropriate only after separate full validation.
3. Run `node tools/diagnostics/run-operating-envelope.mjs .tools/envelope-<unique-name>` from that checkout. The script refuses an existing result or schema, creates only `ffb_envelope_test`, reads the local Docker secret without printing it, and drops its schema in `finally`. It uses pinned Java/Maven through `target-build.ps1`. After an interrupted process, inspect ownership before manually removing the schema; never drop the development database.
4. Run `node tools/diagnostics/summarize-operating-envelope.mjs .tools/envelope-<unique-name>`. Preserve manifest, numeric measurement, summary and external resource samples. Inspect errors and target failures before interpreting percentiles. A nonzero harness exit means partial coverage, even if a JSON artifact exists.
5. For a baseline, use an isolated checkout of the named baseline and copy only the reviewed harness files from the final harness commit. Record both revisions and imported file hashes. The checked-in gzip fixture contains only synthetic fixture players and native state (no real identities or bearers); the runner expands it into an ignored seed file. Set `ENVELOPE_SEED_FILE` to the same absolute ignored seed file for both runs. Both manifests record source and seed hashes. Do not copy #508 production changes. Baselines before slice 2 deliverable A have **control timing unavailable** and cannot establish all-task compliance.

## Workload and interpretation

The fixture restores 32 active native sessions by cycling two valid coaches through real TCP/WebSocket loads. It then admits two coaches, one spectator and 13 idle sockets. Only one match is actively played at a time across three repetitions; this is not a claim of 32 connected matches, eight concurrently active two-coach matches, or a maximum-throughput result. Each repetition performs eight durable end-turn actions with at least 500 ms between iterations, plus current-match and detailed browse traffic. Warmup/restoration samples are retained separately from request-phase distributions. Native expiry and disconnect work are collected even without request IDs.

The local Firebase SDK double feeds production verification, cache and breaker code. Its controlled unavailable calls last 250 ms; it is not a measurement of external Firebase latency or HTTP retries. A loopback TCP forwarder supplies database failure without stopping the shared database. Twenty-request outage bursts spaced by 100 ms and recovery calls record actual dependency attempts. The real database shares a dev-local container; CPU/RSS samples identify that contention limitation.

Slow delivery uses one controlled Jetty write callback with 15 real TCP sockets present. It distinguishes watchdog close from a worker cleanup barrier. It is a deterministic transport fault, not an OS TCP bandwidth measurement. Durable recovery uses a new application instance and the same durable repositories, rather than killing a production process. Completed-session release and socket cleanup counters must be inspected, not inferred from successful request replies.

Numeric task kinds are 0 ingress, 1 other control, 2 decision expiry, 3 disconnect. Queue and full execution distributions are separate. The collector deduplicates the bounded sample ring by sequence and reports gaps against cumulative counts. Never replace missing control samples with ingress p99. Percentiles use nearest rank; all request outcomes remain in end-to-end distributions. A small sample p99 is often its maximum. Tasks over 100 ms / approximately 250 ms / 2,000 ms remain target evidence, not permission to relax ADR 0006.

The ingress saturation phase deliberately holds one test control task for 250 ms before submitting 160 serialized WebSocket writes. This is a declared queue-pressure fixture, not healthy gameplay. Its control execution remains in all-task measurements and is separated by phase. Socket closure may discard admitted but not yet executed messages; every submitted request remains counted.
