# Human side-and-corner prototype review

Branch: `feature/stadium-hybrid-prototype`; [workstream #211](https://github.com/the-grognard-codes/fumbbl-rebuild/issues/211).
These are captures of the actual development renderer, not generated whole-stadium mockups.
See [the study and requirements](../../../../../docs/verification/stadium-hybrid-prototype.md).

| Capture | What to inspect |
| --- | --- |
| [Hybrid, home view](01-hybrid-40-home-near.png) | Intact upper bodies, raised ranks, side/corner join and pitch-side bench |
| [Inspect the join](07-inspect-join.png) | Closer view of spectator silhouettes, row overlap and the corner transition |
| [Structure only](02-structure-40-home-near.png) | Matching terrace levels, wall thickness, coping and doorway |
| [Current rendering](03-current-40-home-near.png) | Comparison of the same camera with existing sliced crowd art |
| [Opposite viewing end](camera-40-away-0.png) | Directional artwork and world ownership |
| [Overhead](camera-90-home-0.png) | Group orientation follows the side and curved corner |
| [Local gesture](05-local-gesture.png) | One group changes gesture while the remaining crowd and geometry stay fixed |
| [Compact 30° stress check](compact-30.png) | The prototype remains visible on a 689 × 605 viewport |

[Machine-readable results](review-results.json) cover 34 camera/comparison/scroll/zoom
cases, source-ratio preservation, 390 pitch cells, gesture states 1 and 2, and reduced
motion during an active gesture. No runtime errors or failed asset requests were observed.
All case captures are available locally under `.tools/stadium-hybrid-review/` in the
prototype worktree; only representative images are stored in this gallery.

The rendering study preserves proportions substantially better than the sliced bank.
The source sheet repeats six people and some terrace floor remains exposed. This is
temporary test artwork, not acceptance of the final standing-room crowd illustration.
The next production decision remains subject to the owner's visual review.
