# Live match shell visual checkpoints

These captures come from `site/test/m5e-result-browser.test.mjs` with a synthetic version-four authoritative match projection. They contain no account credentials or private game data. The test checks that the Fit pitch, compact bench, and complete match frame stay inside each viewport without document scrolling.

| Capture | CSS viewport |
| --- | --- |
| `match-1920-1080.png` | 1920 × 1080 |
| `match-1920-900.png` | 1920 × 900 |
| `match-1920-820.png` | 1920 × 820 |
| `match-1280-660.png` | 1280 × 660 |

Compare with `browser-client/test-output/pitch-preview/full-route.png`. These screenshots validate the server-bound shell, scoreboard, player art, and dugouts. The preview's action buttons, route overlays, log, chat, and dice belong to later delivery slices and are not represented as live features in these captures.
