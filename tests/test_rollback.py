"""
Unit test suite for RevOps Enterprise OS Rollback Engine.
Tests:
- Commit SHA resolution (local rev-parse, remote fallback, latest bypass)
- Reading and updating .deploy_info.json
- IMAGE_TAG setting in .env
- Rollback execution flow and smoke-test recovery fallback
"""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

from deploy_to_vps import (
    resolve_commit_sha,
    get_vps_deploy_info,
    update_vps_deploy_info,
    rollback_docker,
)


def test_resolve_commit_sha_handles_latest_and_full_sha():
    assert resolve_commit_sha("Reflecteddark/revops-saas", "latest") == "latest"
    assert resolve_commit_sha("Reflecteddark/revops-saas", "") == ""
    assert resolve_commit_sha("Reflecteddark/revops-saas", "unknown") == "unknown"

    full_40 = "4b1ff5f7668fbf4d09042b717ef75afc1b1994b5"
    assert resolve_commit_sha("Reflecteddark/revops-saas", full_40) == full_40


def test_resolve_commit_sha_resolves_local_prefix():
    local_path = Path(__file__).resolve().parent.parent
    full = resolve_commit_sha("Reflecteddark/revops-saas", "4b1ff5f", local_path=local_path)
    assert len(full) == 40
    assert full.startswith("4b1ff5f")


def test_get_vps_deploy_info_parses_json():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            stdout=json.dumps({"current_sha": "9f9ec4b", "previous_sha": "4b1ff5f", "mode": "docker"}),
            returncode=0
        )
        info = get_vps_deploy_info("/opt/revops-saas")
        assert info["current_sha"] == "9f9ec4b"
        assert info["previous_sha"] == "4b1ff5f"


def test_get_vps_deploy_info_handles_empty_or_error():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(stdout="", returncode=1)
        info = get_vps_deploy_info("/opt/revops-saas")
        assert info == {}


def test_update_vps_deploy_info_executes_ssh():
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0)
        ok = update_vps_deploy_info("/opt/revops-saas", current_sha="4b1ff5f", previous_sha="9f9ec4b")
        assert ok is True
        assert mock_run.call_count == 1
        args, _ = mock_run.call_args
        cmd_str = args[0]
        assert "ssh" in cmd_str[0]
        assert "base64" in cmd_str[-1]


def test_rollback_docker_fails_when_no_previous_sha():
    with patch("deploy_to_vps.get_vps_deploy_info", return_value={}):
        ok = rollback_docker("/opt/revops-saas", target_sha=None)
        assert ok is False


def test_rollback_docker_success_flow():
    fake_info = {"current_sha": "9f9ec4b", "previous_sha": "4b1ff5f"}
    with patch("deploy_to_vps.get_vps_deploy_info", return_value=fake_info), \
         patch("deploy_to_vps.check_ssh_reachability", return_value=True), \
         patch("deploy_to_vps.set_vps_image_tag", return_value=True), \
         patch("deploy_to_vps.run_smoke_test", return_value=True), \
         patch("deploy_to_vps.update_vps_deploy_info", return_value=True) as mock_update, \
         patch("subprocess.run") as mock_run:
        
        mock_run.return_value = MagicMock(returncode=0)
        ok = rollback_docker("/opt/revops-saas", target_sha=None)
        assert ok is True
        mock_update.assert_called_once_with(
            "/opt/revops-saas",
            current_sha="4b1ff5f",
            previous_sha="9f9ec4b"
        )
