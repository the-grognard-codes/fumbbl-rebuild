"""Export the three bay-six proofs from the right-facing indexed supporter sheet."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ART = HERE.parent
CELL_SIZE = 48
BAY_ID = 6
COLUMNS = ("seated-fist", "seated-tankard", "seated-bottle", "seated-food",
           "standing-fist", "seated-folded")
# Inclusive left, top, right, bottom measured on the unscaled bay artwork.
BENCHES = {"rear-bench": (19, 0, 27, 73), "inner-bench": (38, 12, 47, 73)}
# Every variant uses the same atlas scale. Coordinates mark a hip or a boot.
STUDIES = [
    ("a", "A · Open row", (("seated-fist", "rear-bench", 19, 28),
                           ("seated-folded", "inner-bench", 38, 50),
                           ("seated-tankard", "rear-bench", 19, 65))),
    ("b", "B · Balanced row", (("seated-food", "inner-bench", 38, 30),
                               ("standing-fist", "rear-bench", 19, 46),
                               ("seated-tankard", "inner-bench", 38, 62))),
    ("c", "C · Close row", (("standing-fist", "rear-bench", 19, 44),
                            ("seated-tankard", "inner-bench", 38, 54),
                            ("seated-bottle", "rear-bench", 19, 64))),
]


def spectator(atlas, pose, ramps):
    column = COLUMNS.index(pose)
    left = column * CELL_SIZE
    tile = atlas.crop((left, 0, left + CELL_SIZE, CELL_SIZE))
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


def handrail(size):
    # Hardware sits on the outermost plank, in front of the occupied supports.
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    shadow, oak, edge = "#38271e", "#856043", "#ae8460"
    draw.rectangle((60, 20, 62, 66), fill=shadow)
    draw.line((60, 20, 60, 65), fill=oak)
    draw.rectangle((57, 66, 62, 68), fill=shadow)
    draw.line((57, 66, 60, 66), fill=edge)
    for y in (20, 43, 65):
        draw.rectangle((59, y, 63, y + 2), fill=shadow)
        draw.line((60, y, 62, y), fill=oak)
        draw.point((61, y), fill="#c8b089")
    return image


def place_pose(person, pose, support, x, y, landmarks):
    alpha = person.getchannel("A")
    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"{pose} cell is empty")
    contact_x, contact_y = landmarks["contact"]
    if not (0 <= contact_x < CELL_SIZE and 0 <= contact_y < CELL_SIZE
            and alpha.getpixel((contact_x, contact_y))):
        raise ValueError(f"{pose} contact is outside its visible silhouette")
    left, top = x - contact_x, y - contact_y
    seat = {"x": x, "y": y, "pose": pose, "support": support,
            "origin": {"x": left, "y": top}, "height": bounds[3] - bounds[1]}
    back, first, front, last = BENCHES[support]

    if pose.startswith("seated-"):
        local_knee_x, local_knee_y = landmarks["knee"]
        knee_x, knee_y = left + local_knee_x, top + local_knee_y
        if not (0 <= local_knee_x < CELL_SIZE and 0 <= local_knee_y < CELL_SIZE
                and alpha.getpixel((local_knee_x, local_knee_y))):
            raise ValueError(f"{pose} knee is outside its visible silhouette")
        if not (x == back and first <= y <= last and front <= knee_x <= front + 2
                and first <= knee_y <= last):
            raise ValueError(f"{pose} hip and knee do not fit {support}")
        seat.update(stance="seated", knee={"x": knee_x, "y": knee_y},
                    benchWidth=front - back + 1, thighSpan=knee_x - x)
    else:
        local_sole_x, local_sole_y = landmarks["otherSole"]
        sole_x, sole_y = left + local_sole_x, top + local_sole_y
        if not (back <= x <= front and back <= sole_x <= front and first <= y <= last
                and local_sole_y == contact_y == bounds[3] - 1
                and 0 <= local_sole_x < CELL_SIZE and alpha.getpixel((local_sole_x, local_sole_y))):
            raise ValueError(f"{pose} cannot land both boot soles on {support}")
        seat.update(stance="standing", otherSole={"x": sole_x, "y": sole_y})
    return seat, (left, top)


def build_study(mask, bay, atlas, palette, landmarks, study):
    key, label, layout = study
    size = bay["width"], bay["height"]
    placements = []
    for pose, support, x, y in layout:
        neutral = pose == "seated-tankard"
        ramps = (palette["slate"], palette["brown"]) if neutral else (palette["teal"], palette["violet"])
        person = spectator(atlas, pose, ramps)
        seat, origin = place_pose(person, pose, support, x, y, landmarks[pose])
        seat["neutral"] = neutral
        pixels = checked_pixels(person, origin, mask, bay, f"{label} {pose}")
        placements.append((seat, person, origin, pixels))

    # Every complete silhouette has passed its mask check before any compositing.
    placements.sort(key=lambda placement: max(y for _, y in placement[3]))
    crowd = Image.new("RGBA", size)
    crowd_pixels = set()
    overlap_pixels = set()
    for _, person, origin, pixels in placements:
        overlap_pixels.update(crowd_pixels & pixels)
        crowd_pixels.update(pixels)
        crowd.alpha_composite(person, origin)

    seats = [seat for seat, _, _, _ in placements]
    contacts = sorted(seat["y"] for seat in seats)
    gaps = [south - north for north, south in zip(contacts, contacts[1:])]
    rail = handrail(size)
    rail_pixels = checked_pixels(rail, (0, 0), mask, bay, f"{label} rail")
    rail_overlap = crowd_pixels & rail_pixels

    return crowd, rail, {
        "id": key, "label": label, "height": max(seat["height"] for seat in seats),
        "pitch": min(gaps), "spacing": {"min": min(gaps), "max": max(gaps)}, "seats": seats,
        "overlapPixels": len(overlap_pixels), "railOverlapPixels": len(rail_overlap),
    }


def save_layer(layer, path):
    # The enlarged poses reuse a small palette. Store each exact RGBA value once.
    colours = layer.getcolors(maxcolors=256)
    if colours is None:
        layer.save(path, optimize=True)
        return
    palette = sorted(colour for _, colour in colours)
    indices = {colour: i for i, colour in enumerate(palette)}
    indexed = Image.new("P", layer.size)
    indexed.putpalette(bytes(channel for colour in palette for channel in colour[:3]))
    pixels = layer.load()
    indexed.putdata([indices[pixels[x, y]] for y in range(layer.height) for x in range(layer.width)])
    alpha = bytes(colour[3] for colour in palette).rstrip(b"\xff")
    indexed.save(path, transparency=alpha, optimize=True)


def build():
    spec = spec_from_file_location("seat_fit", ART / "build-empty-seating.py")
    fit = module_from_spec(spec)
    spec.loader.exec_module(fit)
    mask = fit.build_mask()
    manifest = fit.check_seating(mask)
    bay = next(b for b in manifest["bays"] if b["id"] == BAY_ID)
    delivery = ART.parents[2] / "team-colors/v1/delivery/manifest.json"
    palette = {r["id"]: r["colors"] for r in json.loads(delivery.read_text())["ramps"]}
    landmarks = json.loads((HERE / "pose-landmarks.json").read_text())
    with Image.open(HERE / "supporters.png") as atlas:
        if atlas.mode != "P" or atlas.size != (CELL_SIZE * len(COLUMNS), CELL_SIZE):
            raise ValueError("Supporter sheet must be an indexed row of six 48 px cells")
        studies = [build_study(mask, bay, atlas, palette, landmarks, study) for study in STUDIES]

    for crowd, rail, result in studies:
        key = result["id"]
        for name, layer in [(key, crowd), (key + "-rail", rail)]:
            path = HERE / (name + ".png")
            save_layer(layer, path)
            fit.check_insert(mask, bay, path)
    results = [result for _, _, result in studies]
    (HERE / "seats.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
