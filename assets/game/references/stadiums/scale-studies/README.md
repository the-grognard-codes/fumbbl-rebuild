# Gatehouse gallery artwork

## Gatehouse bench-top template

The [bench layout](gatehouse-benches.json) records 64 plank tops across all 15 seating bays. Each plank has a stable numeric ID and a name within its bay. The last digit is the plank number, so plank 62 is plank 2 in bay 6. Its rectangles are measured in native pixels from the bay’s top-left corner and stored as `[x, y, width, height]`. Their union, intersected with the approved seating mask for that bay, defines the usable timber surface. Keep the same plank IDs and surfaces when drawing a new stadium skin for this layout.

Enable **Bench tops** in the gallery to show the surfaces beneath the crowd. Colours repeat by plank number within each bay. The exported mask identifies each individual plank across the stadium. The west-bay crowd builder uses the same template to register each hip and check that both boot contacts of a standing supporter land on one plank. Spectator silhouettes may extend past the wood anywhere the seating-section mask permits.

To obtain a native 790 × 1188 grayscale PNG for an art editor, run the following from the repository root with Pillow. A pixel value of 0 means no support. Every other value is a plank ID from the layout.

```text
python -B assets/game/references/stadiums/scale-studies/build-empty-seating.py --export-bench-mask gatehouse-plank-ids.png
```

## West bay 6 supporter proofs

The eight-place plan in [the crowd builder](bay-six/build.py) is shared by the 100%, 75% and 50% gallery views. Each supporter has a fixed plank, contact, pose, wardrobe and lowest attendance at which they appear. Four places fit along each of planks 62 and 63. A full pose anchored to either outer plank would cross the bay boundary. Each attendance exports as one transparent section image.

Bay 6 is a 65 × 74 px west stand at native (22, 589). The two intact bench tops run from local x=19 through 27 and x=38 through 47. The [indexed supporter sheet](bay-six/supporters.png) has one row of six 48 × 48 px cells at final game scale. In column order the poses are seated with a cheering fist, seated with a tankard, seated with a bottle, seated with food, standing with a cheering fist, and seated with folded arms. Palette index 0 is transparent, 1–16 and 17–32 hold the two clothing ramps, and the other indices hold fixed colours. The tankard drinker wears fixed grey and brown.

The [pose landmarks](bay-six/pose-landmarks.json) are measured in pixels from the top left of each source cell. A seated pose has a contact point on the underside of the hip and a second point at the bend of the near knee, 10 px farther toward the pitch. A standing pose has a point on each sole. To register a figure, subtract its local contact point from the intended contact on the timber. This places the thigh across the bench and lets the boots hang beyond its pitch-side edge. All three layouts use the same native artwork.

Run `python -B assets/game/references/stadiums/scale-studies/bay-six/build.py` with Pillow to rebuild the proofs. The gallery’s [pose inspection sheet](bay-six/supporter-kits.png) shows the team wardrobe in its top row and the neutral wardrobe in its bottom row. Both use the same source cells and clothing ramps as the assembled section. The [seat list](bay-six/seats.json) records capacity and occupied contacts and tile origins in bay-local pixels. The complete silhouette must fit the approved bay before compositing. Nearer spectators can obscure figures behind them. The front rail exports as its own layer.

Each seated pose also marks the backs of its calves and heels in `behindSeat` rectangles, in source-cell pixels as `[x, y, width, height]`. After the full silhouette passes the bay check, the builder makes those pixels transparent wherever they meet that supporter’s own plank. It then draws the supporter into the section image. This lets another spectator or the stadium’s painted wood show through. Keep the front of each shin and boot visible when authoring a new pose.

Run `python -B assets/game/references/stadiums/scale-studies/bay-six/test_build.py` to check bench contacts, both boot silhouettes, plank cutouts, and the bay boundary for pixels hidden by timber or another supporter.

## Empty Gatehouse seating bays

The [bay dimension manifest](empty-seating.json) gives each bay's exact bounds and permitted pixel count from the [seating mask](empty-seating.png). Both the mask and [empty stadium artwork](empty-gatehouse.webp) register at (0, 0) on the 790 × 1188 px native gallery canvas. Coordinates measure from the upper-left corner, with x increasing right and y increasing down. Mask value 0 reserves the aisles, entrances, fixtures and space outside the seating. The IDs are 1–3 north, 4–7 west, 8–11 east and 12–15 south.

