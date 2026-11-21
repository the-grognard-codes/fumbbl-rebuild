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
                protected = [self.landmarks[pose]["face"]]
                if pose.startswith("north-"):
                    protected.append((0, 38, 48, 48))  # Front-view calves and footwear.
                for area in protected:
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

    def test_pngs_preserve_native_silhouettes_and_mask_fit(self):
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
                self.assertEqual(0, view["railOverlapPixels"])
                with_rail = Image.alpha_composite(crowd, rail)
                for seat in view["seats"]:
                    with self.subTest(pose=seat["pose"]):
                        self.check_source(seat, bay, crowd, with_rail)

    def check_source(self, seat, bay, crowd, with_rail):
        cell = build.spectator(self.atlas, seat["pose"], self.palette)
        ox, oy = coordinates(seat["origin"])
        for y in range(cell.height):
            for x in range(cell.width):
                original = cell.getpixel((x, y))
                if not original[3]:
                    continue
                screen = ox + x, oy + y
                self.assertEqual(bay["id"], self.mask.getpixel((bay["x"] + screen[0], bay["y"] + screen[1])))
                self.assertEqual(original, crowd.getpixel(screen))
                self.assertEqual(original, with_rail.getpixel(screen))

    def test_untrimmed_pose_crossing_mask_is_rejected(self):
        for stand, pose, bay_id in (("north", "north-horn", 1), ("south", "south-pie", 12)):
            with self.subTest(stand=stand):
                damaged = self.atlas.copy()
                damaged.putpixel((build.COLUMNS.index(pose) * build.CELL_SIZE, 0), 1)
                with self.assertRaisesRegex(ValueError, f"{pose} crosses bay {bay_id}"):
                    self.render(stand, self.layout[stand], damaged)

    def test_empty_place_on_unusable_board_is_rejected(self):
        layout = deepcopy(self.layout["north"])
        layout["rows"][0]["anchors"][1] = [58, 7]
        with self.assertRaisesRegex(ValueError, "unsupported vacant seat"):
            self.render("north", layout, self.atlas)

    def test_rear_silhouettes_have_one_continuous_seated_edge_on_timber(self):
        view = next(view for view in self.manifest if view["id"] == "south")
        planks = dict(self.supports[view["bayId"]].values())
        for seat in view["seats"]:
            with self.subTest(pose=seat["pose"]):
                source = build.spectator(self.atlas, seat["pose"], self.palette).getchannel("A")
                hip_x, hip_y = self.landmarks[seat["pose"]]["contact"]
                edge_y = self.landmarks[seat["pose"]]["seatEdgeY"]
                self.assertEqual(edge_y + 1, source.getbbox()[3])
                self.assertLessEqual(edge_y - hip_y, 3)
                self.assertGreater(edge_y, hip_y)
                origin_x, origin_y = coordinates(seat["origin"])
                plank = planks[seat["plankId"]]
                self.assertGreater(source.getpixel((hip_x, hip_y)), 0)
                for row in range(hip_y, edge_y + 1):
                    span = [x for x in range(source.width) if source.getpixel((x, row))]
                    self.assertGreaterEqual(len(span), 3)
                    self.assertEqual(list(range(span[0], span[-1] + 1)), span)
                    for x in span:
                        self.assertGreater(plank.getpixel((origin_x + x, origin_y + row)), 0)

    def test_rear_feet_and_split_contours_are_rejected(self):
        for pose in (pose for pose in build.COLUMNS if pose.startswith("south-")):
            marks = self.landmarks[pose]
            edge_y = marks["seatEdgeY"]
            source = build.spectator(self.atlas, pose, self.palette).getchannel("A")
            edge = [x for x in range(source.width) if source.getpixel((x, edge_y))]
            x = build.COLUMNS.index(pose) * build.CELL_SIZE + edge[len(edge) // 2]
            for pixel_y, value, reason in ((edge_y + 1, 33, "must end at its seated edge"),
                                           (edge_y, 0, "split rear seat contour")):
                with self.subTest(pose=pose, reason=reason):
                    damaged = self.atlas.copy()
                    damaged.putpixel((x, pixel_y), value)
                    with self.assertRaisesRegex(ValueError, f"{pose} .*{reason}"):
                        self.render("south", self.layout["south"], damaged)


if __name__ == "__main__":
    unittest.main()
