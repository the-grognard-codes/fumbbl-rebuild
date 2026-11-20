"""Export the three bay-six proofs from the right-facing indexed supporter sheet."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
from typing import NamedTuple

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
ART = HERE.parent
CELL_SIZE = 48
BAY_ID = 6
COLUMNS = ("seated-fist", "seated-tankard", "seated-bottle", "seated-food",
           "standing-fist", "seated-folded")
spec = spec_from_file_location("seat_fit", ART / "build-empty-seating.py")
fit = module_from_spec(spec)
spec.loader.exec_module(fit)


class Seat(NamedTuple):
    support: str
    x: int
    y: int
    pose: str
    neutral: bool
    first_fill: int


# First fill is the lowest attendance at which this place is occupied.
SEAT_PLAN = (
    Seat("wall-bench", 6, 28, "seated-bottle", False, 50),
    Seat("wall-bench", 5, 46, "seated-fist", True, 75),
    Seat("wall-bench", 5, 56, "seated-bottle", False, 100),
    Seat("wall-bench", 6, 65, "seated-folded", False, 50),
    Seat("rear-bench", 19, 30, "seated-fist", False, 75),
    Seat("rear-bench", 19, 40, "seated-tankard", True, 100),
    Seat("rear-bench", 19, 48, "seated-food", True, 50),
    Seat("rear-bench", 19, 71, "standing-fist", False, 50),
    Seat("inner-bench", 38, 29, "seated-tankard", True, 50),
    Seat("inner-bench", 38, 37, "seated-bottle", False, 100),
    Seat("inner-bench", 38, 48, "seated-folded", False, 75),
    Seat("inner-bench", 38, 66, "seated-bottle", False, 50),
)
STUDIES = [
    (key, f"{key.upper()} · {fill}% full", [seat for seat in SEAT_PLAN if seat.first_fill <= fill])
    for key, fill in (("a", 100), ("b", 75), ("c", 50))
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


def kit_ramps(palette, neutral):
    return (palette["slate"], palette["brown"]) if neutral else (palette["teal"], palette["violet"])


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


def place_pose(person, pose, support, x, y, landmarks, planks):
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
    plank_id, footprint = planks[support]
    seat["plankId"] = plank_id

    def on_plank(px, py):
        return 0 <= px < footprint.width and 0 <= py < footprint.height and footprint.getpixel((px, py)) != 0

    if pose.startswith("seated-"):
        local_knee_x, local_knee_y = landmarks["knee"]
        knee_x, knee_y = left + local_knee_x, top + local_knee_y
        if not (0 <= local_knee_x < CELL_SIZE and 0 <= local_knee_y < CELL_SIZE
                and alpha.getpixel((local_knee_x, local_knee_y))):
            raise ValueError(f"{pose} knee is outside its visible silhouette")
        if not on_plank(x, y):
            raise ValueError(f"{pose} hip is off {support}")
        back = x
        while on_plank(back - 1, y):
            back -= 1
        front = x
        while on_plank(front + 1, y):
            front += 1
        width = front - back + 1
        if support == "wall-bench":
            # A fan can perch nearer the lip with room for their back inside the wall.
            # Measure the continuous seated silhouette over timber one pixel above the hip.
            bearing = 0
            for px in range(front, back - 1, -1):
                if not (on_plank(px, y - 1) and 0 <= px - left < alpha.width
                        and contact_y > 0 and alpha.getpixel((px - left, contact_y - 1))):
                    break
                bearing += 1
            if 3 * bearing < 2 * width or 3 * (x - back) > 2 * width:
                raise ValueError(f"{pose} has insufficient support on {support}")
        elif x != back:
            raise ValueError(f"{pose} hip and knee do not fit {support}")
        if not (front <= knee_x <= x + width + 1 and on_plank(front, knee_y)):
            raise ValueError(f"{pose} hip and knee do not fit {support}")
        seat.update(stance="seated", knee={"x": knee_x, "y": knee_y},
                    benchWidth=width, thighSpan=knee_x - x)
    else:
        local_sole_x, local_sole_y = landmarks["otherSole"]
        sole_x, sole_y = left + local_sole_x, top + local_sole_y
        if not (on_plank(x, y) and on_plank(sole_x, sole_y)
                and local_sole_y == contact_y == bounds[3] - 1
                and 0 <= local_sole_x < CELL_SIZE and alpha.getpixel((local_sole_x, local_sole_y))):
            raise ValueError(f"{pose} cannot land both boot soles on {support}")
        seat.update(stance="standing", otherSole={"x": sole_x, "y": sole_y})
    return seat, (left, top)


def tuck_behind_seat(person, origin, footprint, regions):
    """Expose the supporting plank only behind the authored parts of this pose."""
    left, top = origin
    for x, y, width, height in regions:
        if not (0 <= x < x + width <= person.width and 0 <= y < y + height <= person.height):
            raise ValueError(f"Invalid behindSeat rectangle {(x, y, width, height)}")
        plank = footprint.crop((left + x, top + y, left + x + width, top + y + height))
        # Each tile is private to its placement. Clearing it here preserves people behind it.
        person.paste((0, 0, 0, 0), (x, y, x + width, y + height), plank)


def build_study(mask, bay, atlas, palette, landmarks, study, planks):
    key, label, layout = study
    size = bay["width"], bay["height"]
    placements = []
    for slot in layout:
        person = spectator(atlas, slot.pose, kit_ramps(palette, slot.neutral))
        seat, origin = place_pose(person, slot.pose, slot.support, slot.x, slot.y, landmarks[slot.pose], planks)
        seat["neutral"] = slot.neutral
        pixels = checked_pixels(person, origin, mask, bay, f"{label} {slot.pose}")
        placements.append((seat, person, origin, pixels))

    # Every complete silhouette has passed its mask check before any compositing.
    placements.sort(key=lambda placement: max(y for _, y in placement[3]))
    crowd = Image.new("RGBA", size)
    crowd_pixels = set()
    overlap_pixels = set()
    for seat, person, origin, pixels in placements:
        overlap_pixels.update(crowd_pixels & pixels)
        crowd_pixels.update(pixels)
        if seat["stance"] == "seated":
            _, footprint = planks[seat["support"]]
            tuck_behind_seat(person, origin, footprint, landmarks[seat["pose"]]["behindSeat"])
        crowd.alpha_composite(person, origin)

    seats = [seat for seat, _, _, _ in placements]
    gaps = []
    for support in {seat["support"] for seat in seats}:
        row = sorted((seat for seat in seats if seat["support"] == support), key=lambda seat: seat["y"])
        for north, south in zip(row, row[1:]):
            # The cheering supporter has both a seated and a standing pose.
            if north["pose"].split("-", 1)[1] == south["pose"].split("-", 1)[1]:
                raise ValueError(f"{label} repeats adjacent supporters on {support}")
            gaps.append(south["y"] - north["y"])
    rail = handrail(size)
    rail_pixels = checked_pixels(rail, (0, 0), mask, bay, f"{label} rail")
    rail_overlap = crowd_pixels & rail_pixels

    return crowd, rail, {
        "id": key, "label": label, "capacity": len(SEAT_PLAN), "height": max(seat["height"] for seat in seats),
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
    mask = fit.build_mask()
    manifest = fit.check_seating(mask)
    bay = next(b for b in manifest["bays"] if b["id"] == BAY_ID)
    _, supports = fit.bench_guide(mask, manifest)
    delivery = ART.parents[2] / "team-colors/v1/delivery/manifest.json"
    palette = {r["id"]: r["colors"] for r in json.loads(delivery.read_text())["ramps"]}
    landmarks = json.loads((HERE / "pose-landmarks.json").read_text())
    with Image.open(HERE / "supporters.png") as atlas:
        if atlas.mode != "P" or atlas.size != (CELL_SIZE * len(COLUMNS), CELL_SIZE):
            raise ValueError("Supporter sheet must be an indexed row of six 48 px cells")
        studies = [build_study(mask, bay, atlas, palette, landmarks, study, supports[BAY_ID]) for study in STUDIES]
        kits = Image.new("RGBA", (atlas.width, 2 * CELL_SIZE))
        for row, neutral in enumerate((False, True)):
            for column, pose in enumerate(COLUMNS):
                person = spectator(atlas, pose, kit_ramps(palette, neutral))
                kits.paste(person, (column * CELL_SIZE, row * CELL_SIZE))
        save_layer(kits, HERE / "supporter-kits.png")

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
