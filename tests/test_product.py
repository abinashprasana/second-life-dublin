"""Focused checks for the published evidence contract."""
import copy
import json
import unittest
import pandas as pd

from src.export_web import OUTPUT, validate_snapshot
from src.join import SITE_TABLE, resolve_join_matches
from src.load import BOUNDARY_KEY, REGISTER_FIELDS
from src.score import load_table, rank_uses
from src.scene import project, polygons


class ProductEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = json.loads((OUTPUT / "atlas.json").read_text(encoding="utf-8"))
        cls.sites = {site["id"]: site for site in cls.snapshot["sites"]}

    def test_join_has_one_row_per_site(self):
        rows = json.loads(SITE_TABLE.read_text(encoding="utf-8"))
        self.assertEqual(len(rows), 134)
        self.assertEqual(len({row["site_id"] for row in rows}), 134)
        self.assertTrue(all(row["join_succeeded"] for row in rows))

    def test_scene_preserves_locations_and_holes(self):
        scene = json.loads((OUTPUT / "dublin_scene.json").read_text(encoding="utf-8"))
        self.assertEqual(scene["ringsM"], [400, 800])
        self.assertEqual(len(scene["sites"]), 134)
        for item in scene["sites"]:
            site = self.sites[item["id"]]
            self.assertEqual(item["position"], project(site["position"]["lon"], site["position"]["lat"]))
        outer = [[-6.3,53.3],[-6.2,53.3],[-6.2,53.4],[-6.3,53.3]]
        hole = [[-6.28,53.32],[-6.25,53.32],[-6.25,53.35],[-6.28,53.32]]
        result = polygons({"features":[{"geometry":{"type":"Polygon","coordinates":[outer,hole]}}]})
        self.assertEqual(len(result[0]), 2)
        self.assertEqual(result[0][1], [project(*p) for p in hole])

    def test_shared_boundary_choice_is_stable_and_reported(self):
        site_key = REGISTER_FIELDS["id"]
        joined = pd.DataFrame([{site_key: "DS-X", BOUNDARY_KEY: "B"},
                               {site_key: "DS-X", BOUNDARY_KEY: "A"},
                               {site_key: "DS-Y", BOUNDARY_KEY: "C"}])
        resolved, ambiguous = resolve_join_matches(joined)
        self.assertEqual(dict(zip(resolved[site_key], resolved[BOUNDARY_KEY])), {"DS-X": "A", "DS-Y": "C"})
        self.assertEqual(ambiguous, [{"siteId": "DS-X", "smallAreaIds": ["A", "B"], "chosen": "A"}])

    def test_exported_scores_and_facts_match_python(self):
        for site_id in ("DS1596", "DS864", "DS040"):
            with self.subTest(site_id=site_id):
                exported = self.sites[site_id]["uses"]
                python = rank_uses(site_id)
                self.assertEqual([(item["use"], item["score"], item["facts"]) for item in exported],
                                 [(item["use"], item["score"], item["facts"]) for item in python])

    def test_missing_service_evidence_stays_unscored(self):
        site = self.sites["DS492"]
        self.assertEqual(site["coverage"]["evidenceStatus"], "missing_osm")
        self.assertTrue(all(item["score"] is None for item in site["uses"]))
        self.assertEqual(sum(row["osm_available"] for row in load_table()), 8)

    def test_validation_rejects_wrong_score_and_duplicate_id(self):
        self.assertEqual(validate_snapshot(self.snapshot)["unscoredCount"], 126)
        broken = copy.deepcopy(self.snapshot)
        broken["sites"][0]["id"] = broken["sites"][1]["id"]
        with self.assertRaisesRegex(ValueError, "unique sites"):
            validate_snapshot(broken)
        broken = copy.deepcopy(self.snapshot)
        next(site for site in broken["sites"] if site["coverage"]["hasOsm"])["uses"][0]["score"] = 101
        with self.assertRaisesRegex(ValueError, "invalid score"):
            validate_snapshot(broken)


if __name__ == "__main__":
    unittest.main()
