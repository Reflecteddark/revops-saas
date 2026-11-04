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


# --- the health guard must not fight the deploy ---------------------------------------------------------------

def _recording_ssh(commands, fail=None):
    """Replaces subprocess.run: records the remote command of every ssh call; `fail` maps a substring to a returncode."""
    def run(cmd, **k):
        remote = cmd[-1] if isinstance(cmd, list) else str(cmd)
        commands.append(remote)
        for needle, code in (fail or {}).items():
            if needle in remote:
                return SimpleNamespace(returncode=code, stdout="", stderr="boom")
        return _ok()
    return run


def _stub_deploy(tmp_path, monkeypatch, commands, fail=None):
    (tmp_path / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    monkeypatch.setattr(d, "check_ssh_reachability", lambda **k: True)
    monkeypatch.setattr(d, "get_vps_deploy_info", lambda p: {"current_sha": "oldsha1"})
    monkeypatch.setattr(d, "set_vps_image_tag", lambda *a: True)
    monkeypatch.setattr(d, "setup_vps_backup_timer", lambda *a: True)
    monkeypatch.setattr(d, "update_vps_deploy_info", lambda *a, **k: True)
    monkeypatch.setattr(d.time, "sleep", lambda s: None)
    monkeypatch.setattr(d.subprocess, "run", _recording_ssh(commands, fail))


def _index(commands, needle):
    return next(i for i, c in enumerate(commands) if needle in c)


def test_guard_is_stopped_for_the_container_swap_and_started_after_the_api_answers(tmp_path, monkeypatch):
    commands = []
    _stub_deploy(tmp_path, monkeypatch, commands)

    assert d.deploy_via_docker_compose(tmp_path, "/opt/x", "newsha1", previous_sha="oldsha1")

    stop = _index(commands, "systemctl stop revops-health-guard.timer")
    up = _index(commands, "docker compose up -d api worker")
    ready = _index(commands, "127.0.0.1:8000/api/v1/health")
    start = _index(commands, "systemctl start revops-health-guard.timer")
    assert stop < up < ready < start


def test_guard_is_started_again_when_the_deploy_fails(tmp_path, monkeypatch):
    commands = []
    _stub_deploy(tmp_path, monkeypatch, commands, fail={"docker compose up": 1})

    assert d.deploy_via_docker_compose(tmp_path, "/opt/x", "newsha1", previous_sha="oldsha1") is False
    assert any("systemctl start revops-health-guard.timer" in c for c in commands)


def test_a_guard_that_was_not_running_is_not_started_by_the_deploy(tmp_path, monkeypatch):
    commands = []
    _stub_deploy(tmp_path, monkeypatch, commands, fail={"systemctl is-active": 3})

    assert d.deploy_via_docker_compose(tmp_path, "/opt/x", "newsha1", previous_sha="oldsha1")
    assert not any("systemctl start revops-health-guard.timer" in c for c in commands)


def test_the_guard_is_not_waited_for_longer_than_90_seconds(monkeypatch):
    now = {"t": 0.0}
    monkeypatch.setattr(d.time, "time", lambda: now["t"])
    monkeypatch.setattr(d.time, "sleep", lambda s: now.update(t=now["t"] + s))
    monkeypatch.setattr(d.subprocess, "run", lambda *a, **k: SimpleNamespace(returncode=7, stdout="", stderr=""))
    assert d._wait_api_ready(timeout_sec=90) is False
    assert now["t"] <= 93


def test_rollback_also_pauses_the_guard(monkeypatch):
    commands = []
    monkeypatch.setattr(d, "get_vps_deploy_info", lambda p: {"current_sha": "9f9ec4b", "previous_sha": "4b1ff5f"})
    monkeypatch.setattr(d, "resolve_commit_sha", lambda repo, sha, lp=None: sha + "0" * 33)
    monkeypatch.setattr(d, "check_ssh_reachability", lambda **k: True)
    monkeypatch.setattr(d, "set_vps_image_tag", lambda *a: True)
    monkeypatch.setattr(d, "run_smoke_test", lambda **k: True)
    monkeypatch.setattr(d, "update_vps_deploy_info", lambda *a, **k: True)
    monkeypatch.setattr(d.time, "sleep", lambda s: None)
    monkeypatch.setattr(d.subprocess, "run", _recording_ssh(commands))

    assert d.rollback_docker("/opt/x", target_sha=None)
    assert _index(commands, "systemctl stop") < _index(commands, "docker compose up -d api worker") < _index(commands, "systemctl start")
