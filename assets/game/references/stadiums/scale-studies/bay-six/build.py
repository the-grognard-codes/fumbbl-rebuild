"""Export the three bay-six proofs from the right-facing indexed supporter sheet."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

HERE = Path(__file__).resolve().parent
ART = HERE.parent
SEAT_WIDTH = 24
BAY_ID = 6
# Each row of the indexed sheet is a native size. Its six columns are poses.
# Each study chooses the gap beyond its tallest pose and the seating order.
STUDIES = [
    ("a", "A · Open row", 5, ("fist", "tankard", "folded")),
    ("b", "B · Balanced row", 4, ("tankard", "drumstick", "fist")),
    ("c", "C · Close row", 2, ("bottle", "fist", "tankard")),
]
COLUMNS = ("fist", "tankard", "bottle", "drumstick", "clap", "folded")


def spectator(atlas, pose, row, ramps):
    column = COLUMNS.index(pose)
    tile = atlas.crop((column * SEAT_WIDTH, row * SEAT_WIDTH, (column + 1) * SEAT_WIDTH, (row + 1) * SEAT_WIDTH))
    # All proof tiles are already authored at their final native size.
    size = SEAT_WIDTH
    image = tile.convert("RGBA")
    for y in range(size):
        for x in range(size):
            index = tile.getpixel((x, y))
            if 1 <= index <= 32:
                material, shade = divmod(index - 1, 16)
                rgb = bytes.fromhex(ramps[material][shade][1:])
                image.putpixel((x, y), (*rgb, 255))
    return image


def handrail(size, seats, tallest):
    # Longitudinal timber at the pitch side, with a short return in front
    # of the last seat. The clear rail layer can be lifted for inspection.
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    outer = max(seat["x"] for seat in seats) + tallest // 2 + 2
    start = max(0, seats[0]["y"] - tallest + 2)
    end = seats[-1]["y"] - 1
    shadow, oak, edge = "#38271e", "#856043", "#ae8460"
    draw.rectangle((outer, start, outer + 2, end), fill=shadow)
    draw.line((outer, start, outer, end - 1), fill=oak)
    left = seats[-1]["x"] - tallest // 2 + 1
    draw.rectangle((left, end - 1, outer + 2, end + 1), fill=shadow)
    draw.line((left, end - 1, outer, end - 1), fill=edge)
    for y in (start, (start + end) // 2, end - 1):
        draw.rectangle((outer - 1, y, outer + 3, y + 2), fill=shadow)
        draw.line((outer, y, outer + 2, y), fill=oak)
        draw.point((outer + 1, y), fill="#c8b089")
    return image


def build():
    spec = spec_from_file_location("seat_fit", ART / "build-empty-seating.py")
    fit = module_from_spec(spec)
    spec.loader.exec_module(fit)
    mask = fit.build_mask()
    manifest = fit.check_seating(mask)
    bay = next(b for b in manifest["bays"] if b["id"] == BAY_ID)
    size = bay["width"], bay["height"]
    atlas = Image.open(HERE / "supporters.png")
    delivery = ART.parents[2] / "team-colors/v1/delivery/manifest.json"
    palette = {r["id"]: r["colors"] for r in json.loads(delivery.read_text())["ramps"]}
    results = []

    for row, (key, label, clearance, poses) in enumerate(STUDIES):
        # Each group has two home supporters and one in fixed neutral clothing.
        people = [spectator(atlas, pose, row, (palette["slate"], palette["brown"])
                            if pose == "tankard" else (palette["teal"], palette["violet"]))
                  for pose in poses]
        extents = [p.getchannel("A").getbbox() for p in people]
        tallest = max(box[3] - box[1] for box in extents)
        pitch = tallest + clearance
        margin = (size[1] - (tallest + 2 * pitch)) // 2
        crowd = Image.new("RGBA", size)
        seats = []
        for n, (person, box, pose) in enumerate(zip(people, extents, poses)):
            x = 42 + (0, -1, 1)[n]
            bottom = margin + tallest - 1 + n * pitch
            left, top = x - SEAT_WIDTH // 2, bottom - box[3] + 1
            # Check the complete, untrimmed pose BEFORE any finite canvas receives it.
            for j in range(SEAT_WIDTH):
                for i in range(SEAT_WIDTH):
                    if person.getpixel((i, j))[3]:
                        local = left + i, top + j
                        native = bay["x"] + local[0], bay["y"] + local[1]
                        if not (0 <= local[0] < size[0] and 0 <= local[1] < size[1]) or mask.getpixel(native) != BAY_ID:
                            raise ValueError(f"{label} {pose} crosses the bay at {native}")
                        if crowd.getpixel(local)[3]:
                            raise ValueError(f"{label} {pose} overlaps another supporter")
            crowd.alpha_composite(person, (left, top))
            seats.append({"x": x, "y": bottom, "pose": pose})
        rail = handrail(size, seats, tallest)
        covered = ImageChops.multiply(crowd.getchannel("A"), rail.getchannel("A")).getbbox()
        last_seat = seats[-1]["y"]
        if not covered or covered[1] < last_seat - 2 or covered[3] > last_seat + 1:
            raise ValueError(f"{label} front rail must cover only the bottom of the last spectator")
        for name, layer in [(key, crowd), (key + "-rail", rail)]:
            path = HERE / (name + ".png")
            layer.save(path, optimize=True)
            fit.check_insert(mask, bay, path)
        results.append({"id": key, "label": label, "height": tallest, "pitch": pitch, "seats": seats})
    (HERE / "seats.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