Check each original, untrimmed PNG at its intended native origin before assembling the insert. Use single-frame PNGs with 8 bits per channel or fewer so the checker reads every alpha value exactly. In `--check-placement`, `X` and `Y` give the native coordinates of the source PNG's upper-left pixel. Transparent margins can extend past the bay or stadium edges. Any nonzero alpha, including partial transparency, must land on that bay's mask ID.

Export one transparent PNG per bay with the exact `width` and `height` from its manifest entry. The insert's upper-left pixel registers at that bay's `(x, y)` at native scale. `--check-insert` verifies the final canvas size and coverage, including the brazier cutouts and the wedges inside irregular bounds.

Run these checks from the repository root with Pillow. Substitute the target bay ID, source origin, and file paths for your artwork. Both PNG checks report the native coordinates of visible alpha outside the bay and leave the input assets untouched.

```text
python assets/game/references/stadiums/scale-studies/build-empty-seating.py --check
python assets/game/references/stadiums/scale-studies/build-empty-seating.py --check-placement 2 240 24 north-center-source.png
python assets/game/references/stadiums/scale-studies/build-empty-seating.py --check-insert 2 north-center.png
```

## Earlier inward-facing Gatehouse study

This study uses the editable native-resolution [terraces](gatehouse-terraces.png) and [spectator sheet](spectator-wardrobe.png). Both are indexed PNGs. Index 0 is transparent, 1–16 shade the primary fabric, 17–32 shade secondary fabric, and the other indices hold fixed colours. Preserve these assignments when editing an individual pixel. The sheet contains twelve poses in three directions, with reflected profiles for the east stand.

Run `python assets/game/references/stadiums/scale-studies/build-gatehouse.py` with Pillow to seat the crowd and export the lossless foreground and matching material plane. Each bay has a repeatable mix of fixed neutral outfits and team wardrobes. Opaque hands, hair and carried objects replace any material underneath them. In the output mask, zero keeps the underlying pixel fixed, 1–32 are home cloth, and 33–64 are away cloth. The pitch renderer draws the ground through the open south doors.

## Earlier mask-first sideline study

The 112 × 416 px strip depicts a west sideline with the pitch beginning at local x=112. A pitch square spans 32 px. Most spectator heads are 8–12 px across, the complete fan silhouettes are 16–17 px tall, and the field-side barrels are 9 × 10 px. The two dugouts are each roughly two squares long.

[The drawing script](draw-mask-first-sideline.py) is the original artwork. It draws the stone, timber, dirt, props and spectators on a single native-resolution indexed plane. Spectator poses are hand-drawn rows of pixel tokens. Each point in a garment is assigned a material and shade in the pose itself. A fixed per-person rule assigns one outfit in each three-fan row to a neutral ramp. The four bays each have 12 fans, four of whom wear fixed clothing. Both output planes come directly from the drawing indices and share the same binary alpha.

| File | Contents |
| --- | --- |
| `mask-first-sideline.png` | Full RGBA strip with a muted reference kit |
| `mask-first-sideline.materials.png` | Full material data |
| `mask-first-sideline.cutout.png` | Transparent inspection view of the fans, standards, braziers and barrels at the same coordinates |
| `mask-first-sideline.cutout.materials.png` | Material data for the inspection view |
| `mask-first-sideline.rear.png` | Fixed 160 × 416 px concourse that joins the west edge in the wider comparison |

The material PNGs use red 0 for fixed color, red 1 for the primary kit, and red 2 for the secondary kit. Green is 0 for fixed color and 1–4 for kit shades from darkest to lightest. Blue is 0 throughout. Each transparent pixel is zero in all four channels. Skin, hair, outlines, props and neutral garments always use their reference colors.

From the repository root, run the following with Python 3.10+ and Pillow 12.1+. The check rerenders all five assets, verifies exact decoded pixels and alpha, and checks tint ownership, shade coverage and the neutral count in each bay.

```text
python assets/game/references/stadiums/scale-studies/draw-mask-first-sideline.py
python assets/game/references/stadiums/scale-studies/draw-mask-first-sideline.py --check
```
