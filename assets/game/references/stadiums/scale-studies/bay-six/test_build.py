"""A pixel hidden by a nearer supporter must still fit the seating mask."""
import json
import unittest

from PIL import Image

import build


class OverlappingSupportersTest(unittest.TestCase):
    def test_hidden_pixel_still_belongs_to_its_bay(self):
        manifest = json.loads((build.ART / "empty-seating.json").read_text())
        bay = next(b for b in manifest["bays"] if b["id"] == build.BAY_ID)
        ramps = json.loads((build.ART.parents[2] / "team-colors/v1/delivery/manifest.json").read_text())
        palette = {r["id"]: r["colors"] for r in ramps["ramps"]}
        with Image.open(build.ART / "empty-seating.png") as mask, Image.open(build.HERE / "supporters.png") as atlas:
            _, _, study = build.build_study(mask, bay, atlas, palette, 2, build.STUDIES[2])
            silhouettes = []
            for seat in study["seats"]:
                col = build.COLUMNS.index(seat["pose"])
                cell = build.CELL_SIZE
                alpha = atlas.crop((col * cell, 2 * cell, (col + 1) * cell, 3 * cell)).convert("RGBA").getchannel("A")
                left = bay["x"] + seat["x"] - cell // 2
                top = bay["y"] + seat["y"] + 1 - alpha.getbbox()[3]
                silhouettes.append({(left + x, top + y) for y in range(cell) for x in range(cell)
                                    if alpha.getpixel((x, y))})

            shared = silhouettes[0] & silhouettes[1]
            self.assertTrue(shared, "The close row needs an actual occlusion for this check")
            point = min(shared)
            mask.putpixel(point, 0)
            with self.assertRaises(ValueError) as rejected:
                build.build_study(mask, bay, atlas, palette, 2, build.STUDIES[2])
            self.assertIn(study["seats"][0]["pose"] + " crosses the bay", str(rejected.exception))
            self.assertIn(str(point), str(rejected.exception))


if __name__ == "__main__":
    unittest.main()
