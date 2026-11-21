from collections import Counter
from copy import deepcopy
import unittest

from PIL import Image

import build


def coordinates(point):
    return point["x"], point["y"]


class EndStandTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mask, cls.bays, cls.supports = build.geometry()
        cls.layout = build.read(build.HERE / "layout.json")
        cls.manifest = build.read(build.HERE / "placements.json")
        cls.landmarks = build.read(build.HERE / "pose-landmarks.json")
        cls.palette = {r["id"]: r["colors"] for r in build.read(
            build.ART.parents[2] / "team-colors/v1/delivery/manifest.json")["ramps"]}
        with Image.open(build.HERE / "supporters.png") as atlas:
            cls.atlas = atlas.copy()

    def render(self, stand, layout, atlas):
        bay_id = build.ANGLES[stand][0]
        return build.build_angle(stand, layout, atlas, self.palette, self.landmarks,
                                 self.mask, self.bays[bay_id], self.supports[bay_id])

    def test_only_team_fabric_changes_under_extreme_kits(self):
        hands_and_props = {
            "north-horn": [(33, 19), (33, 23)], "north-clap": [(27, 25), (22, 27)],
            "north-pie": [(22, 26)], "south-horn": [(14, 18), (14, 23)],
            "south-clap": [(30, 23), (29, 24)], "south-pie": [],
        }
        contrasting = {"teal": ["#ffff00"] * 16, "violet": ["#ff00ff"] * 16}
        identical = {"teal": ["#ffffff"] * 16, "violet": ["#ffffff"] * 16}
        for column, pose in enumerate(build.COLUMNS):
            with self.subTest(pose=pose):
                x = column * build.CELL_SIZE
                cell = self.atlas.crop((x, 0, x + build.CELL_SIZE, build.CELL_SIZE))
                indices = set(cell.tobytes())
                team = not pose.endswith("-pie")
                self.assertEqual(bool(indices.intersection(range(1, 17))), team)
                self.assertEqual(bool(indices.intersection(range(17, 33))), team)
                for area in (self.landmarks[pose]["face"], (0, 38, 48, 48)):
                    self.assertFalse(set(cell.crop(area).tobytes()).intersection(range(1, 33)))
                for sample in hands_and_props[pose]:
                    self.assertGreater(cell.getpixel(sample), 32)
                original = build.spectator(self.atlas, pose, self.palette)
                for palette in (contrasting, identical):
                    painted = build.spectator(self.atlas, pose, palette)
                    self.assertEqual(original.getchannel("A").tobytes(), painted.getchannel("A").tobytes())
                    for index, before, after in zip(cell.tobytes(), original.get_flattened_data(),
                                                    painted.get_flattened_data(), strict=True):
                        if index == 0 or index > 32:
                            self.assertEqual(before, after)
                        else:
                            ramp = palette["teal" if index <= 16 else "violet"]
                            self.assertEqual(after[:3], tuple(bytes.fromhex(ramp[(index - 1) % 16][1:])))

    def test_both_angles_share_three_supporters_in_nine_native_places(self):
        self.assertEqual(["north", "south"], [view["id"] for view in self.manifest])
        expected = {"north": (1, "front", {12: 5, 13: 4}, {12: 2, 13: 1}),
                    "south": (12, "back", {122: 3, 123: 3, 124: 3}, {122: 1, 123: 1, 124: 1})}
        for view in self.manifest:
            with self.subTest(stand=view["id"]):
                bay_id, facing, slots, seats = expected[view["id"]]
                self.assertEqual((bay_id, facing, 9), (view["bayId"], view["facing"], view["capacity"]))
                self.assertEqual(Counter(slots), Counter(slot["plankId"] for slot in view["slots"]))
                self.assertEqual(Counter(seats), Counter(seat["plankId"] for seat in view["seats"]))
                self.assertCountEqual(("horn", "clap", "pie"), [s["supporter"] for s in view["seats"]])
                self.assertEqual(["pie"], [s["supporter"] for s in view["seats"] if s["neutral"]])
                self.assertEqual(3, len({s["x"] for s in view["seats"]}))
                planks = dict(self.supports[bay_id].values())
                positions = {(slot["plankId"], coordinates(slot["slot"])) for slot in view["slots"]}
                self.assertEqual(9, len(positions))
                for plank_id, contact in positions:
                    self.assertGreater(planks[plank_id].getpixel(contact), 0)
                direction = 1 if facing == "front" else -1
                for seat in view["seats"]:
                    self.assertIn((seat["plankId"], coordinates(seat)), positions)
                    self.assertEqual(f"{view['id']}-{seat['supporter']}", build.COLUMNS[seat["column"]])
                    self.assertGreater(direction * (seat["knee"]["y"] - seat["y"]), 0)
                    local_x, local_y = self.landmarks[seat["pose"]]["contact"]
                    origin_x, origin_y = coordinates(seat["origin"])
                    self.assertEqual((origin_x + local_x, origin_y + local_y), coordinates(seat))

    def test_pngs_preserve_raw_fit_and_only_occlude_rear_calves(self):
        for view in self.manifest:
            stand = view["id"]
            with self.subTest(stand=stand):
                crowd, rail, generated = self.render(stand, self.layout[stand], self.atlas)
                self.assertEqual(view, generated)
                bay = self.bays[view["bayId"]]
                for suffix, layer in (("", crowd), ("-rail", rail)):
                    path = build.HERE / f"{stand}{suffix}.png"
                    build.fit.check_insert(self.mask, bay, path)
                    with Image.open(path) as png:
                        self.assertEqual(layer.tobytes(), png.convert("RGBA").tobytes())
                self.assertEqual(stand == "south", view["railOverlapPixels"] > 0)
                for seat in view["seats"]:
                    with self.subTest(pose=seat["pose"]):
                        self.check_source(seat, bay, stand, crowd, rail)

    def check_source(self, seat, bay, stand, crowd, rail):
        cell = build.spectator(self.atlas, seat["pose"], self.palette)
        ox, oy = coordinates(seat["origin"])
        marks = self.landmarks[seat["pose"]]
        hidden = 0
        for y in range(cell.height):
            for x in range(cell.width):
                original = cell.getpixel((x, y))
                if not original[3]:
                    continue
                screen = ox + x, oy + y
                self.assertEqual(bay["id"], self.mask.getpixel((bay["x"] + screen[0], bay["y"] + screen[1])))
                if crowd.getpixel(screen) != original:
                    hidden += 1
                    self.assertGreater(y, marks["contact"][1])
                if rail.getpixel(screen)[3]:
                    self.assertGreater(y, marks["contact"][1])
                for probe in (marks["face"], marks.get("gesture")):
                    if probe and probe[0] <= x < probe[2] and probe[1] <= y < probe[3]:
                        self.assertEqual(original, crowd.getpixel(screen))
                        self.assertEqual(0, rail.getpixel(screen)[3])
        self.assertEqual(seat["behindSeatPixels"], hidden)
        self.assertEqual(stand == "south", hidden > 0)

    def test_untrimmed_pose_crossing_mask_is_rejected(self):
        damaged = self.atlas.copy()
        damaged.putpixel((0, 0), 1)
        with self.assertRaisesRegex(ValueError, "north-horn crosses bay 1"):
            self.render("north", self.layout["north"], damaged)

    def test_empty_place_on_unusable_board_is_rejected(self):
        layout = deepcopy(self.layout["north"])
        layout["rows"][0]["anchors"][1] = [58, 7]
        with self.assertRaisesRegex(ValueError, "unsupported vacant seat"):
            self.render("north", layout, self.atlas)

    def test_bench_face_cannot_erase_the_seat_contact(self):
        layout = deepcopy(self.layout["south"])
        layout["rows"][0]["boardFace"] = [31, 24, 149, 31]
        with self.assertRaisesRegex(ValueError, "south-pie .*only below the hip"):
            self.render("south", layout, self.atlas)

    def test_rear_halfling_has_no_detached_heel_pixels(self):
        crowd, _, manifest = self.render("south", self.layout["south"], self.atlas)
        seat = next(seat for seat in manifest["seats"] if seat["supporter"] == "pie")
        source = build.spectator(self.atlas, seat["pose"], self.palette)
        left, _, right, bottom = source.getbbox()
        ox, oy = coordinates(seat["origin"])
        self.assertTrue(source.crop((left, bottom - 2, right, bottom)).getbbox())
        heel_area = crowd.crop((ox + left, oy + bottom - 2, ox + right, oy + bottom))
        self.assertIsNone(heel_area.getbbox())


if __name__ == "__main__":
    unittest.main()
