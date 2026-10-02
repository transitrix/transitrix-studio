"""Execute the actual workflow shell with a read-only fake GitHub CLI."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

WORKFLOW = Path(__file__).resolve().parents[1] / "workflows/dependabot-auto-merge.yml"
TEXT = WORKFLOW.read_text()
SCRIPT = "\n".join(line[10:] for line in TEXT.split("        run: |\n", 1)[1].splitlines())
HEAD = "a" * 40
REQUIRED = ["Diff + PR-metadata blocklist", "PR description policy", "Build & Test with Metrics Regression", "merge-guard-tests"]
GREEN = [{"name": name, "bucket": "pass"} for name in REQUIRED]
CODEQL_SKIPPED = [{"name": "CodeQL", "bucket": "skipping"}]
FAKE_GH = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
args = sys.argv[1:]
if args[:2] == ["pr", "view"]:
    p = pathlib.Path(os.environ["CALLS"])
    n = int(p.read_text()) if p.exists() else 0
    p.write_text(str(n+1))
    print(json.dumps({"headRefOid": os.environ["EXPECTED_HEAD"] if n < int(os.environ.get("CHANGE_AFTER", "99")) else "b"*40, "state": "OPEN", "isDraft": os.environ.get("DRAFT") == "1"}))
elif args[:1] == ["api"]:
    if int(os.environ.get("API_RC", "0")):
        sys.exit(int(os.environ["API_RC"]))
    rows = json.loads(os.environ["CHECKS"])
    trusted_available = os.environ.get("TRUSTED_CODEQL") == "1"
    trusted_used = False
    runs = []
    mapping = {
        "pass": ("completed", "success"),
        "pending": ("in_progress", None),
        "fail": ("completed", "failure"),
        "cancel": ("completed", "cancelled"),
        "skipping": ("completed", "neutral"),
        "unexpected": ("completed", "unexpected"),
    }
    for row in rows:
        status, conclusion = mapping[row["bucket"]]
        app = "github-actions"
        if row["name"] == "CodeQL" and row["bucket"] == "skipping" and trusted_available and not trusted_used:
            app = "github-advanced-security"
            trusted_used = True
        runs.append({"name": row["name"], "status": status, "conclusion": conclusion, "app": {"slug": app}})
    response = {"total_count": len(runs), "check_runs": runs}
    if os.environ.get("MALFORMED") == "1":
        response = {"total_count": len(runs) + 1, "check_runs": runs}
    print(json.dumps(response))
elif args[:2] == ["pr", "merge"]:
    pathlib.Path(os.environ["MERGE"]).write_text(json.dumps(args))
    sys.exit(int(os.environ.get("MERGE_RC", "0")))
else:
    sys.exit(99)
'''

class Gate(unittest.TestCase):
    def run_gate(self, rows, **extra):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)
            (p / "gh").write_text(FAKE_GH)
            (p / "gh").chmod(0o755)
            # Pending cases terminate at the first sleep; no wall-clock wait.
            (p / "sleep").write_text("#!/bin/sh\nexit 88\n")
            (p / "sleep").chmod(0o755)
            env = dict(os.environ, PATH=tmp+os.pathsep+os.environ["PATH"], EXPECTED_HEAD=HEAD,
                       REPOSITORY="example/repo",
                       PR_URL="https://github.com/example/repo/pull/1", CHECKS=json.dumps(rows),
                       CALLS=str(p/"calls"), MERGE=str(p/"merge"), **extra)
            result = subprocess.run(["bash", "-c", SCRIPT], env=env, capture_output=True, text=True, timeout=5)
            args = json.loads((p/"merge").read_text()) if (p/"merge").exists() else None
            return result.returncode, args

    def test_green_binds_merge_head(self):
        rc, args = self.run_gate(GREEN)
        self.assertEqual(rc, 0)
        self.assertEqual(args[args.index("--match-head-commit")+1], HEAD)

    def test_pending_self_does_not_deadlock_green_checks(self):
        rc, args = self.run_gate(GREEN + [{"name":"auto-merge","bucket":"pending"}])
        self.assertEqual(rc, 0)
        self.assertIsNotNone(args)

    def test_neutral_codeql_aggregate_does_not_block_green_checks(self):
        rc, args = self.run_gate(GREEN + CODEQL_SKIPPED, TRUSTED_CODEQL="1")
        self.assertEqual(rc, 0)
        self.assertIsNotNone(args)

    def test_unverified_codeql_skip_does_not_merge(self):
        self.assertIsNone(self.run_gate(GREEN + CODEQL_SKIPPED)[1])

    def test_same_name_codeql_collision_does_not_merge(self):
        rows = GREEN + CODEQL_SKIPPED + CODEQL_SKIPPED
        self.assertIsNone(self.run_gate(rows, TRUSTED_CODEQL="1")[1])

    def test_empty_self_missing_and_pending_do_not_merge(self):
        for rows in [[], [{"name":"auto-merge","bucket":"pending"}], GREEN[:-1],
                     GREEN + [{"name":"e2e","bucket":"pending"}]]:
            with self.subTest(rows=rows):
                self.assertIsNone(self.run_gate(rows)[1])

    def test_unsuccessful_and_unknown_do_not_merge(self):
        for bucket in ["fail", "cancel", "skipping", "unexpected"]:
            with self.subTest(bucket=bucket):
                self.assertIsNone(self.run_gate(GREEN + [{"name":"e2e","bucket":bucket}])[1])

    def test_required_skips_and_non_skipped_codeql_do_not_merge(self):
        skipped_required = [
            {"name": name, "bucket": "skipping" if name == REQUIRED[0] else "pass"}
            for name in REQUIRED
        ]
        self.assertIsNone(self.run_gate(
            skipped_required + CODEQL_SKIPPED, TRUSTED_CODEQL="1"
        )[1])
        for bucket in ["fail", "cancel", "pending", "unexpected"]:
            with self.subTest(bucket=bucket):
                self.assertIsNone(self.run_gate(GREEN + [{"name":"CodeQL","bucket":bucket}])[1])

    def test_initial_and_mid_poll_push_do_not_merge(self):
        for count in ["0", "1"]:
            with self.subTest(count=count):
                self.assertIsNone(self.run_gate(GREEN, CHANGE_AFTER=count)[1])

    def test_api_error_and_malformed_response_do_not_merge(self):
        self.assertIsNone(self.run_gate(GREEN, API_RC="2")[1])
        self.assertIsNone(self.run_gate(GREEN, MALFORMED="1")[1])

    def test_draft_refused(self):
        self.assertIsNone(self.run_gate(GREEN, DRAFT="1")[1])

    def test_merge_failure_is_not_success(self):
        rc, args = self.run_gate(GREEN, MERGE_RC="1")
        self.assertNotEqual(rc, 0)
        self.assertIsNotNone(args)

if __name__ == "__main__":
    unittest.main()
