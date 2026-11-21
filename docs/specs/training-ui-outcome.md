# Training lab implementation outcome

The Development page links to the experimental `/training` viewer. It explains the current Bogruk and Gobbo evaluations and the deferred computer opponent research. Visitors can inspect a local summary file in the browser. The built site makes zero training API requests.

The integrated checkout includes a loopback launcher for bounded evaluations. It supports one owned run, resource limits, graceful stop, bounded logs and saved results. The launcher validates the request Host, Origin and session token for controls and can start in read-only mode. Opening either version of the page leaves the harness idle.

## Validation

- Three Node tests passed for options, worker defaults, launcher mode, IPC stop during preparation, exclusive ownership, request isolation and saved history.
- Three focused Chromium tests passed for Development navigation, the built viewer with an available mock API that received zero requests, import, local controls, reconnect and mobile layout. Desktop and mobile captures showed a solid training backdrop. The shared stylesheet's decorative background is scoped to other pages. Impeccable's source scan still flags it because the scanner reads the linked stylesheet.
- The full static site build, the public-site input check, 13 site unit tests and browser inventory loading passed. The training browser tests are registered in the hosted suite.
- UI tests used simulated execution. See the [harness usage](../../computer-player/training/README.md) for real evaluations and [launcher instructions](../../computer-player/training/UI.md) for the local UI.

History discovery is capped at 500 runs and three directory levels. Incomplete command-line metadata may reflect active or interrupted work. The launcher terminal must stay open. Future research is recorded in the [computer opponent roadmap](computer-opponent-learning-roadmap.md).
