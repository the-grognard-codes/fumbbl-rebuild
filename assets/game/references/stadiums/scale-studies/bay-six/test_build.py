"""Verify bench contact and the untrimmed silhouettes of the bay-six proofs."""
import json
import unittest
from unittest.mock import patch

from PIL import Image

import build


class BaySixPlacementTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        manifest = json.loads((build.ART / "empty-seating.json").read_text())
        cls.bay = next(b for b in manifest["bays"] if b["id"] == build.BAY_ID)
        ramps = json.loads((build.ART.parents[2] / "team-colors/v1/delivery/manifest.json").read_text())
        cls.palette = {r["id"]: r["colors"] for r in ramps["ramps"]}
        cls.landmarks = json.loads((build.HERE / "pose-landmarks.json").read_text())
        cls.mask = Image.open(build.ART / "empty-seating.png")
        cls.addClassCleanup(cls.mask.close)
        cls.atlas = Image.open(build.HERE / "supporters.png")
        cls.addClassCleanup(cls.atlas.close)
        _, supports = build.fit.bench_guide(cls.mask, manifest)
        cls.planks = supports[build.BAY_ID]
        cls.studies = [build.build_study(cls.mask, cls.bay, cls.atlas, cls.palette, cls.landmarks, config, cls.planks)[2]
                       for config in build.STUDIES]

    def cell_alpha(self, pose):
        col = build.COLUMNS.index(pose)
        cell = build.CELL_SIZE
        return self.atlas.crop((col * cell, 0, (col + 1) * cell, cell)).convert("RGBA").getchannel("A")

    def test_cast_has_ten_seated_people_two_standing_poses_and_three_fixed_wardrobes(self):
        seated = {pose.removeprefix("seated-") for pose in build.COLUMNS if pose.startswith("seated-")}
        standing = {pose.removeprefix("standing-") for pose in build.COLUMNS if pose.startswith("standing-")}
        self.assertEqual(len(seated), 10)
        self.assertEqual(standing, {"horn", "tambourine"})
        self.assertTrue(standing <= seated)
        self.assertEqual(self.atlas.size, (12 * build.CELL_SIZE, build.CELL_SIZE))
        fixed_wardrobes = {"pie", "mug", "chestnuts"}
        for pose in build.COLUMNS:
            with self.subTest(pose=pose):
                team = pose.split("-", 1)[1] not in fixed_wardrobes
                self.assertEqual(build.WARDROBES[pose], "team" if team else "neutral")
                x = build.COLUMNS.index(pose) * build.CELL_SIZE
                source = self.atlas.crop((x, 0, x + build.CELL_SIZE, build.CELL_SIZE))
                home = build.spectator(self.atlas, pose, build.kit_ramps(self.palette, False))
                neutral = build.spectator(self.atlas, pose, build.kit_ramps(self.palette, True))
                indices = source.tobytes()
                self.assertEqual(any(1 <= index <= 16 for index in indices), team)
                self.assertEqual(any(17 <= index <= 32 for index in indices), team)
                for index, fixed, home_color, neutral_color in zip(
                        indices, source.convert("RGBA").get_flattened_data(),
                        home.get_flattened_data(), neutral.get_flattened_data(), strict=True):
                    if not 1 <= index <= 32:
                        self.assertEqual((home_color, neutral_color), (fixed, fixed))
                _, origin = build.place_pose(home, pose, "rear-bench", 19, 50, self.landmarks[pose], self.planks)
                self.assertTrue(build.checked_pixels(home, origin, self.mask, self.bay, pose))

    def test_face_and_hand_midtones_are_fixed_in_both_stances_and_all_three_complexions(self):
        samples = {
            "seated-tambourine": ((22, 16), (22, 26)),
            "standing-tambourine": ((24, 10), (26, 20)),
            "seated-clap": ((23, 17), (27, 24)),
            "seated-lookout": ((23, 14), (31, 16)),
        }
        midtones = {}
        for pose, (cheek, hand) in samples.items():
            start = build.COLUMNS.index(pose) * build.CELL_SIZE
            for x, y in (cheek, hand):
                self.assertGreater(self.atlas.getpixel((start + x, y)), 32, pose)
            midtones[pose] = self.atlas.convert("RGB").getpixel((start + cheek[0], cheek[1]))
        self.assertEqual(midtones["seated-tambourine"], midtones["standing-tambourine"])
        for lighter, darker in (("seated-tambourine", "seated-clap"), ("seated-clap", "seated-lookout")):
            self.assertTrue(all(a > b for a, b in zip(midtones[lighter], midtones[darker], strict=True)))

    def test_hips_knees_and_boot_soles_land_on_the_measured_benches(self):
        measured_edges = {"wall-bench": (0, 9), "rear-bench": (19, 27), "inner-bench": (38, 47)}
        for study in self.studies:
            for seat in study["seats"]:
                with self.subTest(study=study["id"], pose=seat["pose"]):
                    pose = seat["pose"]
                    atlas_points = self.landmarks[pose]
                    alpha = self.cell_alpha(pose)
                    x, y = seat["origin"]["x"], seat["origin"]["y"]
                    self.assertEqual(seat["plankId"], self.planks[seat["support"]][0])
                    back, front = measured_edges[seat["support"]]
                    contact_x, contact_y = atlas_points["contact"]
                    self.assertEqual((x + contact_x, y + contact_y), (seat["x"], seat["y"]))
                    self.assertTrue(alpha.getpixel((contact_x, contact_y)))
                    if seat["stance"] == "seated":
                        knee_x, knee_y = atlas_points["knee"]
                        self.assertEqual(seat["knee"], {"x": x + knee_x, "y": y + knee_y})
                        self.assertTrue(alpha.getpixel((knee_x, knee_y)))
                        if seat["support"] == "wall-bench":
                            self.assertIn(seat["x"], (5, 6))
                            # At least seven contiguous pixels of the figure bear on the seat.
                            self.assertTrue(all(alpha.getpixel((px - x, contact_y - 1))
                                                for px in range(front - 6, front + 1)))
                        else:
                            self.assertEqual(seat["x"], back)
                            self.assertIn(x + knee_x, range(front, front + 3))
                        self.assertEqual(seat["benchWidth"], front - back + 1)
                        self.assertEqual(seat["thighSpan"], knee_x - contact_x)
                    else:
                        sole_x, sole_y = atlas_points["otherSole"]
                        self.assertEqual(seat["otherSole"], {"x": x + sole_x, "y": y + sole_y})
                        self.assertTrue(alpha.getpixel((sole_x, sole_y)))
                        self.assertEqual(sole_y, contact_y)
                        self.assertIn(seat["x"], range(back, front + 1))
                        self.assertIn(x + sole_x, range(back, front + 1))

    def test_attendance_leaves_existing_supporters_in_the_same_seats_and_kits(self):
        previous = None
        for study, occupied, neutrals in zip(self.studies, (9, 6, 3), (3, 2, 1), strict=True):
            plan = {(s["plankId"], s["slot"]["x"], s["slot"]["y"]): s for s in study["seats"]}
            self.assertEqual(study["capacity"], 9)
            self.assertEqual(len(plan), len(study["seats"]))
            self.assertEqual(len(plan), occupied)
            self.assertEqual(len({s["pose"].split("-", 1)[1] for s in plan.values()}), occupied)
            self.assertEqual(sum(s["neutral"] for s in plan.values()), neutrals)
            self.assertEqual({s["plankId"] for s in plan.values()}, {61, 62, 63})
            for plank in (61, 62, 63):
                self.assertEqual(sum(s["plankId"] == plank for s in plan.values()), occupied // 3)
            for supporter in plan.values():
                if not supporter["neutral"]:
                    col = build.COLUMNS.index(supporter["pose"]) * build.CELL_SIZE
                    indices = self.atlas.crop((col, 0, col + build.CELL_SIZE, build.CELL_SIZE)).tobytes()
                    self.assertTrue(any(1 <= index <= 32 for index in indices),
                                    f"{supporter['pose']} has no team cloth")
            if previous is not None:
                for place, supporter in plan.items():
                    earlier = previous[place]
                    self.assertEqual(supporter["pose"].split("-", 1)[1], earlier["pose"].split("-", 1)[1])
                    self.assertEqual(supporter["neutral"], earlier["neutral"])
                    if supporter["pose"] == earlier["pose"]:
                        self.assertEqual(supporter, earlier)
            previous = plan

    def test_standing_requires_the_immediately_northern_slot_to_be_vacant(self):
        fan = next(s for s in build.SEAT_PLAN if s.standing_contact is not None)
        row = sorted((s for s in build.SEAT_PLAN if s.support == fan.support), key=lambda s: s.y)
        north = row[row.index(fan) - 1]
        place = (fan.support, fan.y)
        above = (north.support, north.y)
        standing = (f"standing-{fan.supporter}", fan.standing_contact)
        seated = (f"seated-{fan.supporter}", (fan.x, fan.y))
        self.assertEqual(build.pose_at_seat(fan, {place, ("inner-bench", north.y)}), standing)
        self.assertEqual(build.pose_at_seat(fan, {place, above}), seated)
        for study, expected in zip(self.studies, (seated, standing, standing), strict=True):
            seat = next(s for s in study["seats"] if s["support"] == fan.support and s["slot"]["y"] == fan.y)
            self.assertEqual((seat["pose"], (seat["x"], seat["y"])), expected)
            self.assertEqual(any(s["support"] == north.support and s["slot"]["y"] == north.y
                                 for s in study["seats"]), seat["stance"] == "seated")

    def test_attendance_spreads_contacts_and_vacancies_along_the_planks(self):
        full, preferred, sparse = self.studies
        self.assertEqual(full["spacing"], {"min": 16, "max": 20})
        self.assertEqual(preferred["spacing"], {"min": 18, "max": 44})
        self.assertIsNone(sparse["spacing"])
        self.assertIsNone(sparse["pitch"])
        vacancies = set()
        sparse_positions = set()
        expected_gaps = {"wall-bench": 18, "rear-bench": 44, "inner-bench": 19}
        for support in ("wall-bench", "rear-bench", "inner-bench"):
            slots = sorted(s["slot"]["y"] for s in full["seats"] if s["support"] == support)
            preferred_on_plank = [s for s in preferred["seats"] if s["support"] == support]
            contacts = sorted(s["y"] for s in preferred_on_plank)
            self.assertEqual(contacts[1] - contacts[0], expected_gaps[support])
            occupied = {s["slot"]["y"] for s in preferred_on_plank}
            vacancies.update(i for i, y in enumerate(slots) if y not in occupied)
            sparse_slot = next(s["slot"]["y"] for s in sparse["seats"] if s["support"] == support)
            sparse_positions.add(slots.index(sparse_slot))
        self.assertGreater(len(vacancies), 1)
        self.assertEqual(sparse_positions, {0, 1, 2})

    def test_face_cores_survive_overlapping_supporters(self):
        face_bounds = {
            "seated-tambourine": (20, 13, 26, 20), "standing-tambourine": (20, 9, 27, 16),
            "seated-program": (20, 13, 26, 20), "seated-horn": (20, 13, 27, 19),
            "standing-horn": (20, 10, 27, 16), "seated-pie": (20, 17, 26, 24),
            "seated-clap": (22, 14, 28, 21), "seated-lookout": (19, 13, 26, 19),
            "seated-mug": (20, 13, 26, 20), "seated-whistle": (20, 13, 26, 19),
            "seated-chestnuts": (20, 12, 26, 19), "seated-cheer": (20, 13, 27, 20),
        }
        for study in self.studies:
            foreground = set()
            for seat in reversed(study["seats"]):
                pose = seat["pose"]
                with self.subTest(study=study["id"], pose=pose):
                    origin = seat["origin"]["x"], seat["origin"]["y"]
                    person = build.spectator(self.atlas, pose, build.kit_ramps(self.palette, seat["neutral"]))
                    if seat["stance"] == "seated":
                        build.tuck_behind_seat(person, origin, self.planks[seat["support"]][1],
                                               self.landmarks[pose]["behindSeat"])
                    visible = build.checked_pixels(person, origin, self.mask, self.bay, pose)
                    left, top, right, bottom = face_bounds[pose]
                    core = {(x, y) for x, y in visible
                            if left <= x - origin[0] < right and top <= y - origin[1] < bottom}
                    self.assertTrue(core)
                    self.assertFalse(core & foreground)
                    foreground.update(visible)

    def test_wall_seat_rejects_an_unsupported_thigh_even_with_the_hip_on_timber(self):
        pose = "seated-tambourine"
        person = build.spectator(self.atlas, pose, build.kit_ramps(self.palette, False))
        plank_id, footprint = self.planks["wall-bench"]
        gap = footprint.copy()
        gap.putpixel((8, 39), 0)
        with self.assertRaisesRegex(ValueError, "insufficient support"):
            build.place_pose(person, pose, "wall-bench", 6, 40, self.landmarks[pose],
                             {"wall-bench": (plank_id, gap)})

    def test_same_neighbour_in_another_stance_is_still_a_repeat(self):
        adjacent = (
            build.Seat("rear-bench", 19, 28, "tambourine", 75),
            build.Seat("rear-bench", 19, 62, "tambourine", 75, standing_contact=(19, 69)),
        )
        with self.assertRaisesRegex(ValueError, "repeats adjacent supporters"):
            build.build_study(self.mask, self.bay, self.atlas, self.palette, self.landmarks,
                              ("b", "75%", adjacent), self.planks)

    def test_rejects_a_boot_suspended_beyond_the_bench(self):
        pose = "standing-tambourine"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        with self.assertRaisesRegex(ValueError, "cannot land both boot soles"):
            build.place_pose(person, pose, "rear-bench", 26, 46, self.landmarks[pose], self.planks)

    def test_second_sole_cannot_land_in_a_plank_cutout(self):
        pose = "standing-tambourine"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        plank_id, footprint = self.planks["rear-bench"]
        cutout = footprint.copy()
        points = self.landmarks[pose]
        cutout.putpixel((19 + points["otherSole"][0] - points["contact"][0], 46), 0)
        with self.assertRaisesRegex(ValueError, "cannot land both boot soles"):
            build.place_pose(person, pose, "rear-bench", 19, 46, self.landmarks[pose],
                             {"rear-bench": (plank_id, cutout)})

    def test_timber_leaves_both_foot_fronts_visible(self):
        for study in self.studies:
            for seat in study["seats"]:
                if seat["stance"] != "seated":
                    continue
                pose = seat["pose"]
                with self.subTest(study=study["id"], pose=pose):
                    person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
                    source = person.getchannel("A").tobytes()
                    origin = seat["origin"]["x"], seat["origin"]["y"]
                    build.tuck_behind_seat(person, origin, self.planks[seat["support"]][1],
                                           self.landmarks[pose]["behindSeat"])
                    if seat["support"] != "wall-bench":
                        self.assertLess(sum(person.getchannel("A").tobytes()), sum(source))
                    left, right = self.landmarks[pose]["footFronts"]
                    self.assertLess(left[0] + 1, right[0])
                    for x, y in (left, right):
                        self.assertEqual(person.getpixel((x, y))[3], 255)
                        self.assertEqual(person.getpixel((x + 1, y))[3], 255)

    def calf_fixture(self):
        pose = "seated-tambourine"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        _, footprint = self.planks["rear-bench"]
        _, origin = build.place_pose(person, pose, "rear-bench", 19, 45, self.landmarks[pose], self.planks)
        back = self.landmarks[pose]["behindSeat"]
        covered = [(x, y) for left, top, w, h in back for x in range(left, left + w) for y in range(top, top + h)
                   if person.getpixel((x, y))[3] and footprint.getpixel((origin[0] + x, origin[1] + y))]
        self.assertGreaterEqual(len(covered), 2)
        return person, origin, footprint, back, covered

    def test_gap_in_timber_exposes_the_calf_behind_it(self):
        person, origin, footprint, back, (first, second, *_) = self.calf_fixture()
        gap = footprint.copy()
        gap.putpixel((origin[0] + first[0], origin[1] + first[1]), 0)
        original = person.getpixel(first)
        build.tuck_behind_seat(person, origin, gap, back)
        self.assertEqual(person.getpixel(first), original)
        self.assertEqual(person.getpixel(second)[3], 0)

    def test_calf_behind_timber_still_must_fit_the_bay(self):
        # A calf tucked behind a plank is still part of the original silhouette.
        _, origin, _, _, covered = self.calf_fixture()
        x, y = covered[0]
        point = self.bay["x"] + origin[0] + x, self.bay["y"] + origin[1] + y
        mask = self.mask.copy()
        mask.putpixel(point, 0)
        single = (build.Seat("rear-bench", 19, 45, "tambourine", 75),)
        with self.assertRaisesRegex(ValueError, "seated-tambourine crosses the bay") as rejected:
            build.build_study(mask, self.bay, self.atlas, self.palette, self.landmarks,
                              ("b", "75%", single), self.planks)
        self.assertIn(str(point), str(rejected.exception))

    def test_hidden_pixel_still_belongs_to_its_bay(self):
        full = self.studies[0]
        silhouettes = []
        for seat in full["seats"]:
            alpha = self.cell_alpha(seat["pose"])
            left = self.bay["x"] + seat["origin"]["x"]
            top = self.bay["y"] + seat["origin"]["y"]
            silhouettes.append({(left + x, top + y) for y in range(alpha.height) for x in range(alpha.width)
                                if alpha.getpixel((x, y))})

        shared = silhouettes[0].intersection(set.union(*silhouettes[1:]))
        self.assertTrue(shared, "The full bay needs an actual occlusion for this check")
        point = min(shared)
        mask = self.mask.copy()
        mask.putpixel(point, 0)
        with patch.object(Image.Image, "alpha_composite", side_effect=AssertionError("checked after drawing")):
            with self.assertRaises(ValueError) as rejected:
                build.build_study(mask, self.bay, self.atlas, self.palette, self.landmarks, build.STUDIES[0], self.planks)
        self.assertIn("crosses the bay", str(rejected.exception))
        self.assertIn(str(point), str(rejected.exception))


if __name__ == "__main__":
    unittest.main()
