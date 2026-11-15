# Bounded match DOM (#527)

Issue: https://github.com/the-grognard-codes/fumbbl-rebuild/issues/527

The synthetic full match-page workload drives 450 consecutive React revisions
with native dodge-roll records. The game log is the growing subtree: 450 rows
previously mounted 16,665 log elements, for 17,260 elements on the whole page.

Mount at most 100 formatted log lines at once. Earlier, Later and Latest controls
retain every event and use ordinary keyboard-focusable buttons. Historical pages
stay on their retained event while new records arrive, and historical navigation
does not announce old rows as live events. Existing log labels, settings, font
sizes and reading-position restoration are retained. Pages avoid estimated row
heights for variable wrapped text and dice. This intentionally replaces the
previous continuously mounted history with explicit bounded history navigation.

Settled log D6 and block results render one existing face SVG rather than the
six-face physical dice component. Pitch dice and their animation are unchanged.
The 450-revision page now mounts 100 log rows, 920 log elements and 1,515 total
elements. The oldest and latest revisions remain reachable in browser assertions.

## Idle trace comparison

Headless Chrome, 1280x800, 1.1-second stationary samples, no pending gameplay
animations. Measurements describe this local synthetic workload, not a live
multi-hour soak or physical input latency.

| Mode | Before early/late Layerize | After early/late Layerize | Paints early/late after |
| --- | --- | --- | --- |
| Off | 0 / 0 ms | 0 / 0 ms | 0 / 0 |
| Graph | 0.629 / 6.525 ms | 0.846 / 0.773 ms | 8 / 10 |

Graph has approximately 183 Layerize trace events per sample because diagnostics
requests animation frames to sample frame intervals; its overlay renders roughly
every 250 ms. Off has no ongoing animation-frame collection and no idle paint or
layerization in this reproduction. This identifies diagnostics collection as
the per-frame source in the synthetic idle state. No unconditional gameplay
repaint was reproduced. Flat settled dice remove the accumulated transformed
layer tree rather than weakening diagnostics. The pitch viewport already has
computed `user-select: none`; the browser test protects that behavior.

Validation: `npm test`, `npm run build`, `node test/match-dom-growth-ui.mjs`,
`node test/match-log-ui.mjs`, and affected HUD/history browser checks are recorded
in the PR. Raw traces and screenshots stay in the ignored overnight scratch
directory, not in source control.

Pending user evidence: matched early/late long live-match traces with diagnostics
Off and Graph separately, pan EventLatency p95 and Layerize within 20%, and soak
DOM re-measurement. These require the user's dev-local interactive sign-in.

Review regression coverage returns to the live bottom after scrolling up with
fewer than 100 rows, then receives another event. The new event and polite live
announcements resume without a Latest button. The full-page peak bound is now
2,000 elements, and a failed assertion reports the observed peak. Dice-face
validation and selected/chooser/uphill classes share one presentation source.

Review-fix round: returning from reading to the bottom resumes live following when at most one
mounted page (100 formatted log lines) has arrived beyond the retained end. This
allows a short arrival burst to appear without Later/Latest, while gaps larger
than one page keep deliberate history navigation pinned. The new 30-arrival
regression first timed out on revision 600; the existing 120-arrival pin remains
covered alongside continued following after revision 601.

Fix round 2: historyEnd records reading versus paged provenance. Only reading pins resume automatically within 100 new formatted lines. Explicit Earlier/Later pages stay pinned at their bottom; Later reaching live or Latest restores following. The browser regression covers the first Earlier page (gap exactly 100), Later returning to live, 30-arrival reading resumption and the existing 120-arrival pin.
