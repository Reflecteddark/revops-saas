"""
Unit test suite for Telegram Cloud Backup Engine:
- Archive creation with metadata manifest.json
- Multi-Part splitting (threshold-based 45 MB compliance)
- Chunk reassembly bit-for-bit integrity validation
- Single-part and multi-part upload workflow with simulated Bot API
"""

import os
import io
import json
import tarfile
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from scripts.telegram_backup_engine import (
    create_backup_archive,
    split_file_into_parts,
    send_backup_to_telegram,
    run_telegram_backup,
    MAX_PART_SIZE_BYTES
)


def test_create_backup_archive_contains_manifest():
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        archive_path = Path(tmp.name)

    try:
        manifest = create_backup_archive(archive_path)
        assert archive_path.exists()
        assert archive_path.stat().st_size > 0
        assert "timestamp" in manifest
        assert "files_included" in manifest

        # Inspect archive content
        with tarfile.open(archive_path, "r:gz") as tar:
            names = tar.getnames()
            assert "manifest.json" in names
            # Extract and verify manifest
            f = tar.extractfile("manifest.json")
            data = json.load(f)
            assert data["timestamp"] == manifest["timestamp"]
    finally:
        if archive_path.exists():
            archive_path.unlink()


def test_split_file_into_parts_and_reassembly():
    """Verifies that large files are chunked correctly and reassembled bit-for-bit."""
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        file_path = Path(tmp.name)
        # Create a 250 KB (5 * 50 KB) test binary payload
        test_data = b"X" * (250 * 1024)
        tmp.write(test_data)

    try:
        # Split into 50 KB chunks (max_bytes = 50 * 1024)
        chunk_size = 50 * 1024
        parts = split_file_into_parts(file_path, max_bytes=chunk_size)

        assert len(parts) == 5, f"Expected 5 parts, got {len(parts)}"
        for p in parts:
            assert p.exists()
            assert p.stat().st_size <= chunk_size

        # Reassemble parts
        reassembled_data = bytearray()
        for p in parts:
            reassembled_data.extend(p.read_bytes())

        assert bytes(reassembled_data) == test_data, "Reassembled binary payload does not match original"
    finally:
        if file_path.exists():
            file_path.unlink()
        for p in parts:
            if p.exists() and p != file_path:
                p.unlink()


def test_send_backup_single_part_when_under_limit():
    """Verifies single document send when archive is under chunk threshold."""
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        archive_path = Path(tmp.name)
        tmp.write(b"SMALL_BACKUP_TEST_PAYLOAD")

    manifest = {"created_at_human": "2026-10-21 12:00:00", "files_included": []}

    try:
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("requests.post", return_value=mock_resp) as mock_post:
            ok = send_backup_to_telegram(
                archive_path,
                manifest,
                bot_token="test_token",
                chat_id="123456",
                max_part_size=1024 * 1024  # 1 MB threshold
            )
            assert ok is True
            assert mock_post.call_count == 1
            # Check URL
            args, kwargs = mock_post.call_args
            assert "sendDocument" in args[0]
            assert kwargs["data"]["chat_id"] == "123456"
            assert "RevOps Cloud Backup" in kwargs["data"]["caption"]
    finally:
        if archive_path.exists():
            archive_path.unlink()


def test_send_backup_multipart_when_exceeding_limit():
    """Verifies multi-part series upload when archive exceeds chunk threshold."""
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        archive_path = Path(tmp.name)
        # 120 KB test file
        tmp.write(b"CHUNKED_TEST_PAYLOAD" * 6000)

    manifest = {"created_at_human": "2026-10-21 12:00:00", "files_included": []}

    try:
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch("requests.post", return_value=mock_resp) as mock_post:
            # Threshold = 30 KB -> 4 chunks
            ok = send_backup_to_telegram(
                archive_path,
                manifest,
                bot_token="test_token",
                chat_id="123456",
                max_part_size=30 * 1024
            )
            assert ok is True
            assert mock_post.call_count == 4
            # Verify captions include Part indicator and cat command
            for call in mock_post.call_args_list:
                caption = call[1]["data"]["caption"]
                assert "Multi-Part Backup" in caption
                assert "Команда склейки" in caption
    finally:
        if archive_path.exists():
            archive_path.unlink()
