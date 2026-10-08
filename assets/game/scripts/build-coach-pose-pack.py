"""Promote PowerShell-exported pose bodies and dedicated portraits into a pack.

Requires Pillow. Body scaling is performed only by export-sprites.ps1; this
script copies those results and scales the separately generated portraits.
"""

import json
import hashlib
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

POSES = ("front", "back", "front45", "back45", "side", "prone", "stunned")
ROLES = {
    "human": ("lineman", "blitzer", "catcher", "thrower", "ogre", "halfling"),
    "orc": ("orc-lineman", "orc-blitzer", "big-un-blocker", "orc-thrower", "troll", "goblin-lineman"),
}
SIZE = {"ogre": "big", "troll": "big", "halfling": "small", "goblin-lineman": "small"}


def visible_bounds(image):
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 32 else 0)
    box = alpha.getbbox()
    if box is None:
        raise ValueError("Empty visible art")
    x0, y0, x1, y1 = box
    return {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}


def portrait(source, target):
    with Image.open(source) as original:
        original = original.convert("RGBA")
        box = original.getchannel("A").point(lambda value: 255 if value >= 32 else 0).getbbox()
        if box is None:
            raise ValueError(f"Empty portrait: {source}")
        crop = original.crop(box)
        scale = min(152 / crop.width, 152 / crop.height)
        resized = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.Resampling.NEAREST)
        canvas = Image.new("RGBA", (160, 160))
        canvas.alpha_composite(resized, ((160 - resized.width) // 2, (160 - resized.height) // 2))
        canvas.save(target)
        return canvas


def make_preview(pack, roles, zoom):
    columns, cell, rows = 6, 168 * zoom, 1
    sheet = Image.new("RGBA", (columns * cell, rows * cell), (23, 30, 40, 255))
    draw = ImageDraw.Draw(sheet)
    for index, role in enumerate(roles):
        with Image.open(pack / "master" / f"{role}-portrait.png") as image:
            image = image.convert("RGBA").resize((160 * zoom, 160 * zoom), Image.Resampling.NEAREST)
            x = index * cell + 4 * zoom
            draw.rectangle((x, 0, x + 160 * zoom, 160 * zoom), fill=(74, 89, 35, 255))
            sheet.alpha_composite(image, (x, 0))
    sheet.save(pack / "qa" / f"portrait-preview-{zoom}x.png")


def build(root, team):
    roles = ROLES[team]
    pack = root / "teams" / team / "poses" / "coach-oriented-v1"
    existing = pack / "catalog.json"
    if existing.exists() and json.loads(existing.read_text(encoding="utf-8")).get("anchorVersion") == 2:
        raise ValueError("Reviewed body anchors are already promoted; build and review a new pack instead of overwriting them")
    exported = pack / "source" / "export-v2"
    manifest = json.loads((exported / "manifest.json").read_text(encoding="utf-8-sig"))
    entries = {entry["id"]: entry for entry in manifest["players"]}
    if set(entries) != {f"{role}-{pose}" for role in roles for pose in POSES}:
        raise ValueError(f"Incomplete exporter inventory: {team}")
    (pack / "master").mkdir(parents=True, exist_ok=True)
    (pack / "qa").mkdir(parents=True, exist_ok=True)
    catalog = {"version": "coach-oriented-v1", "rosterId": team, "positions": {}}
    sources = {"tool": "built-in image_gen", "standardVersion": "1.1", "selectedSheets": {}}
    for role in roles:
        sheet = pack / "source" / "sheets" / f"{role}.png"
        sources["selectedSheets"][role] = {"file": f"sheets/{role}.png", "sha256": hashlib.sha256(sheet.read_bytes()).hexdigest()}
        position = {"sizeClass": SIZE.get(role, "standard"), "poses": {}}
        for pose in POSES:
            id = f"{role}-{pose}"
            source = exported / "sprites" / f"{id}.png"
            target = pack / "master" / f"{id}.png"
            shutil.copy2(source, target)
            with Image.open(target) as image:
                image = image.convert("RGBA")
                expected = 80 if position["sizeClass"] == "big" else 64
                if image.size != (expected, expected):
                    raise ValueError(f"Wrong canvas: {target}")
                bounds = visible_bounds(image)
                if bounds["x"] < 1 or bounds["y"] < 1 or bounds["x"] + bounds["width"] >= expected or bounds["y"] + bounds["height"] >= expected:
                    raise ValueError(f"Clipped art: {target}")
                limit = {"standard": 60, "small": 46, "big": 76}[position["sizeClass"]]
                if bounds["width"] > limit or bounds["height"] > limit:
                    raise ValueError(f"Oversize art: {target}")
                position["poses"][pose] = {
                    "file": f"master/{id}.png", "width": expected, "height": expected,
                    "bounds": bounds,
                    "footAnchor": {"x": expected // 2, "y": bounds["y"] + bounds["height"]},
                    "groundAnchor": {"x": bounds["x"] + bounds["width"] / 2, "y": bounds["y"] + bounds["height"] / 2},
                }
        source = pack / "source" / "isolated" / f"{role}-portrait.png"
        if not source.exists():
            source = pack / "source" / "cropped" / f"{role}-portrait.png"
        target = pack / "master" / f"{role}-portrait.png"
        image = portrait(source, target)
        position["portrait"] = {"file": f"master/{role}-portrait.png", "width": 160, "height": 160, "bounds": visible_bounds(image)}
        catalog["positions"][role] = position
    (pack / "catalog.json").write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    (pack / "source" / "sources.json").write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
    for zoom in (1, 3):
        shutil.copy2(exported / f"preview-{zoom}x.png", pack / "qa" / f"body-preview-{zoom}x.png")
        make_preview(pack, roles, zoom)
    print(f"Built {team}: {len(roles) * len(POSES)} bodies, {len(roles)} portraits")


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent
    for team in sys.argv[1:] or ROLES:
        build(root, team)
