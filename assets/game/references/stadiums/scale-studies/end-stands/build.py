"""Build the two registered end-stand seating proofs at native scale."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
ART = HERE.parent
CELL_SIZE = 48
CAST = ("horn", "clap", "pie")
ANGLES = {"north": (1, "front", 1), "south": (12, "back", -1)}
COLUMNS = tuple(f"{stand}-{supporter}" for stand in ANGLES for supporter in CAST)

spec = spec_from_file_location("seat_fit", ART / "build-empty-seating.py")
fit = module_from_spec(spec)
spec.loader.exec_module(fit)


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def geometry():
    mask = fit.build_mask()
    manifest = fit.check_seating(mask)
    _, supports = fit.bench_guide(mask, manifest)
    return mask, {bay["id"]: bay for bay in manifest["bays"]}, supports


def spectator(atlas, pose, palette):
    x = COLUMNS.index(pose) * CELL_SIZE
    tile = atlas.crop((x, 0, x + CELL_SIZE, CELL_SIZE))
    colors = tile.getpalette()
    for material, ramp in enumerate(("teal", "violet")):
        for shade, rgb in enumerate(palette[ramp]):
            start = 3 * (1 + 16 * material + shade)
            colors[start:start + 3] = bytes.fromhex(rgb[1:])
    tile.putpalette(colors)
    return tile.convert("RGBA")


def checked_pixels(layer, origin, mask, bay, label):
    """Check every untrimmed source pixel before its bay canvas can clip it."""
    left, top = origin
    visible = set()
    for index, opacity in enumerate(layer.getchannel("A").tobytes()):
        if not opacity:
            continue
        row, column = divmod(index, layer.width)
        x, y = left + column, top + row
        native = bay["x"] + x, bay["y"] + y
        if (not (0 <= x < bay["width"] and 0 <= y < bay["height"])
                or mask.getpixel(native) != bay["id"]):
            raise ValueError(f"{label} crosses bay {bay['id']} at native {native}")
        visible.add((x, y))
    return visible


def contains(footprint, x, y):
    return 0 <= x < footprint.width and 0 <= y < footprint.height and footprint.getpixel((x, y)) != 0


def screened_region(pixels, origin, region):
    if region is None:
        return set()
    left, top, right, bottom = region
    ox, oy = origin
    return {(x, y) for x, y in pixels if left <= x - ox < right and top <= y - oy < bottom}


def place(person, pose, anchor, direction, landmarks, footprint):
    alpha = person.getchannel("A")
    contact, knee = (tuple(landmarks[key]) for key in ("contact", "knee"))
    for point in (contact, knee):
        if not all(0 <= value < CELL_SIZE for value in point) or not alpha.getpixel(point):
            raise ValueError(f"{pose} has an unsupported anatomical landmark at {point}")
    x, y = anchor
    if not contains(footprint, x, y):
        raise ValueError(f"{pose} hip at {anchor} is off its plank")
    ox, oy = x - contact[0], y - contact[1]
    knee_x, knee_y = ox + knee[0], oy + knee[1]
    lip = y
    while contains(footprint, knee_x, lip + direction):
        lip += direction
    # From behind, the knee landmark projects under the tunic onto the bench top.
    lip_tolerance = 1 if direction == 1 else 5
    if (direction * (knee_y - y) <= 0 or direction * (knee_y - lip) < -lip_tolerance
            or not contains(footprint, knee_x, lip)):
        raise ValueError(f"{pose} thigh must reach the pitch-facing plank lip")
    if direction < 0:
        check_rear_seat(alpha, pose, (ox, oy), contact, landmarks["seatEdgeY"], footprint)
    return (ox, oy), (knee_x, knee_y)


def check_rear_seat(alpha, pose, origin, contact, edge_y, footprint):
    """Require the complete rear seat contour to rest on the measured bench top."""
    if not 1 <= edge_y - contact[1] <= 3 or alpha.getbbox()[3] != edge_y + 1:
        raise ValueError(f"{pose} must end at its seated edge")
    ox, oy = origin
    previous = {contact[0]}
    for y in range(contact[1], edge_y + 1):
        span = {x for x in range(alpha.width) if alpha.getpixel((x, y))}
        if not span & previous or len(span) != max(span) - min(span) + 1:
            raise ValueError(f"{pose} has a split rear seat contour at row {y}")
        if any(not contains(footprint, ox + x, oy + y) for x in span):
            raise ValueError(f"{pose} rear seat contour extends off its plank")
        previous = span


def handrail(size, shape):
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    left, top, right = shape
    if not (1 <= left < right < size[0] - 1 and 1 <= top < size[1] - 2):
        raise ValueError("Handrail falls outside the bay canvas")
    draw.rectangle((left, top, right, top + 1), fill="#38271e")
    draw.line((left, top, right, top), fill="#856043")
    for x in (left, (left + right) // 2, right):
        draw.rectangle((x - 1, top - 1, x + 1, top + 2), fill="#38271e")
        draw.point((x, top - 1), fill="#ae8460")
    return image


def point(coords):
    x, y = coords
    return {"x": x, "y": y}


def build_angle(stand, layout, atlas, palette, landmarks, mask, bay, supports):
    bay_id, facing, direction = ANGLES[stand]
    size = bay["width"], bay["height"]
    if bay["id"] != bay_id or bay["stand"] != stand:
        raise ValueError(f"Bay {bay['id']} is not the authored {stand} bay")
    prepared, slots, vacancies = [], [], []
    used_planks = set()
    tiles = {supporter: spectator(atlas, f"{stand}-{supporter}", palette) for supporter in CAST}
    for row in layout["rows"]:
        plank_id, footprint = supports[row["plank"]]
        if plank_id in used_planks or not row["occupants"]:
            raise ValueError(f"{stand} must use each occupied plank only once")
        used_planks.add(plank_id)
        occupants = {int(slot): supporter for slot, supporter in row["occupants"].items()}
        if any(index < 0 or index >= len(row["anchors"]) for index in occupants):
            raise ValueError(f"{stand} tries to occupy an unplanned position")
        for index, anchor in enumerate(row["anchors"]):
            slots.append({"plankId": plank_id, "slot": point(anchor)})
            if index not in occupants:
                vacancies.append((anchor, footprint))
                continue

            supporter = occupants[index]
            pose = f"{stand}-{supporter}"
            person = tiles[supporter]
            marks = landmarks[pose]
            origin, knee = place(person, pose, anchor, direction, marks, footprint)
            alpha = checked_pixels(person, origin, mask, bay, pose)
            face = screened_region(alpha, origin, marks["face"])
            gesture = screened_region(alpha, origin, marks.get("gesture"))
            if not face or ("gesture" in marks and not gesture):
                raise ValueError(f"{pose} has an empty head or gesture probe")
            seat = {"supporter": supporter, "pose": pose, "column": COLUMNS.index(pose),
                    "plankId": plank_id, "slot": point(anchor), **point(anchor), "knee": point(knee),
                    "origin": point(origin), "neutral": supporter == "pie"}
            prepared.append((max(y for _, y in alpha), seat, person, origin, alpha, face | gesture))

    if len(slots) != 9 or len({(s["slot"]["x"], s["slot"]["y"]) for s in slots}) != 9:
        raise ValueError(f"{stand} needs nine unique planned places")
    if sorted(p[1]["supporter"] for p in prepared) != sorted(CAST):
        raise ValueError(f"{stand} must show the horn, clapper and pie supporter once each")

    # Vacancies also need an entire pose that fits their plank and bay mask.
    for anchor, footprint in vacancies:
        for supporter in CAST:
            pose = f"{stand}-{supporter}"
            try:
                origin, _ = place(tiles[supporter], pose, anchor, direction, landmarks[pose], footprint)
                checked_pixels(tiles[supporter], origin, mask, bay, pose)
            except ValueError:
                continue
            break
        else:
            raise ValueError(f"{stand} has an unsupported vacant seat at {anchor}")

    # Composite only after every full silhouette has passed the mask check.
    crowd = Image.new("RGBA", size)
    protected, occupied, rail_protected = set(), set(), set()
    seats = []
    prepared.sort(key=lambda entry: entry[0])
    for _, seat, person, origin, visible, features in prepared:
        if visible & protected:
            raise ValueError(f"{seat['pose']} obscures a face or gesture")
        crowd.alpha_composite(person, origin)
        occupied.update(visible)
        protected.update(features)
        rail_protected.update(visible if facing == "back" else (p for p in visible if p[1] <= seat["y"]))
        seats.append(seat)

    rail = handrail(size, layout["rail"])
    rail_pixels = checked_pixels(rail, (0, 0), mask, bay, f"{stand} rail")
    covered = rail_pixels & occupied
    if covered & (protected | rail_protected):
        raise ValueError(f"{stand} rail overlaps a protected part of the crowd")
    return crowd, rail, {"id": stand, "label": layout["label"], "bayId": bay_id,
                         "facing": facing, "capacity": len(slots), "slots": slots, "seats": seats,
                         "railOverlapPixels": len(covered)}


def build():
    mask, bays, supports = geometry()
    layout = read(HERE / "layout.json")
    landmarks = read(HERE / "pose-landmarks.json")
    palette = {r["id"]: r["colors"] for r in read(ART.parents[2] / "team-colors/v1/delivery/manifest.json")["ramps"]}
    with Image.open(HERE / "supporters.png") as atlas:
        if atlas.mode != "P" or atlas.size != (len(COLUMNS) * CELL_SIZE, CELL_SIZE):
            raise ValueError("The end-stand sheet must have six indexed 48-pixel cells")
        if set(landmarks) != set(COLUMNS):
            raise ValueError("Every end-stand pose needs its own landmarks")
        views = [build_angle(stand, layout[stand], atlas, palette, landmarks, mask, bays[bay_id], supports[bay_id])
                 for stand, (bay_id, _, _) in ANGLES.items()]
    for crowd, rail, record in views:
        for suffix, layer in (("", crowd), ("-rail", rail)):
            path = HERE / f"{record['id']}{suffix}.png"
            layer.save(path, optimize=True)
            fit.check_insert(mask, bays[record["bayId"]], path)
    (HERE / "placements.json").write_text(json.dumps([record for _, _, record in views], indent=2) + "\n",
                                           encoding="utf-8")


if __name__ == "__main__":
    build()
