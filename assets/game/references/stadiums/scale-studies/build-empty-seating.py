"""Build the Gatehouse seating mask and its native insert dimensions."""

import argparse
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent
MASK_PATH = ROOT / "empty-seating.png"
MANIFEST_PATH = ROOT / "empty-seating.json"
STADIUM_PATH = ROOT / "empty-gatehouse.webp"
BENCH_PATH = ROOT / "gatehouse-benches.json"
NATIVE_SIZE = (790, 1188)

# Outlines traced in the 1024 by 1536 design frame. Each value identifies one bay.
NORTH = [
    [(76,36),(235,36),(235,128),(43,128),(43,102),(60,92),(60,65),(73,58)],
    [(316,36),(705,36),(705,128),(316,128)],
    [(787,36),(946,36),(951,67),(962,70),(965,94),(979,105),(979,128),(787,128)],
]
WEST = [
    [(27,170),(112,209),(112,489),(27,489)],
    [(28,562),(112,562),(112,684),(66,684),(58,667),(42,656),(28,659)],
    [(28,762),(112,762),(112,856),(28,856)],
    [(28,930),(112,930),(112,1297),(79,1332),(28,1347)],
]
EAST = [[(1023-x,y) for x,y in polygon] for polygon in WEST]
SOUTH = [
    [(92,1384),(232,1384),(232,1500),(60,1500),(55,1482),(36,1470),(36,1461),(60,1420)],
    [(316,1384),(416,1384),(416,1500),(316,1500)],
    [(602,1384),(706,1384),(706,1500),(602,1500)],
    [(794,1384),(932,1384),(965,1420),(987,1461),(982,1472),(958,1486),(956,1500),(794,1500)],
]


STANDS = (("north", NORTH), ("west", WEST), ("east", EAST), ("south", SOUTH))


def native(points):
    width, height = NATIVE_SIZE
    return [(round(x * width / 1024), round(y * height / 1536)) for x, y in points]


def build_mask():
    mask = Image.new("L", NATIVE_SIZE)
    draw = ImageDraw.Draw(mask)
    polygons = (polygon for _, outlines in STANDS for polygon in outlines)
    for bay_id, polygon in enumerate(polygons, 1):
        draw.polygon(native(polygon), fill=bay_id)
    # North braziers project in front of the first row.
    for x in (380, 645):
        brazier = [(x-15,132),(x-15,114),(x-6,106),(x,89),(x+8,105),(x+14,112),(x+15,132)]
        draw.polygon(native(brazier), fill=0)
    return mask


def seating_manifest(mask):
    pixel_counts = mask.histogram()
    bays = []
    stands = (stand for stand, outlines in STANDS for _ in outlines)
    for bay_id, stand in enumerate(stands, 1):
        bay_mask = mask.point(lambda value: 255 if value == bay_id else 0)
        left, top, right, bottom = bay_mask.getbbox()
        bays.append({
            "id": bay_id,
            "stand": stand,
            "x": left,
            "y": top,
            "width": right - left,
            "height": bottom - top,
            "pixelCount": pixel_counts[bay_id],
        })
    return {
        "stadiumArtwork": STADIUM_PATH.name,
        "seatingMask": MASK_PATH.name,
        "nativeCanvas": {"x": 0, "y": 0, "width": mask.width, "height": mask.height},
        "offLimitsMaskValue": 0,
        "insertCanvas": "bay-bounds",
        "bays": bays,
    }


def check_seating(expected_mask):
    with Image.open(MASK_PATH) as saved_mask:
        if (saved_mask.mode != "L" or saved_mask.size != NATIVE_SIZE
                or saved_mask.tobytes() != expected_mask.tobytes()):
            raise ValueError(f"{MASK_PATH.name} differs from the compiled seating outlines.")
        manifest = seating_manifest(saved_mask)
        if json.loads(MANIFEST_PATH.read_text(encoding="utf-8")) != manifest:
            raise ValueError(f"{MANIFEST_PATH.name} differs from the saved seating mask.")
    with Image.open(STADIUM_PATH) as stadium:
        if stadium.size != NATIVE_SIZE:
            raise ValueError(f"{STADIUM_PATH.name} must use the {NATIVE_SIZE} native canvas.")
    return manifest


