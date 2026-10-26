# Solid Defence response recovery

Issue: [#364](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/364).
Found during local acceptance of [#361](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/361).
Work remains on `prototype/skill-decision-prompts` alongside the existing review changes.

## Problem and evidence

Solid Defence offers destinations for each selected reserve player. A retained
state with 946 actions serialized to a 289 KB response. The server's 256 KiB
outbound queue disconnected the recipient before sending it; browser and
computer match clients independently rejected replies of that size. Reopening
the match repeated the failure.

The private checkpoint restores successfully offline with the exact running
server JAR and libraries. The first offline attempt used an older validation
build and returned `RECOVERY_CORRUPT`; it is not evidence of damaged saved data.
The original checkpoint, prepared document, and dice state remain unmodified.
Private diagnostic inputs are retained only under the ignored
`.tools/solid-defence-crash/` directory and are excluded from tracked fixtures.

## Change and acceptance

- Admit `setupState` responses up to 2 MiB in the shared browser/computer size
  gate. Count UTF-8 bytes, reject larger inputs before parsing, reject duplicate
  JSON keys, and retain all existing projection and recipient checks.
- Keep other client families at 256 KiB and paged transcripts at 768 KiB.
- Increase the bounded server connection queue to 2 MiB, retaining the 64-message
  ceiling, write watchdog, overflow disconnect, and optional-history ordering.
  Keep individual live transcript frames at their existing 256 KiB ceiling.
- Preserve native rules, legal action identifiers, exact retries, and recovery
  records. Load the reported match through the refreshed local service without
  executing gameplay commands or editing its database records.

## Validation

The original offline browser reproduction and synthetic browser/computer
transport regressions failed under the old limit. The server socket regression
also failed under the old production queue budget.

- `npm.cmd test` in `browser-client`: 411 passed, including large-state load,
  reconnect with retained intent, strict projection rejection, and UTF-8 budgets.
- `npm.cmd test` in `computer-player`: 42 passed with Windows process inspection
  available. The sandboxed attempt could not complete daemon cleanup checks;
  the full elevated rerun passed.
- Isolated Maven selectors `BrowserMatchSocketTest`, `BrowserMatchDeliveryTest`,
  `BrowserMatchTransportTest`, and `BrowserV2LiveTranscriptTest`: 40 passed.
- Docker's native `mvn -B -ntp -DargLine=-Xmx3g -pl ffb-server -am package`:
  build passed, 175 common tests passed and 663 server tests passed; four
  database-opt-in server checks were skipped by their existing configuration.
- Offline restoration of the original private checkpoint passed against both
  the running JAR and newly compiled source. The original browser reproduction
  now accepts all 946 actions at revision 35 without disconnecting.
- Before refresh, the real authenticated proxy load closed with code `1013`.
  A read-only database comparison confirmed generation 36 and checkpoint content
  remained unchanged throughout diagnosis.

- Complete local browser gate: all 63 suites passed (53 interaction, 10 hosted)
  in 683.2 seconds with two workers. Fresh evidence is in the ignored
  `.tools/validation/local-browser-gxz3S6/` directory. Coverage includes live
  decisions, replay, reconnect, exact retries, and missing-history recovery.

## Local recovery verified

The validated local image, Hosting bundle, and managed computer daemon were
refreshed. The existing 2 GiB server heap and one-worker limit remain applied.
Mounted ADC verification and the real proxy authentication/reconnect probe passed.
The served game bundle matches the newly assembled artifact by SHA-256.

The originally reported match then loaded through the real authenticated proxy
on two separate connections: `ACCEPTED`, revision 35, `PLAY` / `SOLID_DEFENCE`,
946 actions, 289,773 UTF-8 response bytes. The original browser reproduction
also passed again without disconnecting. A final read-only database comparison
confirmed generation 36 and the original checkpoint content remain unchanged.
No gameplay command or manual database repair was needed.

The owner can hard refresh the browser and reopen the match to resume the
existing redeployment decision. No commit, push, merge, or remote deployment
was performed.
