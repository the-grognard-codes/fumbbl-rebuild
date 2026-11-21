"""Build the registered end-stand crowd proofs at native scale."""
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path

from PIL import Image, ImageDraw


HERE = Path(__file__).resolve().parent
ART = HERE.parent
CELL_SIZE = 48
CAST = ("horn", "clap", "pie")
ANGLES = {"north": (1, "front", 1), "south": (12, "back", -1)}
NEUTRAL = {"pie", "mug", "chestnuts"}
PAIRS = ("tambourine", "lookout", "program", "mug", "whistle", "chestnuts", "cheer",
         "standing-tambourine", "standing-horn")
COLUMNS = (tuple(f"{stand}-{supporter}" for stand in ANGLES for supporter in CAST)
           + tuple(f"{stand}-{supporter}" for supporter in PAIRS for stand in ANGLES))
GROUPS = {
    "approved": ("Horn, clap and pie", CAST),
    "seated-a": ("Tambourine, lookout and mug", ("tambourine", "lookout", "mug")),
    "seated-b": ("Program, whistle and chestnuts", ("program", "whistle", "chestnuts")),
    "standing": ("Cheer and standing supporters", ("cheer", "standing-tambourine", "standing-horn")),
}

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
    contact = opaque_landmark(alpha, pose, landmarks["contact"])
    x, y = anchor
    ox, oy = x - contact[0], y - contact[1]
    if pose.split("-", 1)[1].startswith("standing-"):
        other = opaque_landmark(alpha, pose, landmarks["otherSole"])
        feet = standing_feet(alpha, pose, (ox, oy), contact, other, footprint)
        return (ox, oy), {"feet": [point(foot) for foot in feet]}

    knee = opaque_landmark(alpha, pose, landmarks["knee"])
    if not contains(footprint, x, y):
        raise ValueError(f"{pose} hip at {anchor} is off its plank")
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
    return (ox, oy), {"knee": point((knee_x, knee_y))}


def opaque_landmark(alpha, pose, coordinates):
    xy = tuple(coordinates)
    if not contains(alpha, *xy):
        raise ValueError(f"{pose} has an unsupported anatomical landmark at {xy}")
    return xy


def standing_feet(alpha, pose, origin, contact, other, footprint):
    sole_y = alpha.getbbox()[3] - 1
    left, right = sorted((contact[0], other[0]))
    sole_pixels = [x for x in range(alpha.width) if alpha.getpixel((x, sole_y))]
    breaks = [after for before, after in zip(sole_pixels, sole_pixels[1:]) if after > before + 1]
    if contact[1] != sole_y or other[1] != sole_y or len(breaks) != 1 or not left < breaks[0] <= right:
        raise ValueError(f"{pose} must show two separate soles on its lowest row")
    ox, oy = origin
    if any(not contains(footprint, ox + x, oy + sole_y) for x in sole_pixels):
        raise ValueError(f"{pose} has a sole off its plank")
    return (ox + contact[0], oy + sole_y), (ox + other[0], oy + sole_y)


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


def build_angle(stand, layout, atlas, palette, landmarks, mask, bay, supports, cast=CAST):
    bay_id, facing, direction = ANGLES[stand]
    size = bay["width"], bay["height"]
    if bay["id"] != bay_id or bay["stand"] != stand:
        raise ValueError(f"Bay {bay['id']} is not the authored {stand} bay")
    prepared, slots, vacancies = [], [], []
    used_planks = set()
    candidates = tuple(dict.fromkeys((*cast, *CAST)))
    tiles = {supporter: spectator(atlas, f"{stand}-{supporter}", palette) for supporter in candidates}
    for row in layout["rows"]:
        plank_id, footprint = supports[row["plank"]]
        if plank_id in used_planks:
            raise ValueError(f"{stand} must list each plank only once")
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
            origin, attachments = place(person, pose, anchor, direction, marks, footprint)
            alpha = checked_pixels(person, origin, mask, bay, pose)
            face = screened_region(alpha, origin, marks["face"])
            gesture = screened_region(alpha, origin, marks.get("gesture"))
            if not face or ("gesture" in marks and not gesture):
                raise ValueError(f"{pose} has an empty head or gesture probe")
            seat = {"supporter": supporter, "pose": pose, "column": COLUMNS.index(pose),
                    "plankId": plank_id, "slot": point(anchor), **point(anchor), **attachments,
                    "origin": point(origin), "neutral": supporter in NEUTRAL}
            prepared.append((max(y for _, y in alpha), seat, person, origin, alpha, face | gesture))

    if len(slots) != 9 or len({(s["slot"]["x"], s["slot"]["y"]) for s in slots}) != 9:
        raise ValueError(f"{stand} needs nine unique planned places")
    if sorted(p[1]["supporter"] for p in prepared) != sorted(cast):
        raise ValueError(f"{stand} must show each group member once")

    # Vacancies also need an entire pose that fits their plank and bay mask.
    seated = [supporter for supporter in candidates if not supporter.startswith("standing-")]
    for anchor, footprint in vacancies:
        for supporter in seated:
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
        rail_protected.update(visible if facing == "back" or "feet" in seat
                              else (p for p in visible if p[1] <= seat["y"]))
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
    group_rows = read(HERE / "pose-layout.json")
    landmarks = read(HERE / "pose-landmarks.json")
    palette = {r["id"]: r["colors"] for r in read(ART.parents[2] / "team-colors/v1/delivery/manifest.json")["ramps"]}
    rendered = {}
    with Image.open(HERE / "supporters.png") as atlas:
        if atlas.mode != "P" or atlas.size != (len(COLUMNS) * CELL_SIZE, CELL_SIZE):
            raise ValueError(f"The end-stand sheet must have {len(COLUMNS)} indexed 48-pixel cells")
        if set(landmarks) != set(COLUMNS):
            raise ValueError("Every end-stand pose needs its own landmarks")
        for group, (_, cast) in GROUPS.items():
            rendered[group] = []
            for stand, (bay_id, _, _) in ANGLES.items():
                view = layout[stand].copy()
                if group != "approved":
                    view["rows"] = group_rows[group][stand]
                rendered[group].append(build_angle(stand, view, atlas, palette, landmarks, mask,
                                                   bays[bay_id], supports[bay_id], cast))

    groups = []
    for group, views in rendered.items():
        records = []
        for crowd, rail, record in views:
            stand = record["id"]
            crowd_name = f"{stand}.png" if group == "approved" else f"{group}-{stand}.png"
            rail_name = f"{stand}-rail.png"
            bay = bays[record["bayId"]]
            save_layer(mask, bay, crowd, crowd_name)
            if group == "approved":
                save_layer(mask, bay, rail, rail_name)
            seats = [dict(seat, stance="standing" if "feet" in seat else "seated") for seat in record["seats"]]
            records.append(dict(record, seats=seats, crowd=crowd_name, rail=rail_name))
        groups.append({"id": group, "label": GROUPS[group][0], "views": records})

    write_json("placements.json", [record for _, _, record in rendered["approved"]])
    write_json("pose-placements.json", groups)


def save_layer(mask, bay, layer, filename):
    path = HERE / filename
    layer.save(path, optimize=True)
    fit.check_insert(mask, bay, path)


def write_json(filename, records):
    (HERE / filename).write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    build()
