# Gatehouse mask-first sideline study

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