def bench_guide(mask, manifest):
    """Compile the shared bay-local plank rectangles into native plank IDs."""
    layout = json.loads(BENCH_PATH.read_text(encoding="utf-8"))["bays"]
    bays = {bay["id"]: bay for bay in manifest["bays"]}
    if sorted(entry["id"] for entry in layout) != sorted(bays):
        raise ValueError("The bench template must cover every seating bay exactly once.")
    guide = Image.new("L", mask.size)
    supports = {}
    for entry in layout:
        bay = bays[entry["id"]]
        x, y, w, h = (bay[k] for k in ("x", "y", "width", "height"))
        area = mask.crop((x, y, x + w, y + h)).point(lambda v: 255 if v == bay["id"] else 0)
        local = Image.new("L", (w, h))
        supports[bay["id"]] = {}
        for number, plank in enumerate(entry["planks"], 1):
            pid, name = plank["id"], plank["name"]
            if (pid != bay["id"] * 10 + number or number > 9 or pid > 255
                    or name in supports[bay["id"]]):
                raise ValueError(f"Invalid or duplicate plank {pid} ({name}) in bay {bay['id']}.")
            footprint = Image.new("L", (w, h))
            for left, top, width, height in plank["rects"]:
                if not (width > 0 and height > 0 and 0 <= left <= w - width and 0 <= top <= h - height):
                    raise ValueError(f"Plank {pid} has a rectangle outside its bay canvas.")
                footprint.paste(255, (left, top, left + width, top + height))
            footprint = ImageChops.multiply(footprint, area)
            if not footprint.getbbox() or ImageChops.multiply(local, footprint).getbbox():
                raise ValueError(f"Plank {pid} is empty or overlaps another plank.")
            local.paste(pid, mask=footprint)
            supports[bay["id"]][name] = (pid, footprint)
        if not supports[bay["id"]]:
            raise ValueError(f"Bay {bay['id']} has no planks.")
        guide.paste(local, (x, y), area)
    return guide, supports


def check_insert(mask, bay, insert_path, origin=None):
    bay_id = bay["id"]
    with insert_path.open("rb") as source, Image.open(source) as insert:
        if insert.format != "PNG" or getattr(insert, "n_frames", 1) != 1:
            raise ValueError(f"{insert_path} must be a single-frame PNG.")
        # Byte 24 is PNG's IHDR bit depth. Pillow can drop 16-bit alpha values to zero.
        source.seek(24)
        if source.read(1) == b"\x10":
            raise ValueError(f"{insert_path} must use 8 bits per channel or fewer.")
        if origin is None:
            width, height = bay["width"], bay["height"]
            if insert.size != (width, height):
                raise ValueError(f"Bay {bay_id} requires a {width} x {height} px canvas. "
                                 f"{insert_path} is {insert.width} x {insert.height} px.")
            origin = bay["x"], bay["y"]
        insert_width = insert.width
        alpha = insert.convert("RGBA").getchannel("A").tobytes()

    left, top = origin
    mask_ids = mask.load()
    for index, opacity in enumerate(alpha):
        if not opacity:
            continue
        row, column = divmod(index, insert_width)
        x, y = left + column, top + row
        if not (0 <= x < mask.width and 0 <= y < mask.height):
            raise ValueError(f"Bay {bay_id} insert has visible alpha outside the stadium "
                             f"at native ({x}, {y}).")
        mask_id = mask_ids[x, y]
        if mask_id != bay_id:
            raise ValueError(f"Bay {bay_id} insert has visible alpha outside its mask "
                             f"at native ({x}, {y}), where mask ID is {mask_id}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true", help="verify mask and dimensions")
    action.add_argument("--export-bench-mask", type=Path, metavar="PNG",
                        help="export the native plank ID mask from the shared bench template")
    action.add_argument("--check-insert", nargs=2, metavar=("BAY_ID", "PNG"),
                        help="verify an insert's native canvas and visible pixels")
    action.add_argument("--check-placement", nargs=4, metavar=("BAY_ID", "X", "Y", "PNG"),
                        help="verify all visible pixels in a source PNG at a native origin")
    args = parser.parse_args()

    try:
        mask = build_mask()
        if not (args.check or args.check_insert or args.check_placement or args.export_bench_mask):
            mask.save(MASK_PATH, optimize=True)
            manifest = seating_manifest(mask)
            MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            return

        manifest = check_seating(mask)
        if args.check or args.export_bench_mask:
            guide, supports = bench_guide(mask, manifest)
            if args.export_bench_mask:
                guide.save(args.export_bench_mask, format="PNG", optimize=True)
            print(f"Verified {len(supports)} native seating bays and {sum(map(len, supports.values()))} planks.")
            return

        origin = None
        if args.check_placement:
            bay_id_text, x, y, insert_path = args.check_placement
            origin = int(x), int(y)
        else:
            bay_id_text, insert_path = args.check_insert
        bay_id = int(bay_id_text)
        bay = next((bay for bay in manifest["bays"] if bay["id"] == bay_id), None)
        if bay is None:
            raise ValueError(f"Unknown seating bay {bay_id}.")
        check_insert(mask, bay, Path(insert_path), origin)
        print(f"{insert_path} fits seating bay {bay_id}.")
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
