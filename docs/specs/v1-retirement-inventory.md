# V1 retirement inventory

Implementation branch: `retire-browser-v1`. Scope and issue links: [approved specification](v1-retirement.md).
This inventory distinguishes endpoint/runtime version from persisted format versions.

| Capability / former owner | Disposition | V2 replacement or reason |
| --- | --- | --- |
| `/browser/v1`, `FantasyFootballServer.mountDiagnostics`, `isBrowserV2` selection | Retire | V2 is the only mount; false/invalid legacy selection fails before startup. V2 route and runtime-selection tests cover cutoff. |
| `BrowserMatchAdapter`, synthetic MOVEMENT/BOTH_DOWN fixtures, fixture control file | Retire | Product engine uses `BrowserV2Adapter` and native setup sessions. Native Both Down behavior remains under core-turn and recovery tests. |
| Adapter nested connection contract | Extract | `BrowserConnection` serves V2 adapter, publisher, socket, and transport tests without retaining V1 dispatch. |
| Jetty text transport, queue bounds, stalled sends, disconnect and delivery | Preserve / migrate | Shared transport remains; Jetty contract and socket tests run with V2, including malformed/version-mismatch input and forbidden routes. |
| Bearer-token local probe and M1 fixture scripts | Retire | Authenticated V2 acceptance uses synthetic Firebase identities on a dedicated local stack. No token-paste diagnostic UI remains. |
| V1 main shell, TeamPanel, MatchPanel, SetupPanel, ResultPanel | Retire / extract | Product BuilderPanel, preparation, HostedMatch and HostedResult remain. Shared GameView extracted without rendering changes. |
| V1 synthetic BoardView, movement/choice wire decoder, old route helpers | Retire | These have no V2 consumers. V2 client and setup/data decoders retain contract checks. Historical captures remain in Git and `.notes`. |
| Team catalog, draft validation, saved teams and preparation | Covered by V2 | V2 builder/preparation tests and real-server match acceptance create, validate, save and activate real teams. Shared catalog/saved-team DTO versions remain intact. |
| Setup placement, core turns, supported actions | Covered by V2 | Native engine/state tests, setup-drag UI and real V2 match acceptance; V1 setup/core-turn/supported-action demos removed. |
| Wrong actor, spectator, stale/fabricated requests | Covered by V2 | V2 adapter/native integration and `real-server-match.mjs` negative checks assert rejection without mutation. |
| Exact retry, disconnect/rejoin, pending choice | Migrate / preserve | Migrated native V2 adapter checks and real V2 restart acceptance assert unchanged state and duplicate accepted replies. |
| Connected socket with an unavailable match view | Fix validation finding | #435 enables the existing explicit Reconnect control. `reconnect-ui.mjs` proves reauthentication/reload without automatic mutation, including preservation of an uncertain retained request. |
| Complete match, authoritative result, replay navigation | Covered by V2 | `real-server-match.mjs` reaches full time, compares both coaches' results and seeks replay; retained `real-server-replay.mjs` is available for later replay-only checks. |
| R2 process-kill/restart proof | Migrate | `v2-process-recovery.mjs` integrates with real V2 full-match acceptance at a pending decision, terminal checkpoint before result save, and committed completion. It checks two participant views, exact retry and checkpoint/journal hashes. |
| Renderer missing mappings/assets, context failure, recovery and teardown | Migrate | Mandatory `renderer-diagnostics-ui.mjs` mounts the V2 application with a test socket and injected asset failures. Tests cover fallback, bounded attempts, remount recovery, no WebGL dependency, early teardown, pending images and listener/observer cleanup. Hooks exist only in tests. |
| Independent pitch/stadium artwork previews | Preserve | DEV-only preview routes remain in `dev-entry.tsx`; no V1 transport dependency. |
| Default browser build / development entry | Migrate | Default build emits V2 `dist-play`; default dev entry directs users to authenticated dev-local `/play` and retains artwork previews. |
| V1 Compose, setup and R2 copy tooling | Retire | Removed original, R1, R2/trial and offline diagnostic profiles, bearer-token generator and R2 copy script. Current V2 review/acceptance profiles remain. |
| Existing V1 database, backup volumes and ignored secret files | Preserve untouched | No import, prune, reset, migration or deletion. Storage identification is documented in [local runtime guide](../../containers/local/README.md). |
| Shared schema provisioning and older replay/recovery payload versions | Preserve | Needed by V2 schema bootstrap and historical match restoration; not V1 service support. |
| Proxy / hosting forbidden-path checks containing `/browser/v1` | Preserve | Deliberate negative assertions prevent the retired endpoint from resurfacing. |
| Historical specs, recordings and migration runbooks | Historical reference | Current guides point to V2; old V1 protocol/runbooks carry retirement notices. Historical evidence is not rewritten into purported V2 evidence. |

## Affected validation manifest

- Server: runtime selection, local/native profile validation, Jetty contract, V2 routes/adapter/projection/transcript, shared delivery/socket/transport, schema verification.
- Native: migrated `BrowserPreparedMatchAdapterTest`, `V2RuntimeIntegrationTest`, core-turn and recovery suites; native shard inventory removes retired fixture tests.
- Browser: unit suite, TypeScript/V2 build, renderer diagnostics, shared GameView HUD/setup checks, all mandatory hosted/interaction shards.
- Tools: validation and dev-local lifecycle tests; recovery target/codec safety tests.
- Real runtime: isolated authenticated V2 full-match run with `COACH_ACCEPTANCE_PROCESS_KILL=1`; V2 result/replay; dev-local startup and proxy checks.
- Build: full Java reactor and standalone game-service verification.

Actual execution evidence and any gaps are recorded in [the outcome report](v1-retirement-outcome.md).
