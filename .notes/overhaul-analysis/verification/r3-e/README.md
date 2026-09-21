# R3-E bounded projection and rendering acceptance — 2026-09-21

## Scope and result

Implemented local client enforcement for all nine current v2 recipient envelopes,
approved coach labels, and focused browser/service/native-engine contracts.
Player and spectator game information remains shared; only persisted player
membership authorizes decisions. No engine, catalog, server DTO, schema, replay,
credential or mutation scheduling change. No deploy, service restart, database
write, volume reset or evidence deletion was performed. Concurrent AGENTS.md and
team-artwork changes were preserved.

Read: M3e acceptance/handoff, disconnect and action coverage contracts, schema-4
migration, accepted ADR-001–004 and the M4 owner decisions. Current Java 21 and
marker-6 boundaries supersede historical Java 8/schema-4 runtime limitations.

## Changed behavior

- Responses with unknown envelopes or extra top-level private fields are rejected
  before React receives them. Browse entries have exactly matchId and neutral label.
- A watch subscription cannot adopt a player-role snapshot, or vice versa.
- Saved-team owner checks now also cover uncertain-save responses; foreign
  documents and extra ownership fields cannot reach the view. Pending exact intent
  remains retained on invalid responses.
- Only a creator/home preparation response may contain a non-null invitation.
- Coach labels show Home: You / Away: Opponent (reversed for away), or Home / Away
  for spectators. Catalog/on-pitch names remain ordinary shared text.

The [public API inventory](../../../../browser-client/public-api-v2.md) lists every
current response family and mandates tests/compatibility review for future DTOs.
The client rejects additions outside the existing v2 contract; no wire version,
engine format or database transition is introduced.

## Verification

Windows 11; Temurin 21.0.11+10, Maven 3.9.9, Node 26.7.0, Vite 8.2.2;
Playwright uses installed Chrome 153.0.8010.50; scanner unit tests use Python
3.14.3. Node 24 remains the declared CI baseline;
this workstation run does not claim that separate CI environment.

```powershell
node --experimental-strip-types --test browser-client/test/v2-client.test.ts browser-client/test/v2-projection.test.ts
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-statetest -Test 'RecipientProjectionTest,BrowserSavedTeamJsonTest,MatchJsonTest,FirebaseV2PrincipalAuthenticatorTest,BrowserV2ProjectionTest,BrowserV2AdapterTest,V2MatchAccessTest' -Offline
powershell -ExecutionPolicy Bypass -File tools/target-build.ps1 test -Module ffb-server -Test 'BrowserSavedTeamJsonTest,BrowserV2ProjectionTest' -Offline
npm.cmd test --prefix browser-client
npm.cmd test --prefix site
npm.cmd run test:browser --prefix site
& 'C:/Program Files/Python314/python.exe' deployment/game-service/proxy/test-projection-journal.py
git diff --check
```

- Focused client tests: 23 passed. All nine envelope contracts accept documented
  fields and reject bearer/UID/email/display-name/account/team/checkpoint/dice/
  history additions. Unknown future admin/result/replay/chat families are rejected.
- Browser unit suite: 61 passed; site transport contracts: 4 passed.
- TypeScript and production play build passed. Mounted browser: 2 scenarios
  passed, including independent home/away/spectator contexts, start synchronization,
  read-only controls, reconnect and access-loss clearing. A hostile `<img>` player
  name produces no image element or executed handler. Coach labels are asserted
  separately for all three recipients.
- Java: 34 server + 1 native statetest passed, zero skipped. The subsequent
  actual catalog/validation and owned/foreign saved-team projection additions
  passed the narrow 17-test rerun (36 server tests plus 1 native test covered
  across the runs). The first selector's
  `MatchJsonTest` matches no class; no test coverage is claimed from that name.
  Existing saved-team and nested-preparation browser tests provide complementary
  coverage. Real V2MatchAccess is exercised over local repository doubles:
  scope/revocation and membership precede reads/mutations/retries; spectator with
  both default scopes still cannot play or read private preparation. Native engine
  home/away/spectator public fields match exactly; wrong actor leaves state intact.
- Existing adapter log-capture test confirms synthetic provider exception text,
  bearer, UID, email and private account/team sentinels are not echoed or logged.
- Journal scanner contracts: 4 passed, covering private patterns/known subjects,
  empty/over-budget samples, identity budget and unknown environment rejection.

An initial native test expected a returned rejection; the engine throws
MatchService.Failure instead. Corrected the test to assert WRONG_ACTOR and the
unchanged native state. No product code changed to accommodate that result.
The first broad npm command hit PowerShell execution policy; npm.cmd ran normally.

## Bounded console and service-journal evidence

The synthetic browser run inspects at most 100 console events in memory and
records only count/boolean assertions. Final summary:
`{"messages":0,"errors":0,"leaked":false}`; the two scenarios passed in 5.366 s.
It supplies synthetic provider UID/email/display-name fields and checks known synthetic bearer/account/
identity sentinels and has zero page errors. No real authentication is initialized,
and no WebSocket frames, HAR, browser trace or raw console messages are exported.
The WebSocket mock handles only its own synthetic messages.

Read-only DEV journal check used the existing pinned-host-key IAP connection:

```powershell
((Get-Content -Raw deployment/game-service/proxy/check-projection-journal.py).Replace("`r`n","`n").TrimEnd()+"`n# end") | & 'C:/Program Files/PuTTY/plink.exe' -batch -hostkey 'SHA256:FhCH988zxP9JTmqwLLiCNVM2NgwcAxNGgZAft+fGIwQ' -i C:/Users/jaken/.ssh/google_compute_engine.ppk -P 22339 jacob_thegrognardcodes_com@127.0.0.1 'sudo -n python3 - dev'
```

Result: **PASS, 952 bytes / 14 lines**. At most 200 records since
2026-09-21 00:00 UTC; reject samples over 256 KiB, missing records and more than
1000 stored identities. Stored provider subjects are compared on-host, never
exported. No stored subject, email or JWT shape occurred. The initial tunnel
creation found port 22339 already occupied; the existing tunnel succeeded.
No new host or credential was provisioned.

This journal sample describes the installed DEV runtime, not the undeployed
browser candidate or all historical logs. It cannot prove absence of arbitrary
private strings or unexercised error paths. Synthetic private-account/team log
checks supply complementary bounded evidence, not universal log certification.

## Limits and handoff

Only browser product code changed. No new JDBC or schema behavior was introduced;
database mutation/integration tests were therefore not rerun against retained
storage. No hosted acceptance of the new browser, all-browser certification,
backup/restore, recovery-operation, load or general public-service gate is claimed.
No new custom names or chat route is exposed. Future DTOs remain unavailable until
their explicit projection tests and compatibility boundary are reviewed.
Changes remain local and uncommitted pending review; this tranche does not inherit
the earlier R3-D publication permission.
