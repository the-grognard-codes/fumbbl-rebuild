# Integrated DEV soak, November 20, 2026

The three-hour authenticated soak ran from 1:12:48 to 4:12:48 p.m. Eastern
on the local DEV stack at `-Xmx768m`. Two distinct coaches played concurrent
matches against Bogruk the Almost Clever. MariaDB recorded 59 natural full-time
results. The JVM stayed healthy and recorded zero restarts, out-of-memory
failures, and match quarantines.

## Build

The measured build was `f9e578b0551168311ef1375c5451674367c5946e` on
`soak/integrated-2026-11-20`.

| Pull request | Integrated head |
| --- | --- |
| [#543](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/543) | `17e1b2c9c2bdf78288fd1c30045c04aa815a4968` |
| [#559](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/559) | `3f9eade488b9ea24828d105ca0546dddd55fca7d` |
| [#541](https://github.com/the-grognard-codes/moles-under-the-pitch/pull/541) | `d1308dece8df84a43702a5a62492aba6e99d3e88` |

The [review data](2026-11-20-integrated-dev-soak-data.json) contains the image and
bundle hashes, precise UTC window, anonymous outcome records, checkpoint maxima,
and latency distributions. Each distribution entry pairs a value in tenths of
a millisecond with its sample count. Use nearest rank to reproduce the reported
percentiles.

## Heap and match lifecycle

| Measurement | Result |
| --- | --- |
| Natural full-time results | 59 at eight turns per side in the second half, all durably stored |
| Idle eviction | The full-GC census went from 26 live sessions to 2 around the 30-minute idle deadline. All 24 parked checkpoints remained durable. |
| Abandonment | The authenticated daemon confirmed 24 parked matches abandoned. MariaDB disabled computer scheduling for those same 24 matches. |
| Peak sampled JVM heap | 767.71 MiB |
| Largest sampled base checkpoint | 1.13 MiB encoded and 38.02 MiB decoded |
| Largest sampled decoded base plus journal | 39.12 MiB |
| Capacity preflight | 32 short-history sessions and 44.32 MiB of live Java objects after full GC. The 33rd activation returned `ACTIVATION_LIMIT`. |

| Full-GC census | Live sessions | Live Java objects |
| --- | ---: | ---: |
| Timed start | 26 | 41.54 MiB |
| Fifteen minutes in | 26 | 163.51 MiB |
| After idle eviction | 2 | 62.02 MiB |
| After abandonment | 1 | 171.76 MiB |
| Near the deadline | 2 | 183.90 MiB |

The capacity finding applies to the short-history workload tested in preflight.
During concurrent play the observed heap peak came within 0.29 MiB of the
configured cap. The live heap census includes the whole JVM, and the age and
history of the active matches varied across samples.

## Live playback

Peak backlog was 31 revisions. Board lag runs from authoritative arrival to
presentation of the final revision in a burst. Drain runs from the final
arrival until the board is caught up and playback, request, and splash gates
are clear. Input-ready samples also require the next decision to belong to
the human coach.

| Measurement (ms) | Samples | p50 | p90 | p99 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Computer revision inter-arrival during play | 30,567 | 153.9 | 424.2 | 1,195.3 | 102,959.6 |
| Board lag for the last revision in a burst | 7,229 | 232.1 | 2,821.9 | 7,053.9 | 12,095.8 |
| Queue drain without a splash | 5,384 | 224.1 | 1,085.9 | 4,210.7 | 10,041.4 |
| Queue drain with a timed splash | 1,845 | 4,191.0 | 9,753.4 | 13,510.8 | 17,937.9 |
| Input ready without a splash | 1,799 | 227.2 | 2,532.8 | 5,114.4 | 10,041.4 |
| Input ready with a timed splash | 1,242 | 6,659.4 | 10,261.4 | 13,925.0 | 17,937.9 |

There were zero held-splash drain samples. Computer inter-arrival samples
require consecutive accepted revisions in one page session with the preceding
revision assigning the decision to the computer. Reloads and hidden pages can
interrupt a playback episode.

## Method and limits

- The timer began after five seconds of overlapping live connections, once
  both coaches had received an advancing computer revision. The initial
  same-account preflight exposed the one-live-play-connection rule. The
  32-resident probe also ran during preflight.
- The workload used a disposable local database copy migrated to schema 10.
  The original volume remains available. Two legacy matches in the copy
  returned `RECOVERY_UNSUPPORTED` during background computer registration.
  Their activity is included in whole-JVM heap measurements.
- Peak heap combines pre-GC log values and 10-second heap samples. The build
  exposes no live per-reason eviction counters, so idle evidence comes from
  the timed census and durable checkpoints. The 25-second database sampling
  interval can miss compactions between samples.
- The browser abandonment spot check missed the terminal response. The
  daemon and durable scheduling records provide the abandonment evidence.
- One browser worker recorded 14 driver errors and moved on from two matches
  after repeated action timeouts. The other worker recorded zero driver
  errors. Both exited successfully at the deadline. The browsers recorded
  3,354 `RATE_LIMITED` responses across the captured request types.
