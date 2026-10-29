"""Regression checks for distance thresholds, segment breaks and local dates."""

import unittest
from datetime import date, datetime, timezone

from update_data import distance_milestones_in_track, source_distance_meters


class DistanceMilestonesTest(unittest.TestCase):
    def row(self, km=20, country="Catalunya", day=date(2025, 11, 30)):
        return {"km": km, "country": country, "date": day, "file": "test.gpx"}

    def points(self):
        return [
            {"lat": 0, "lon": 0, "time": datetime(2025, 11, 30, 10, tzinfo=timezone.utc), "segment_start": True},
            {"lat": 0, "lon": .1, "time": datetime(2025, 11, 30, 12, tzinfo=timezone.utc)},
        ]

    def test_manifest_distance_scales_geometry_and_interpolates_time(self):
        record, = distance_milestones_in_track(self.points(), self.row(), 990)
        self.assertEqual(record["km"], 1000)
        self.assertAlmostEqual(record["lon"], .05, places=6)
        self.assertEqual(record["local_time"], "2025-11-30T12:00:00+01:00")
        self.assertEqual(record["journey_day"], 1)

    def test_threshold_at_track_end_is_not_duplicated_in_next_track(self):
        records = distance_milestones_in_track(self.points(), self.row(km=10), 990)
        self.assertEqual(len(records), 1)
        self.assertAlmostEqual(records[0]["lon"], .1)
        self.assertEqual(distance_milestones_in_track(self.points(), self.row(), 1000), [])

    def test_multiple_thresholds_in_one_track(self):
        records = distance_milestones_in_track(self.points(), self.row(km=2500), 900)
        self.assertEqual([r["km"] for r in records], [1000, 2000, 3000])

    def test_segment_gap_is_not_used_as_walked_distance(self):
        points = self.points()
        points += [{"lat": 0, "lon": 50, "segment_start": True}, {"lat": 0, "lon": 50.1}]
        record, = distance_milestones_in_track(points, self.row(), 985)
        self.assertAlmostEqual(record["lon"], 50.05, places=6)
        self.assertIsNone(record["time_utc"])

    def test_missing_track_has_no_fabricated_position(self):
        record, = distance_milestones_in_track([], self.row(), 990)
        self.assertIsNone(record["lat"])
        self.assertIsNone(record["local_time"])

    def test_missing_or_reversed_times_are_not_interpolated(self):
        points = self.points()
        points[1].pop("time")
        record, = distance_milestones_in_track(points, self.row(), 990)
        self.assertIsNone(record["local_time"])
        points = self.points()
        points[0]["time"], points[1]["time"] = points[1]["time"], points[0]["time"]
        record, = distance_milestones_in_track(points, self.row(), 990)
        self.assertIsNone(record["local_time"])

    def test_local_midnight_determines_journey_day(self):
        points = self.points()
        points[0]["time"] = datetime(2025, 11, 30, 20, tzinfo=timezone.utc)
        points[1]["time"] = datetime(2025, 11, 30, 22, tzinfo=timezone.utc)
        record, = distance_milestones_in_track(points, self.row(country="Pakistan"), 990)
        self.assertEqual(record["date"], "2025-12-01")
        self.assertEqual(record["journey_day"], 2)
        self.assertEqual(record["local_time"], "2025-12-01T02:00:00+05:00")

    def test_timezone_observes_summer_time(self):
        points = self.points()
        for point in points:
            point["time"] = point["time"].replace(month=6)
        record, = distance_milestones_in_track(points, self.row(country="Itàlia"), 990)
        self.assertTrue(record["local_time"].endswith("+02:00"))

    def test_no_threshold_or_zero_distance(self):
        self.assertEqual(distance_milestones_in_track(self.points(), self.row(), 0), [])
        self.assertEqual(distance_milestones_in_track(self.points(), self.row(km=0), 990), [])

    def test_unknown_timezone_is_explicitly_utc(self):
        record, = distance_milestones_in_track(self.points(), self.row(country="Nou territori"), 990)
        self.assertEqual(record["time_zone"], "UTC")
        self.assertEqual(record["local_time"], "2025-11-30T11:00:00+00:00")

    def test_elevation_changes_where_threshold_is_reached(self):
        # Two equal horizontal edges: only the first climbs. The source counts
        # its longer 3D distance, so halfway falls before their shared vertex.
        points = [
            {"lat": 0, "lon": 0, "ele": 0},
            {"lat": 0, "lon": .001, "ele": 200},
            {"lat": 0, "lon": .002, "ele": 200},
        ]
        record, = distance_milestones_in_track(points, self.row(), 990)
        self.assertLess(record["lon"], .001)
        self.assertGreater(record["lon"], 0)

    def test_source_metric_includes_raw_elevation(self):
        self.assertEqual(source_distance_meters(
            {"lat": 0, "lon": 0, "ele": 10},
            {"lat": 0, "lon": 0, "ele": 110},
        ), 100)


if __name__ == "__main__":
    unittest.main()
