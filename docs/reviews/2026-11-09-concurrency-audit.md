# Concurrency and lock audit (2026-11-09)

Follow-up to lead 1 of the [risk map](2026-11-08-risk-map.md). Scope: how
browser V2 work is threaded and serialised in `ffb-server` (`server/local`,
`server/match`, `net/ServerCommunication`), and which blocking work runs where.
Measured on `main` at `53edb476a`. Findings are ranked by severity. Hard defects
come before judgement calls.

## Tracking issues

| Finding | Issue | Labels |
|---|---|---|
| H1 Firebase timeouts | [#504](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/504) | bug, ready-for-agent |
| H2 JDBC timeouts | [#505](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/505) | bug, ready-for-agent |
| H2 connection pool | [#506](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/506) (blocked by #505) | enhancement, needs-triage |
| H3 publication reauthorization | [#507](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/507) | enhancement, needs-triage |
| H4 browse throttling | [#508](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/508) | bug, ready-for-agent |
| J1 single-worker ADR | [#509](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/509) | documentation, needs-triage |
| J2 shutdown on worker | [#510](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/510) | bug, ready-for-agent |
| L1 dead entropy classes | [#511](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/511) | ready-for-agent |

J3 (shared watchdog thread) is folded into #509.

## How the server is actually threaded

```text
Jetty I/O threads ── onText ──► BrowserMatchTransport.submit
                                  (bounded: 16 connections, 128 queued requests,
                                   advisory lane for previews/probes)
                                        │
                                        ▼
                    ServerCommunication: ONE thread "browser-engine"
                    (unbounded LinkedBlockingQueue)
                                        │
             BrowserV2Adapter.receive / expireDecisions / disconnect
             → V2MatchAccess (auth) → SetupApplication → SetupSession → engine
             → JDBC repositories → ActiveMatchPublisher fan-out
                                        │
                                        ▼
         BrowserMatchDelivery (per socket, async sendString, 2 s write watchdog)
```

Every gameplay request, deadline check and disconnect cleanup, for every match,
runs on the single `browser-engine` thread (`FantasyFootballServer.java:71`,
`BrowserMatchTransport.java:164`). The `synchronized` methods on
`BrowserV2Adapter` (`:84`, `:88`, `:518`) are therefore almost never contended.
The only other caller is the shutdown path (J2).

**So the lock itself is not the hazard.** The single worker is a shared queue.
Any blocking call on it stalls every match on the server, and three kinds of
blocking call run there without a bound: Firebase HTTP, JDBC, and heavy reads.

## Hard defects

### H1 — Firebase calls on the engine worker have no timeout (High: stability)

- `FirebaseV2PrincipalAuthenticator.java:35-37` builds `FirebaseOptions` without
  `setConnectTimeout` or `setReadTimeout`. In firebase-admin 9.4.3 those default
  to `0`, and `FirebaseRequestInitializer$TimeoutInitializer` applies them to
  every request unconditionally. A timeout of 0 means wait forever.
- Remote calls on the worker:
  - `auth.verifyIdToken(bearer, true)` at `:55`, which checks revocation on
    every `authenticate`.
  - `auth.getUser(...)` at `:120`, on every `reauthorize` that misses the
    5-second cache from ADR 0005.

**Failure scenario.** A half-open TCP connection to Google, or a stalled
response, blocks `browser-engine` indefinitely. The cascade:

1. Every match stops, and reactive-decision deadlines (`expireDecisions`) stop
   firing.
2. Ingress fills to 128 queued requests. Further messages close their sockets
   with 1013.
3. Disconnect cleanup is itself queued on the stuck worker
   (`BrowserMatchTransport.java:105`), so connection permits are never released.
   After 16 sockets, every new connection is refused.
4. Shutdown also hangs: `transport.destroy()` calls `adapter.disconnect` on the
   Jetty thread (J2), which waits forever for the adapter monitor held by the
   stuck worker.

The only recovery is to kill the process.

**Fix.** Set `connectTimeout` to about 2,000 ms and `readTimeout` to about
3,000 ms on the builder. A timeout surfaces as `Rejected`, which already fails
closed (`AUTHENTICATION_REQUIRED`). Add a test that a stalled `FirebaseAuth`
double cannot hold the worker beyond the bound.

### H2 — JDBC on the engine worker: no pool, no socket timeout (High: stability; Medium: latency)

- `FantasyFootballServer.java:87-90` opens a new `DriverManager` connection for
  every repository call. There are 30 `connections.open()` sites across
  `match/`, `team/` and `skilluse/`, and a single gameplay action opens several:
  - reauthorization (`JdbcV2PrincipalDirectory`)
  - membership lookup
  - the checkpoint write
  - a second reauthorization plus membership lookup for each publication
    recipient
- No `db.url` in `containers/` or `ffb-server/server.ini` sets `socketTimeout`
  or `connectTimeout`, and nothing calls `setQueryTimeout` or
  `setNetworkTimeout`. MariaDB Connector/J 3.5's default `socketTimeout` is 0,
  which also means wait forever.

**Failure scenario.** A row-lock wait (InnoDB waits 50 s by default), a slow
disk or a network partition to MariaDB freezes all matches, with the same
cascade as H1. On a healthy system, each operation still pays several TCP and
authentication handshakes in series.

**Fix.**
- Add `socketTimeout`/`connectTimeout` to the JDBC URL or driver properties,
  and make an unset value fail at startup.
- Introduce a small pool, such as HikariCP with 2–4 connections, behind the
  existing `Connections` interface, so repositories need no change.
- Treat a timeout as `PERSISTENCE_FAILED`. Check that the ADR 0004
  one-durable-boundary semantics hold when a commit times out with an unknown
  outcome. The exact-retry path should cover this, but it needs a test.

### H3 — Publication fan-out reauthorizes each recipient in sequence, remotely (Medium-High: performance)

`ActiveMatchPublisher.publish` (`:116`, `:127`), `publishChat` (`:93-94`) and
`BrowserV2Adapter.preparationChanged` (`:509`) call `access.require` or
`access.playerRole` for every recipient. Both go through
`FirebaseV2PrincipalAuthenticator.reauthorize`. A spectator who only watches
sends no requests, so their 5-second provider check has almost always expired.
Every publication then costs one `getUser` round trip per spectator, plus JDBC.

**Failure scenario.** A match with four spectators: ADR 0005 measures about
102 ms per remote check, and `smooth-gameplay-second-video-review.md` saw about
170 ms. So each action adds roughly 0.4–0.7 s of worker time. That delays the
acting coach's next reply and every other match's requests. The cost scales with
spectators × actions, and opponents who are thinking also miss the cache.

**Fix (needs an ADR 0005 amendment; pick one).**
- (a) For server-initiated pushes, refresh only local lifecycle and scopes
  (JDBC). Leave provider revalidation to the recipient's next own request,
  bounded by token expiry.
- (b) Have a background refresher keep provider checks for connected principals
  fresh off the worker. The worker then only reads the cache, and still rejects
  on expiry.

Option (a) is simpler. It widens the Firebase-only revocation window for
passive viewers from 5 s to "until their next request or token expiry", and the
amendment must say so explicitly.

### H4 — Expensive browse reads run unthrottled in the foreground lane (Medium: performance / abuse)

`browse` with `includeDetails` and `currentMatches`
(`BrowserV2Adapter.java:199-262`) do up to 100 × `browseDocument` each, a DB
load and a new connection. Every match not held in memory also gets a
`browseState`, which reads and parses the full recovery checkpoint JSON
(`SetupApplication.java:601-613`). `browse` needs only SPECTATOR scope. Only
diagnostics probes are rate-limited (`:175-178`). Browse is not in the advisory
lane (`BrowserMatchTransport.java:206-214`), so `MAX_FOREGROUND_BURST` does not
protect gameplay from it.

**Failure scenario.** A spectator page that refreshes the lobby, or any client
in a loop, queues requests that each cost hundreds of DB round trips and
checkpoint parses. Moves from other matches wait behind them.

**Fix.**
- Rate-limit per connection, as the diagnostics probe already is.
- Serve browse details from a summary refreshed when a checkpoint commits,
  instead of parsing checkpoints on demand.
- Fetch documents in one query instead of N.

## Judgement calls

### J1 — The single engine worker is a reasonable design, but it is not recorded

Running everything on one thread makes correctness easy:
- the engine, `SetupApplication.sessions`, the publisher maps and `Fortuna` need
  no locking;
- ordering per action is total, which suits the ADR 0004 durable boundary.

At 16 connections it is a defensible choice. It needs to be written down as an
ADR together with its rule: **no blocking I/O on the engine worker without an
explicit time bound, and no per-recipient remote calls.** H1–H4 all break that
rule, and nothing currently states it.

If load ever outgrows one thread, the next step is per-match lanes, not finer
locks. That needs these changes first:
- `Fortuna` must be shared safely or made per lane;
- `ScannerSingleton.java:7` must stop using unsynchronised lazy initialisation;
- mutable statics must become `final` (`Constant.java:16,18`,
  `UtilPassing.java:15`, `PlayerSelector.INSTANCE`);
- `SetupApplication`/publisher maps must be split by match.

### J2 — The `synchronized` on `BrowserV2Adapter` exists only for shutdown, which is misleading

`transport.destroy()` (`BrowserMatchTransport.java:236-244`) runs on Jetty's
destroy thread. It calls `socket.closeFromEngineWorker()`, which calls
`adapter.disconnect` off the worker despite the method's name. That is the only
reason the adapter needs its monitor. Two consequences:
- readers assume a concurrency design that does not exist;
- shutdown can deadlock behind H1/H2.

**Suggestion.** Submit shutdown cleanup to the worker with a bounded wait, then
force-close the sockets. Afterwards, remove `synchronized` or document the one
case it guards.

### J3 — Watchdog and deadline checks share one scheduler thread

`browser-match-write-watchdog` runs both the 100 ms delivery expiry and the 1 s
decision-check enqueue (`BrowserMatchTransport.java:57-71`). Both are cheap
today. If either ever grows, a slow callback delays the other. This is low risk.
Note it in the ADR from J1.

## Low

- **L1 — A latent nested-monitor lockout in dead code.**
  `util/rng/EntropyServer.put` (`:85-93`) holds `this` while it waits on
  `lockFull`. `get` needs `this` to notify `lockFull`, so the producer and
  consumer lock each other out once the buffer fills. Nothing constructs
  `EntropyServer` or `NetworkEntropySource`. Delete both.

## What is already good

- `BrowserMatchDelivery` holds its lock only around queue state. Writes are
  asynchronous and outside the lock, the queue is bounded (64 messages / 2 MB),
  slow consumers are disconnected, and the 2 s watchdog bounds outbound writes.
  This part of the design is sound.
- Ingress admission uses `tryAcquire` semaphores and never blocks Jetty threads.
  The advisory lane keeps preview traffic from starving gameplay.
- `FirebaseSessionVerification` is bounded (1,024 entries) and never extends
  validity on hits.
- The inherited engine has very little mutable static state, so per-match
  parallelism stays possible later.

## Suggested order

1. H1 timeouts and H2 JDBC timeouts: small, local changes that remove the
   freeze-forever failure.
2. The J1 ADR recording the single-worker rule. Reviews can then check H3/H4-style
   regressions against it.
3. H3, by amending ADR 0005 and implementing option (a) or (b).
4. The H2 connection pool, then H4 rate limiting and the browse summary.
5. J2 shutdown cleanup; L1 deletion.
