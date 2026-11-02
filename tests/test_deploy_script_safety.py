"""
Regression tests for deploy_to_vps.py safety bugs found on 2026-11-02:
1. previous_sha was read after stream_to_vps() overwrote .deploy_info.json -> rollback target == new sha.
2. Smoke test probed the public domain from the workstation and required crew services -> false failures.
3. A dirty working tree was auto-committed with `git add -A` (tracked client data could be pushed).
No real SSH / network / git remote is used.
"""

import subprocess
from types import SimpleNamespace

import pytest

import deploy_to_vps as d


def _ok(stdout=""):
    return SimpleNamespace(returncode=0, stdout=stdout, stderr="")


def test_deploy_records_real_previous_sha(tmp_path, monkeypatch):
    (tmp_path / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    recorded = {}

    monkeypatch.setattr(d, "check_ssh_reachability", lambda **k: True)
    # Simulates .deploy_info.json already overwritten by stream_to_vps() with the NEW commit.
    monkeypatch.setattr(d, "get_vps_deploy_info", lambda p: {"commit": "newsha1"})
    monkeypatch.setattr(d, "set_vps_image_tag", lambda *a: True)
    monkeypatch.setattr(d, "setup_vps_backup_timer", lambda *a: True)
    monkeypatch.setattr(d.subprocess, "run", lambda *a, **k: _ok())
    monkeypatch.setattr(d, "update_vps_deploy_info",
                        lambda p, current_sha, previous_sha: recorded.update(cur=current_sha, prev=previous_sha))

    assert d.deploy_via_docker_compose(tmp_path, "/opt/x", "newsha1", "newsha1" + "0" * 33,
                                       previous_sha="oldsha1")
    assert recorded == {"cur": "newsha1", "prev": "oldsha1"}


def test_redeploy_same_sha_keeps_older_rollback_target(tmp_path, monkeypatch):
    (tmp_path / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    recorded = {}
    monkeypatch.setattr(d, "check_ssh_reachability", lambda **k: True)
    monkeypatch.setattr(d, "get_vps_deploy_info",
                        lambda p: {"current_sha": "samesha", "previous_sha": "oldsha1"})
    monkeypatch.setattr(d, "set_vps_image_tag", lambda *a: True)
    monkeypatch.setattr(d, "setup_vps_backup_timer", lambda *a: True)
    monkeypatch.setattr(d.subprocess, "run", lambda *a, **k: _ok())
    monkeypatch.setattr(d, "update_vps_deploy_info",
                        lambda p, current_sha, previous_sha: recorded.update(cur=current_sha, prev=previous_sha))

    assert d.deploy_via_docker_compose(tmp_path, "/opt/x", "samesha", previous_sha="samesha")
    assert recorded["prev"] == "oldsha1"


def _fake_ssh(http_code):
    def run(cmd, **k):
        remote = cmd[-1]
        if "curl" in remote:
            return _ok(http_code)
        # container status, then cloudflared status
        return _ok("running\nactive\n")
    return run


def test_smoke_passes_without_crew_services_and_probes_from_vps(monkeypatch):
    seen = []

    def run(cmd, **k):
        seen.append(cmd[-1])
        return _fake_ssh("200")(cmd, **k)

    monkeypatch.setattr(d.subprocess, "run", run)
    assert d.run_smoke_test(timeout_sec=5) is True
    status_cmd = seen[0]
    assert "revops-healer" not in status_cmd and "revops-tgbot" not in status_cmd
    assert any("curl" in c and "report.ai-rop.ru" in c for c in seen), "health must be probed over SSH"


def test_smoke_fails_when_public_health_is_down(monkeypatch):
    monkeypatch.setattr(d.subprocess, "run", _fake_ssh("502"))
    monkeypatch.setattr(d.time, "sleep", lambda s: None)
    assert d.run_smoke_test(timeout_sec=1) is False


def test_dirty_tree_aborts_without_committing(tmp_path):
    def git(*args):
        return subprocess.run(["git", *args], cwd=tmp_path, capture_output=True, text=True, check=True)

    git("init", "-q")
    git("config", "user.email", "t@t")
    git("config", "user.name", "t")
    (tmp_path / "a.txt").write_text("1", encoding="utf-8")
    git("add", "a.txt")
    git("commit", "-q", "-m", "init")
    (tmp_path / "client_data.json").write_text('{"secret": 1}', encoding="utf-8")

    with pytest.raises(SystemExit):
        d.sync_git(tmp_path, "auto commit")

    assert git("rev-list", "--count", "HEAD").stdout.strip() == "1"
    assert "client_data.json" not in git("ls-files").stdout
