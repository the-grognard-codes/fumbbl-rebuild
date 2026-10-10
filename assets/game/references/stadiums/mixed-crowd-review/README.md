# Mixed crowd and accessories renderer review

Captured 2026-10-09 from the production `LivePitch` component by `tools/stadium-piece-review.mjs`. These use an isolated match fixture with no players; gameplay input is covered separately by the projected-pitch browser test. The captures are assembled renderer evidence, not newly approved concepts or a deployed match.

| View | Old World Classic, Human home | Badlands Brawl, Orc home |
| --- | --- | --- |
| Wider perspective | [Human venue](assembled-human-home-overview.png) | [Orc venue](assembled-orc-home-overview.png) |
| Home end, near crowd | [Human near](assembled-human-home-40-focus-0.png) | [Orc near](assembled-orc-home-40-focus-0.png) |
| Away end, near crowd | [Orc supporters in Human venue](assembled-human-away-40-focus-26.png) | [Human supporters in Orc venue](assembled-orc-away-40-focus-26.png) |
| Overhead, midfield | [Human venue overhead](assembled-human-home-90-focus-13.png) | [Orc venue overhead](assembled-orc-home-90-focus-13.png) |

Compare in the same camera context against the [owner's appearance target](../human-reference-revision/live-behavior-target.png). Look for continuous dense sections, identifiable mixed supporters, blue versus orange/brown clothing, planted upright heads, visible wall thickness, near backs of heads and retained pitch readability. Outer stands can crop in normal match framing.

The complete 28-capture local matrix, including 30/40/50-degree near/mid/far and overhead views, is in `.tools/stadium/feature-final`. The original branch baseline is in `.tools/stadium/feature-baseline`. These ignored local directories are available in the implementation workspace.

See [the implementation review](../../../../../docs/verification/modular-stadium-framework.md), [the asset contract](../../../pitch/stadiums/jigsaw/source/README.md) and [exact generation prompts](../../../pitch/stadiums/jigsaw/source/mixed-crowd-prompts.json). Final visual acceptance belongs to the owner's manual review.
