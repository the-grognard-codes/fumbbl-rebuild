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

    def test_hips_knees_and_boot_soles_land_on_the_measured_benches(self):
        measured_edges = {"rear-bench": (19, 27), "inner-bench": (38, 47)}
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
        for study, occupied, neutrals in zip(self.studies, (8, 6, 4), (3, 2, 1), strict=True):
            plan = {(s["plankId"], s["x"], s["y"]): s for s in study["seats"]}
            self.assertEqual(study["capacity"], 8)
            self.assertEqual(len(plan), len(study["seats"]))
            self.assertEqual(len(plan), occupied)
            self.assertEqual(sum(s["neutral"] for s in plan.values()), neutrals)
            if previous is not None:
                for place, supporter in plan.items():
                    self.assertEqual(supporter, previous[place])
            previous = plan

    def test_rejects_a_boot_suspended_beyond_the_bench(self):
        pose = "standing-fist"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        with self.assertRaisesRegex(ValueError, "cannot land both boot soles"):
            build.place_pose(person, pose, "rear-bench", 20, 46, self.landmarks[pose], self.planks)

    def test_second_sole_cannot_land_in_a_plank_cutout(self):
        pose = "standing-fist"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        plank_id, footprint = self.planks["rear-bench"]
        cutout = footprint.copy()
        cutout.putpixel((27, 46), 0)
        with self.assertRaisesRegex(ValueError, "cannot land both boot soles"):
            build.place_pose(person, pose, "rear-bench", 19, 46, self.landmarks[pose],
                             {"rear-bench": (plank_id, cutout)})

    def test_timber_leaves_both_boot_fronts_visible(self):
        # Row 41 crosses both shafts on every seated pose in this atlas.
        for study in self.studies:
            for seat in study["seats"]:
                if seat["stance"] != "seated":
                    continue
                pose = seat["pose"]
                with self.subTest(study=study["id"], pose=pose):
                    person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
                    shafts = person.getchannel("A").crop((0, 41, person.width, 42)).tobytes()
                    origin = seat["origin"]["x"], seat["origin"]["y"]
                    build.tuck_behind_seat(person, origin, self.planks[seat["support"]][1],
                                           self.landmarks[pose]["behindSeat"])
                    exposed = person.getchannel("A").crop((0, 41, person.width, 42)).tobytes()
                    self.assertLess(sum(exposed), sum(shafts))
                    boots = [run for run in exposed.split(b"\x00") if run]
                    self.assertEqual(len(boots), 2)
                    self.assertGreaterEqual(min(map(len, boots)), 2)

    def test_gap_in_timber_exposes_the_calf_behind_it(self):
        pose = "seated-fist"
        person = build.spectator(self.atlas, pose, (self.palette["teal"], self.palette["violet"]))
        _, footprint = self.planks["rear-bench"]
        _, origin = build.place_pose(person, pose, "rear-bench", 19, 28, self.landmarks[pose], self.planks)
        gap = footprint.copy()
        gap.putpixel((25, 29), 0)
        original = person.getpixel((24, 38))
        self.assertEqual(original[3], 255)
        build.tuck_behind_seat(person, origin, gap, self.landmarks[pose]["behindSeat"])
        self.assertEqual(person.getpixel((24, 38)), original)
        self.assertEqual(person.getpixel((25, 38))[3], 0)

    def test_calf_behind_timber_still_must_fit_the_bay(self):
        # The north folded-arms supporter's calf is behind the rear bench at this pixel.
        point = self.bay["x"] + 25, self.bay["y"] + 29
        mask = self.mask.copy()
        mask.putpixel(point, 0)
        with self.assertRaisesRegex(ValueError, "seated-folded crosses the bay") as rejected:
            build.build_study(mask, self.bay, self.atlas, self.palette, self.landmarks,
                              build.STUDIES[0], self.planks)
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
        self.assertIn(full["seats"][0]["pose"] + " crosses the bay", str(rejected.exception))
        self.assertIn(str(point), str(rejected.exception))


if __name__ == "__main__":
    unittest.main()
