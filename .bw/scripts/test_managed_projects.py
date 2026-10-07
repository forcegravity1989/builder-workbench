"""计划活动按已提交事实计数：迁移、草稿和空材料不伪造使用。"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    "managed_projects", Path(__file__).with_name("managed-projects.py")
)
managed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(managed)


class PlanningHistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git("init", "-b", "main")
        self.git("config", "user.name", "Metric fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        self.git("config", "core.hooksPath", str(self.root / "no-hooks"))
        self.plan_path = self.root / ".bw/planning/v0.5/data.json"
        self.plan_path.parent.mkdir(parents=True)

    def git(self, *args, when=None):
        env = os.environ.copy()
        if when:
            env.update(GIT_AUTHOR_DATE=when, GIT_COMMITTER_DATE=when)
        return subprocess.run(
            ["git", "-c", "commit.gpgsign=false", *args], cwd=self.root,
            env=env, check=True, capture_output=True, encoding="utf-8"
        ).stdout.strip()

    def commit_plan(self, data, when):
        self.plan_path.write_text(json.dumps(data), encoding="utf-8")
        self.git("add", ".bw")
        self.git("commit", "-m", "fixture", when=when)
        return self.git("rev-parse", "HEAD")

    def plan(self, title="实际计划"):
        return {"schema_version": 3, "cycleId": "cycle-1",
                "summary": {"progress": "", "risks": ""},
                "goals": [{"goalId": "G1", "title": title}], "tasks": []}

    def stamps(self, ref="HEAD"):
        result, error = managed.planning_stamps(self.root, "fixture", ref)
        self.assertIsNone(error)
        return {managed.datetime.datetime.fromtimestamp(
            value, managed.datetime.timezone.utc
        ).isoformat() for value in result}

    def test_migration_keeps_legacy_history_and_later_real_change_is_counted(self):
        self.commit_plan({"schema_version": 2, "updated_at": "2026-09-21T12:00:00Z",
                          "plan": {"goals": [{"title": "实际计划"}]}},
                         "2026-09-21T12:00:00Z")
        migrated = self.commit_plan(self.plan(), "2026-09-30T12:00:00Z")
        expected = {"2026-09-21T12:00:00+00:00"}
        self.assertEqual(self.stamps(migrated), expected)
        self.commit_plan(self.plan("调整后的计划"), "2026-10-07T12:00:00Z")
        self.plan_path.write_text(json.dumps(self.plan("未提交草稿")), encoding="utf-8")
        self.assertEqual(self.stamps(), expected | {"2026-10-07T12:00:00+00:00"})
        self.assertEqual(self.stamps(migrated), expected)

    def test_empty_new_plan_and_metadata_only_updates_are_not_activity(self):
        self.commit_plan(self.plan(""), "2026-10-05T12:00:00Z")
        self.assertEqual(self.stamps(), set())
        data = self.plan()
        self.commit_plan(data, "2026-10-06T12:00:00Z")
        data["progress_updates"] = [{"value": "automatic observation"}]
        data["updated_at"] = "2026-10-07T12:00:00Z"
        self.commit_plan(data, "2026-10-07T12:00:00Z")
        self.assertEqual(self.stamps(), {"2026-10-06T12:00:00+00:00"})
        dt = managed.datetime
        now = dt.datetime(2026, 10, 7, 12, tzinfo=dt.timezone.utc)
        lo, hi = dt.date(2026, 10, 5), dt.date(2026, 10, 12)
        future = {"adopted": True, "since": dt.date(2026, 10, 8),
                  "stamps": {(now + dt.timedelta(hours=1)).timestamp()}}
        for metric in ("adoption", "monday-screen"):
            self.assertEqual(managed.count_in_window(
                metric, [future], lo, hi, dt.timezone.utc, now), 0)
        observed = {"adopted": True, "since": dt.date(2026, 10, 7),
                    "stamps": {(now - dt.timedelta(hours=1)).timestamp()}}
        for metric in ("adoption", "monday-screen"):
            self.assertEqual(managed.count_in_window(
                metric, [future, observed], lo, hi, dt.timezone.utc, now), 1)

    def test_whitelist_is_read_from_the_declared_data_commit(self):
        whitelist = self.root / ".bw/managed-projects.toml"
        whitelist.write_text('[[projects]]\nname="BW"\nprovider="github"\n'
                             'remote="owner/repo"\nlocal="."\nsince="2026-09-01"\n',
                             encoding="utf-8")
        commit = self.commit_plan(self.plan(), "2026-10-06T12:00:00Z")
        whitelist.write_text("broken = [", encoding="utf-8")
        with patch.dict(os.environ, {"BW_METRICS_DATA_COMMIT": commit}):
            entries, error = managed.load_whitelist(whitelist, self.root)
        self.assertIsNone(error)
        self.assertEqual([entry["name"] for entry in entries], ["BW"])


if __name__ == "__main__":
    unittest.main()
