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
cycle = load("task-cycle-hours")
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

    def test_task_cycle_pairs_earliest_pr_and_drops_retro_records(self):
        issues = [
            {"number": 10, "createdAt": "2026-10-01T00:00:00Z"},
            {"number": 11, "createdAt": "2026-10-05T00:00:00Z"},
            {"number": 12, "createdAt": "2026-10-05T00:00:00Z"},
            {"number": 13, "createdAt": "2026-10-05T00:00:00Z"},
            {"number": 14, "createdAt": "2026-10-05T00:00:00Z"},
            {"number": 15, "createdAt": "2026-10-05T00:00:00Z"},
        ]
        prs = [
            {"number": 20, "createdAt": "2026-10-02T06:00:00Z", "body": "关联 #10\n\n正文"},
            {"number": 21, "createdAt": "2026-10-03T06:00:00Z", "body": "关联 #10\n\n返工"},
            {"number": 22, "createdAt": "2026-10-04T00:00:00Z", "body": "关联 #20"},
            {"number": 23, "createdAt": "2026-10-04T00:00:00Z", "body": "关联 #11"},
            {"number": 24, "createdAt": "2026-10-05T12:00:00Z",
             "body": "关联 #12、#13\n\nCloses #14 #15"},
        ]
        with contextlib.redirect_stderr(io.StringIO()):
            pairs = cycle.build_pairs(prs, issues)
        # 21 是同一 Issue 的返工、22 引用到 PR、23 的 PR 早于 Issue,都不计;
        # 24 同时服务 #12、#13、#14、#15,每个 Issue 各配一对
        self.assertEqual(sorted(n for _, _, n in pairs), [20, 24, 24, 24, 24])
        first = next(pair for pair in pairs if pair[2] == 20)
        self.assertEqual(first[0], instant("2026-10-01T00:00:00Z"))
        self.assertEqual(first[1] - first[0], dt.timedelta(hours=30))

    def test_task_cycle_buckets_skip_empty_and_declare_partial_coverage(self):
        tz = ZoneInfo("Asia/Shanghai")
        anchor = dt.datetime(2026, 10, 1, 9, tzinfo=tz)
        pairs = [
            (anchor, anchor + dt.timedelta(hours=2), 1),
            (anchor, anchor + dt.timedelta(hours=4), 2),
            (anchor + dt.timedelta(days=9), anchor + dt.timedelta(days=9, hours=8), 3),
            (anchor + dt.timedelta(days=12), anchor + dt.timedelta(days=12, hours=5), 4),
        ]
        with contextlib.redirect_stderr(io.StringIO()):
            points = cycle.build_points(pairs, "week", dt.date(2026, 9, 28),
                                        dt.date(2026, 10, 15), tz,
                                        dt.datetime(2026, 10, 20, tzinfo=tz))
        self.assertEqual([p["week"] for p in points], ["2026-W40", "2026-W41", "2026-W42"])
        self.assertEqual(points[0]["value"], 3.0)  # 两个样本取中位
        self.assertNotIn("coverage", points[0])  # 完整且已结束的周不声明
        self.assertEqual(points[2]["value"], 5.0)
        self.assertEqual(points[2]["coverage"],
                         {"start": "2026-10-12T00:00:00+08:00",
                          "end": "2026-10-15T00:00:00+08:00"})
        with contextlib.redirect_stderr(io.StringIO()):
            empty = cycle.build_points(pairs[:3], "week", dt.date(2026, 9, 28),
                                       dt.date(2026, 10, 19), tz,
                                       dt.datetime(2026, 10, 20, tzinfo=tz))
        self.assertEqual([p["week"] for p in empty], ["2026-W40", "2026-W41"])

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
