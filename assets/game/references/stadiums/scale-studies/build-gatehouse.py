"""Build Gatehouse's lossless foreground and team material plane from indexed native art.

Each source PNG reserves 0 for transparency, 1..16 for primary cloth and
17..32 for secondary cloth. Other entries are literal fixed colours.
"""
from collections import Counter
import json
from pathlib import Path
from random import Random

from PIL import Image, ImageColor, ImageOps

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT.parents[2] / "team-colors/v1/delivery/manifest.json"
POSES = ("fist", "tankard", "bottle", "drumstick", "clap", "folded",
         "wave", "drink", "toast", "pie", "point", "lean")
UNIT = 24


def seating():
    """Seat centres and bottom edges in native pixels, clear of steps and rails."""
    bays = []
    # Back rows are drawn first, with the nearer row overlapping their waists.
    def rows(facing, away, left, right, bottom_edges, spacing):
        seats = []
        for row, bottom in enumerate(bottom_edges):
            count = max(1, round((right - left) / spacing))
            for col in range(count):
                x = left + (col + .5) * (right - left) / count
                seats.append((round(x + (-1 if row % 2 else 1)), bottom, facing, away))
        bays.append(seats)

    for left, right in [(58,182), (242,544), (607,730)]:
        rows("front", False, left, right, [31,51,71,88], 21)
    for left, right in [(20,92), (697,770)]:
        rows("front", False, left, right, [85,102], 20)
    for left, right, away in [(14,88,False), (702,775,True)]:
        for top, bottom in [(150,357), (438,642), (722,1016)]:
            rows("left" if away else "right", away, left, right,
                 range(top + 17, bottom + 1, 17), 19)
    for left, right in [(23,183), (237,286), (501,548), (606,765)]:
        # Leave the inner rail and hanging shields visible above the first row.
        first = 1128 if left in (237,501) else 1096
        rows("back", False, left, right, range(first,1167,17), 21)
    return bays


def build():
    ramps = {r["id"]: [ImageColor.getrgb(c) for c in r["colors"]]
             for r in json.loads(MANIFEST.read_text())["ramps"]}
    plate = Image.open(ROOT / "gatehouse-terraces.png")
    atlas = Image.open(ROOT / "spectator-wardrobe.png")
    canvas = plate.convert("RGBA")
    materials = Image.new("L", plate.size)
    mask = materials.load()
    art = canvas.load()

    def cloth(index, away):
        slot, shade = divmod(index - 1, 16)
        color = (("red", "ivory") if away else ("navy", "gold"))[slot]
        return ramps[color][shade], index + (32 if away else 0)

    for y in range(plate.height):
        for x in range(plate.width):
            index = plate.getpixel((x,y))
            if 1 <= index <= 32:
                rgb, material = cloth(index, x >= 650 and 150 < y < 1000)
                art[x,y], mask[x,y] = (*rgb,255), material

    rng = Random(572)
    counts = Counter()
    for bay in seating():
        neutral = [True] * round(len(bay)/3)
        neutral.extend([False] * (len(bay) - len(neutral)))
        rng.shuffle(neutral)
        last_pose = None
        for (x, y, facing, away), fixed in zip(bay, neutral):
            pose = rng.choice([p for p in range(len(POSES)) if p != last_pose])
            last_pose = pose
            row = {"front":0,"right":1,"left":1,"back":2}[facing]
            tile = atlas.crop((pose*UNIT,row*UNIT,(pose+1)*UNIT,(row+1)*UNIT))
            if facing == "left" or (facing in ("front","back") and rng.randrange(2)):
                tile = ImageOps.mirror(tile)
            width = rng.randrange(19,24)
            tile = tile.resize((width,rng.randrange(20,25)),Image.Resampling.NEAREST)
            fixed_rgba = tile.convert("RGBA")
            coat = rng.choice(("brown","slate","black"))
            trim = rng.choice(("brown","slate","ivory"))
            left, top = x - width//2 + rng.randrange(-3,4), y - tile.height + rng.randrange(-2,3)
            for j in range(tile.height):
                for i in range(tile.width):
                    index = tile.getpixel((i,j))
                    if index == 0:
                        continue
                    material = 0
                    rgba = fixed_rgba.getpixel((i,j))
                    if index <= 32:
                        rgb, material = cloth(index, away)
                        if fixed:
                            slot, shade = divmod(index - 1,16)
                            rgb, material = ramps[(coat, trim)[slot]][shade], 0
                        rgba = (*rgb,255)
                    art[left+i,top+j], mask[left+i,top+j] = rgba, material
            counts["supporters"] += 1
            counts["neutral"] += fixed
            counts[POSES[pose]] += 1

    canvas.save(ROOT / "gatehouse-inward.webp", lossless=True, method=6)
    materials.save(ROOT / "gatehouse-materials.png", optimize=True)
    print(dict(counts))


if __name__ == "__main__":
    build()
