"""Focused source/coverage protocol checks; no network, desktop, or provider writes."""

import contextlib
import datetime as dt
import importlib.util
import io
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).parent))
from metric_source import read_source_text


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


plan = load("plan-cycle-hours")
collect = load("collect-daily-observation")
closed = load("closed-issues")
UTC = dt.timezone.utc
PROJECT = {"name": "sample", "remote": "owner/sample", "provider": "github"}


def instant(text):
    return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))


class MetricHistoryTests(unittest.TestCase):
    def test_source_revision_is_required_without_worktree_fallback(self):
        root = Path.cwd()
        response = subprocess.CompletedProcess([], 0, "pinned contents", "")
        with patch.dict(os.environ, {"BW_METRICS_DATA_COMMIT": "adopted-sha"}), \
                patch("metric_source.subprocess.run", return_value=response) as run:
            self.assertEqual(read_source_text(root, ".bw/input.json"), "pinned contents")
            self.assertEqual(run.call_args.args[0][-1], "adopted-sha:.bw/input.json")
            read_source_text(root, root / ".bw/input.json", "explicit-sha")
            self.assertEqual(run.call_args.args[0][-1], "explicit-sha:.bw/input.json")
            run.return_value = subprocess.CompletedProcess([], 128, "", "missing blob")
            with self.assertRaisesRegex(RuntimeError, "missing blob"):
                read_source_text(root, ".bw/input.json")
        with self.assertRaises(RuntimeError):
            read_source_text(root, "../outside")

    def test_legacy_or_damaged_ledger_cannot_claim_complete_observation(self):
        row = {"schema": collect.SCHEMA, "day": "2026-09-28", "projects": [
            {**PROJECT, "signals": {"pr_merges": [
                {"pr": 1, "merged_at": "2026-09-28T12:00:00Z"}]}}]}
        with patch.object(plan, "read_source_text", return_value=json.dumps(row)):
            events, coverage = plan.load_events(Path.cwd(), {PROJECT["remote"]})
        self.assertEqual(len(events), 1)
        self.assertIsNone(plan.covered_span(coverage, instant("2026-09-28T00:00:00Z"),
                                           instant("2026-10-05T00:00:00Z")))
        with patch.object(plan, "read_source_text", return_value="broken-json"), \
                contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            plan.load_events(Path.cwd(), {PROJECT["remote"]})

    def test_zero_event_success_records_coverage_and_does_not_fill_source_gaps(self):
        lines = {}
        end = instant("2026-09-30T08:40:48Z")
        collect.record_coverage(lines, PROJECT, None, end)
        row = lines["2026-09-30"]
        self.assertEqual(row["projects"][0]["signals"]["pr_merges"], [])
        self.assertEqual(len(row["projects"][0]["coverage"]), 1)
        with patch.object(plan, "read_source_text", return_value=json.dumps(row)):
            _, coverage = plan.load_events(Path.cwd(), {PROJECT["remote"]})
        start, until = instant("2026-09-28T00:00:00Z"), instant("2026-10-05T00:00:00Z")
        self.assertEqual(plan.covered_span(coverage, start, until), (start, end))
        self.assertEqual(plan.coverage_if_partial(start, end, start, until, until)["end"],
                         end.isoformat(timespec="seconds"))
        coverage["unobserved/project"] = []
        self.assertIsNone(plan.covered_span(coverage, start, until))
        coverage = {PROJECT["remote"]: [(start, end),
                    (instant("2026-10-02T00:00:00Z"), until)]}
        self.assertIsNone(plan.covered_span(coverage, start, until))
        collect.record_coverage(lines, PROJECT, start, until)
        later = lines["2026-10-05"]["projects"][0]["coverage"]
        self.assertEqual(later[0]["end"], until.isoformat(timespec="seconds"))

    def test_duration_uses_elapsed_time_across_dst_and_preserves_negative_values(self):
        tz = ZoneInfo("America/New_York")
        anchor = dt.datetime(2026, 10, 26, 9, tzinfo=tz)
        end = dt.datetime(2026, 11, 1, 12, tzinfo=tz)
        self.assertEqual(plan.median_hours([end], anchor), (148.0, 1))
        self.assertEqual(plan.median_hours([anchor - dt.timedelta(hours=8)], anchor), (-8.0, 1))
        self.assertIsNone(plan.median_hours([], anchor))

    def test_missing_cli_truncation_and_malformed_provider_output_fail_honestly(self):
        with contextlib.redirect_stderr(io.StringIO()):
            with patch.object(collect.subprocess, "run", side_effect=FileNotFoundError("no CLI")):
                self.assertIsNone(collect.fetch_codehub(PROJECT, None))
            full = subprocess.CompletedProcess([], 0, json.dumps([{}] * collect.FETCH_LIMIT), "")
            with patch.object(collect, "run", return_value=full):
                self.assertIsNone(collect.fetch_github(PROJECT["remote"], None))
                self.assertIsNone(collect.fetch_codehub(PROJECT, None))
            with patch.object(closed.subprocess, "run", return_value=full), \
                    self.assertRaises(SystemExit):
                closed.fetch_closed(PROJECT["remote"], dt.date(2026, 9, 1), dt.date(2026, 10, 1))
            bad = subprocess.CompletedProcess([], 0, '[{"number":1}]', "")
            with patch.object(collect, "run", return_value=bad):
                self.assertIsNone(collect.fetch_github(PROJECT["remote"], None))

    def test_observation_commit_excludes_other_staged_paths(self):
        response = subprocess.CompletedProcess([], 0, "", "")
        with patch.object(collect, "run", return_value=response) as run:
            collect.commit_observation(0)
        commands = [call.args[0] for call in run.call_args_list]
        commit = next(command for command in commands if "commit" in command)
        self.assertIn("--only", commit)
        self.assertEqual(commit[-2:], ["--", ".bw/metrics/daily-observation.jsonl"])
        self.assertTrue(all(command[:3] == ["git", "-C", str(collect.ROOT)]
                            for command in commands))


if __name__ == "__main__":
    unittest.main()
