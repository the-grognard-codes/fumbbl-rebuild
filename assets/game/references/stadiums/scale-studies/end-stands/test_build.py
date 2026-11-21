from collections import Counter
from copy import deepcopy
from hashlib import sha256
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
        cls.pose_layout = build.read(build.HERE / "pose-layout.json")
        cls.proofs = build.read(build.HERE / "pose-placements.json")
        cls.landmarks = build.read(build.HERE / "pose-landmarks.json")
        cls.palette = {r["id"]: r["colors"] for r in build.read(
            build.ART.parents[2] / "team-colors/v1/delivery/manifest.json")["ramps"]}
        with Image.open(build.HERE / "supporters.png") as atlas:
            cls.atlas = atlas.copy()

    def render(self, stand, layout, atlas, cast=build.CAST):
        bay_id = build.ANGLES[stand][0]
        return build.build_angle(stand, layout, atlas, self.palette, self.landmarks,
                                 self.mask, self.bays[bay_id], self.supports[bay_id], cast)

    def proof_layout(self, group, stand):
        layout = self.layout[stand].copy()
        if group != "approved":
            layout["rows"] = self.pose_layout[group][stand]
        return layout

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
                team = pose.split("-", 1)[1] not in build.NEUTRAL
                self.assertEqual(bool(indices.intersection(range(1, 17))), team)
                if pose != "south-program":  # The elf's coat covers the second fabric from behind.
                    self.assertEqual(bool(indices.intersection(range(17, 33))), team)
                marks = self.landmarks[pose]
                protected = [marks["face"]]
                if "otherSole" in marks or pose.startswith("north-"):
                    bottom = cell.getbbox()[3]
                    for foot_x in range(cell.width):
                        if cell.getpixel((foot_x, bottom - 1)):
                            protected.append((foot_x, bottom - 4, foot_x + 1, bottom))
                for area in protected:
                    self.assertFalse(set(cell.crop(area).tobytes()).intersection(range(1, 33)))
                for sample in (*hands_and_props.get(pose, []), *marks.get("fixedSamples", [])):
                    self.assertGreater(cell.getpixel(tuple(sample)), 32)
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
        for group in self.proofs:
            group_id = group["id"]
            _, cast = build.GROUPS[group_id]
            for view in group["views"]:
                stand = view["id"]
                with self.subTest(group=group_id, stand=stand):
                    crowd, rail, generated = self.render(stand, self.proof_layout(group_id, stand), self.atlas, cast)
                    recorded = {k: v for k, v in view.items() if k not in {"crowd", "rail"}}
                    recorded["seats"] = [{k: v for k, v in seat.items() if k != "stance"} for seat in view["seats"]]
                    self.assertEqual(recorded, generated)
                    if group_id == "approved":
                        self.assertIn(generated, self.manifest)
                    bay = self.bays[view["bayId"]]
                    for filename, layer in ((view["crowd"], crowd), (view["rail"], rail)):
                        path = build.HERE / filename
                        build.fit.check_insert(self.mask, bay, path)
                        with Image.open(path) as png:
                            self.assertEqual(layer.tobytes(), png.convert("RGBA").tobytes())
                    self.assertEqual(0, view["railOverlapPixels"])
                    with_rail = Image.alpha_composite(crowd, rail)
                    for seat in view["seats"]:
                        self.check_source(seat, bay, crowd, with_rail)

    def test_proof_groups_cover_each_pose_once(self):
        self.assertEqual(["approved", "seated-a", "seated-b", "standing"], [group["id"] for group in self.proofs])
        self.assertEqual((1152, 48), self.atlas.size)
        seen = []
        for group in self.proofs:
            self.assertEqual(["north", "south"], [view["id"] for view in group["views"]])
            north, south = group["views"]
            self.assertCountEqual([seat["supporter"] for seat in north["seats"]],
                                  [seat["supporter"] for seat in south["seats"]])
            for view in (north, south):
                self.assertEqual(9, view["capacity"])
                self.assertEqual(3, len(view["seats"]))
                for seat in view["seats"]:
                    self.assertEqual(seat["pose"], build.COLUMNS[seat["column"]])
                    self.assertEqual(seat["supporter"] in build.NEUTRAL, seat["neutral"])
                    self.assertEqual("standing" if seat["supporter"].startswith("standing-") else "seated",
                                     seat["stance"])
                    seen.append(seat["pose"])
        self.assertCountEqual(build.COLUMNS, seen)

    def test_approved_proofs_preserve_the_reviewed_pixels(self):
        approved = {
            "north.png": "56e1593e26ee69b3dfe24ab0bed0c61f63eeb0911dccabba8c59f503d48d66d8",
            "south.png": "cbb339a4320ddd111d4f53bbd51dd3061deeca7a85863a5504bd97c969ad5e26",
            "north-rail.png": "98f58f7291fecbfae1a238a37235718d5b67bdcf978c77f2f30fa7195924b19a",
            "south-rail.png": "4c4c611e0d3c10f1b1db70e72d5325b832a52ffc1b6a07869ea3a57a7aa1f046",
        }
        for filename, checksum in approved.items():
            with self.subTest(filename=filename), Image.open(build.HERE / filename) as layer:
                self.assertEqual(checksum, sha256(layer.convert("RGBA").tobytes()).hexdigest())

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
        for group in self.proofs:
            view = next(view for view in group["views"] if view["id"] == "south")
            planks = dict(self.supports[view["bayId"]].values())
            for seat in view["seats"]:
                if seat["stance"] == "seated":
                    with self.subTest(pose=seat["pose"]):
                        self.check_rear_seat(seat, planks[seat["plankId"]])

    def check_rear_seat(self, seat, plank):
        source = build.spectator(self.atlas, seat["pose"], self.palette).getchannel("A")
        hip_x, hip_y = self.landmarks[seat["pose"]]["contact"]
        edge_y = self.landmarks[seat["pose"]]["seatEdgeY"]
        self.assertEqual(edge_y + 1, source.getbbox()[3])
        self.assertLessEqual(edge_y - hip_y, 3)
        self.assertGreater(edge_y, hip_y)
        origin_x, origin_y = coordinates(seat["origin"])
        self.assertGreater(source.getpixel((hip_x, hip_y)), 0)
        for row in range(hip_y, edge_y + 1):
            span = [x for x in range(source.width) if source.getpixel((x, row))]
            self.assertGreaterEqual(len(span), 3)
            self.assertEqual(list(range(span[0], span[-1] + 1)), span)
            for x in span:
                self.assertGreater(plank.getpixel((origin_x + x, origin_y + row)), 0)

    def test_both_standing_soles_touch_timber(self):
        group = next(group for group in self.proofs if group["id"] == "standing")
        for view in group["views"]:
            planks = dict(self.supports[view["bayId"]].values())
            standing = [seat for seat in view["seats"] if seat["stance"] == "standing"]
            self.assertEqual(2, len(standing))
            for seat in standing:
                with self.subTest(pose=seat["pose"]):
                    plank = planks[seat["plankId"]]
                    marks = self.landmarks[seat["pose"]]
                    sprite = build.spectator(self.atlas, seat["pose"], self.palette)
                    left, right = (coordinates(foot) for foot in seat["feet"])
                    self.assertNotIn("knee", seat)
                    self.assertEqual(coordinates(seat), left)
                    self.assertNotEqual(left[0], right[0])
                    self.assertEqual(left[1], right[1])
                    ox, oy = coordinates(seat["origin"])
                    for screen, local in ((left, marks["contact"]), (right, marks["otherSole"])):
                        self.assertEqual((screen[0] - ox, screen[1] - oy), tuple(local))
                        self.assertEqual(sprite.getbbox()[3] - 1, local[1])
                        self.assertGreater(sprite.getpixel(tuple(local))[3], 0)
                        self.assertGreater(plank.getpixel(screen), 0)
                    broken = plank.copy()
                    broken.putpixel(right, 0)
                    with self.assertRaisesRegex(ValueError, "sole off its plank"):
                        build.place(sprite, seat["pose"], left, 1, marks, broken)

    def test_rear_feet_and_split_contours_are_rejected(self):
        for group, (_, cast) in build.GROUPS.items():
            for supporter in cast:
                pose = f"south-{supporter}"
                marks = self.landmarks[pose]
                if "seatEdgeY" not in marks:
                    continue
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
                            self.render("south", self.proof_layout(group, "south"), damaged, cast)


if __name__ == "__main__":
    unittest.main()
