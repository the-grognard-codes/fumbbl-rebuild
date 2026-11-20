"""Export the three bay-six proofs from the right-facing indexed supporter sheet."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ART = HERE.parent
CELL_SIZE = 32
BAY_ID = 6
COLUMNS = ("seated-fist", "seated-tankard", "seated-bottle", "seated-food",
           "standing-fist", "seated-folded")
# Each study uses its native atlas row. The first baseline sits below the
# top margin, and the next two use the tallest pose plus the spacing offset.
STUDIES = [
    ("a", "A · Open row", 2, 4, (("seated-fist", 42), ("seated-tankard", 41), ("seated-folded", 43))),
    ("b", "B · Balanced row", 2, -4, (("standing-fist", 41), ("seated-food", 42), ("seated-tankard", 43))),
    ("c", "C · Close row", 1, -9, (("standing-fist", 28), ("seated-bottle", 39), ("seated-tankard", 52))),
]


def spectator(atlas, pose, row, ramps):
    column = COLUMNS.index(pose)
    left, top = column * CELL_SIZE, row * CELL_SIZE
    tile = atlas.crop((left, top, left + CELL_SIZE, top + CELL_SIZE))
    colors = tile.getpalette()
    for material, ramp in enumerate(ramps):
        for shade, rgb in enumerate(ramp):
            start = 3 * (1 + 16 * material + shade)
            colors[start:start + 3] = bytes.fromhex(rgb[1:])
    tile.putpalette(colors)
    return tile.convert("RGBA")


def checked_pixels(layer, origin, mask, bay, label):
    """Check the complete source alpha and return its visible bay-local pixels."""
    source_x, source_y = origin
    pixels = set()
    for index, opacity in enumerate(layer.getchannel("A").tobytes()):
        if not opacity:
            continue
        row, column = divmod(index, layer.width)
        x, y = source_x + column, source_y + row
        native = bay["x"] + x, bay["y"] + y
        if (not (0 <= x < bay["width"] and 0 <= y < bay["height"])
                or mask.getpixel(native) != bay["id"]):
            raise ValueError(f"{label} crosses the bay at {native}")
        pixels.add((x, y))
    return pixels


def handrail(size, crowd_pixels, near_pixels, baseline):
    # The pitch-side posts clear every supporter. The return runs across the
    # nearest supporter's toes and can be lifted to inspect the complete pose.
    outer = max(x for x, _ in crowd_pixels) + 2
    start = min(y for _, y in crowd_pixels) + 2
    left = min(x for x, y in near_pixels if y >= baseline - 1)
    end = baseline - 1
    if start < 0 or outer + 3 >= size[0] or baseline + 1 >= size[1]:
        raise ValueError("The handrail crosses the bay bounds")

    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    shadow, oak, edge = "#38271e", "#856043", "#ae8460"
    draw.rectangle((outer, start, outer + 2, end), fill=shadow)
    draw.line((outer, start, outer, end - 1), fill=oak)
    draw.rectangle((left, end, outer + 2, end + 2), fill=shadow)
    draw.line((left, end, outer, end), fill=edge)
    for y in (start, (start + end) // 2, end - 1):
        draw.rectangle((outer - 1, y, outer + 3, y + 2), fill=shadow)
        draw.line((outer, y, outer + 2, y), fill=oak)
        draw.point((outer + 1, y), fill="#c8b089")
    return image


def build_study(mask, bay, atlas, palette, row, study):
    key, label, top_margin, spacing_offset, layout = study
    size = bay["width"], bay["height"]
    people = []
    for pose, x in layout:
        neutral = pose == "seated-tankard"
        ramps = (palette["slate"], palette["brown"]) if neutral else (palette["teal"], palette["violet"])
        person = spectator(atlas, pose, row, ramps)
        bounds = person.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"{label} has an empty {pose} cell")
        _, top, _, bottom = bounds
        seat = {"x": x, "pose": pose, "stance": pose.split("-", 1)[0],
                "height": bottom - top, "neutral": neutral}
        people.append((seat, person, bottom))

    tallest = max(seat["height"] for seat, _, _ in people)
    pitch = tallest + spacing_offset
    first_baseline = top_margin + tallest - 1
    placements = []
    for index, (seat, person, bottom) in enumerate(people):
        seat["y"] = first_baseline + index * pitch
        origin = seat["x"] - CELL_SIZE // 2, seat["y"] - bottom + 1
        pixels = checked_pixels(person, origin, mask, bay, f"{label} {seat['pose']}")
        placements.append((seat, person, origin, pixels))

    # Every complete silhouette has passed its mask check before any compositing.
    placements.sort(key=lambda placement: placement[0]["y"])
    crowd = Image.new("RGBA", size)
    crowd_pixels = set()
    overlap_pixels = set()
    for _, person, origin, pixels in placements:
        overlap_pixels.update(crowd_pixels & pixels)
        crowd_pixels.update(pixels)
        crowd.alpha_composite(person, origin)

    seats = [seat for seat, _, _, _ in placements]
    baseline = seats[-1]["y"]
    rail = handrail(size, crowd_pixels, placements[-1][3], baseline)
    rail_pixels = checked_pixels(rail, (0, 0), mask, bay, f"{label} rail")
    rail_overlap = crowd_pixels & rail_pixels
    if (not rail_overlap or any(y < baseline - 1 for _, y in rail_overlap)
            or any(rail_pixels & pixels for _, _, _, pixels in placements[:-1])):
        raise ValueError(f"{label} rail must cover only the nearer supporter's toes")

    return crowd, rail, {
        "id": key, "label": label, "height": tallest, "pitch": pitch, "seats": seats,
        "overlapPixels": len(overlap_pixels), "railOverlapPixels": len(rail_overlap),
    }


def build():
    spec = spec_from_file_location("seat_fit", ART / "build-empty-seating.py")
    fit = module_from_spec(spec)
    spec.loader.exec_module(fit)
    mask = fit.build_mask()
    manifest = fit.check_seating(mask)
    bay = next(b for b in manifest["bays"] if b["id"] == BAY_ID)
    delivery = ART.parents[2] / "team-colors/v1/delivery/manifest.json"
    palette = {r["id"]: r["colors"] for r in json.loads(delivery.read_text())["ramps"]}
    with Image.open(HERE / "supporters.png") as atlas:
        if atlas.mode != "P" or atlas.size != (CELL_SIZE * len(COLUMNS), CELL_SIZE * len(STUDIES)):
            raise ValueError("Supporter sheet must be an indexed 6 by 3 grid of 32 px cells")
        studies = [build_study(mask, bay, atlas, palette, row, study) for row, study in enumerate(STUDIES)]

    for crowd, rail, result in studies:
        key = result["id"]
        for name, layer in [(key, crowd), (key + "-rail", rail)]:
            path = HERE / (name + ".png")
            layer.save(path, optimize=True)
            fit.check_insert(mask, bay, path)
    results = [result for _, _, result in studies]
    (HERE / "seats.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
