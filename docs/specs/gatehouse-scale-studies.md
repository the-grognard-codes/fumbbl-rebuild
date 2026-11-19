# Gatehouse scale and colour studies

Open `/stadium-mockup?view=scale` in the development gallery. From `browser-client`, run `npm run dev:stadium` and use the address printed by Vite.

The original review compared a reconstructed stadium to its painting. That established fidelity but missed the scale mismatch visible when a player stood near a barrel or a supporter. These studies put a touchline player and adjacent opponents in the same crop.

| Study | Player artwork | Sideline |
| --- | --- | --- |
| A | Original size | Approved Gatehouse |
| B | 125%, scaled about the planted feet | Same as A |
| C | 125%, same placement as B | Smaller spectators and props, drawn at pitch scale |
| D | 125%, same placement as B | Densely populated painted terrace with smaller faces and a dirt apron |

Compare A and B at the line of scrimmage to see how much room the larger figures leave between adjacent squares. Compare B and C at the touchline to judge the height of the supporters, benches and barrels. The playing grid stays at 32 native pixels per square.

![Four native-scale touchline comparisons with a single player and a six-player scrum](../../assets/game/references/stadiums/scale-studies/gallery-preview.webp)

### Material design

The new sideline starts with a transparent silhouette and explicit material assignments for tunics, hats and cloth. Skin, wood, iron, masonry, outlines and fixed neutral clothes have separate identities from team fabric, even when two materials happen to look similar in one colour scheme. Each fan gets a wardrobe assignment. Each bay has 12 supporters. Four wear fixed clothing, for a total of 16 out of 48. The other supporters use primary and secondary ramps with four shades each. The full strip and isolated figures share the same binary alpha at every figure edge.

Use the edge inspection view to check gaps between arms and bodies and the silhouettes of small props against light, dark and checkerboard backgrounds. Change the kits to inspect which surfaces follow the primary and secondary ramps. A good proof has clean edges, visible folds on both light and dark kits, and stable neutral clothing.

This is an overhead scale decision. The existing full Gatehouse gallery remains available for comparison. A full stadium redraw depends on the selected player and sideline scale.

Study D explores how the smaller figures read in Gatehouse’s painted style. Its 272 × 352 pixel terrace is a centred, downsampled crop of a newly generated 1070 × 1470 painting. Its crowd colours are baked into the concept. Study C is the working proof for recolouring and alpha. If D is selected, author its figures and fixtures separately with C’s material rules before assembling a full stand.
