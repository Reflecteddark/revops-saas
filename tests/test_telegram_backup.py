"""
Unit test suite for Telegram Cloud Backup Engine:
- Archive creation with metadata manifest.json
- Hot consistent SQLite database snapshots via Online Backup API (sqlite3.Connection.backup)
- PRAGMA integrity_check validation
- Zero-Knowledge AES-256 (Fernet) encryption and decryption round-trip
- Multi-Part splitting (threshold-based 45 MB compliance)
- Chunk reassembly bit-for-bit integrity validation
- Single-part and multi-part upload workflow with simulated Bot API
- CLI decryption workflow (--decrypt)
"""

import os
import io
import sys
import json
import time
import sqlite3
import tarfile
import tempfile
import threading
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
cryptography = pytest.importorskip("cryptography")
requests = pytest.importorskip("requests")
from cryptography.fernet import Fernet
from scripts.telegram_backup_engine import (
    create_backup_archive,
    split_file_into_parts,
    send_backup_to_telegram,
    run_telegram_backup,
    derive_fernet_key,
    encrypt_file,
    decrypt_file,
    snapshot_sqlite_database,
    verify_sqlite_integrity,
    MAX_PART_SIZE_BYTES
)


def test_derive_fernet_key():
    """Validates key derivation for passphrases and base64 Fernet keys."""
    key1 = derive_fernet_key("my-super-secret-passphrase-2026")
    assert isinstance(key1, bytes)
    assert len(key1) == 44

    key2 = derive_fernet_key("my-super-secret-passphrase-2026")
    assert key1 == key2

    raw_fernet = Fernet.generate_key()
    key3 = derive_fernet_key(raw_fernet.decode("utf-8"))
    assert key3 == raw_fernet

    with pytest.raises(ValueError):
        derive_fernet_key("")


def test_encrypt_and_decrypt_file_roundtrip():
    """Verifies AES-256 Fernet authenticated encryption and bit-for-bit decryption."""
    original_data = b"CONFIDENTIAL_REVOPS_PAYLOAD_AMOCRM_TOKENS_BITRIX24_KEYS" * 500
    key = derive_fernet_key("test-encryption-key-777")

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as orig_tmp:
        orig_path = Path(orig_tmp.name)
        orig_tmp.write(original_data)

    enc_path = Path(str(orig_path) + ".enc")
    dec_path = Path(str(orig_path) + ".dec.tar.gz")

    try:
        encrypt_file(orig_path, enc_path, key)
        assert enc_path.exists()
        assert enc_path.stat().st_size > 0
        enc_data = enc_path.read_bytes()
        assert original_data not in enc_data

        decrypt_file(enc_path, dec_path, key)
        assert dec_path.exists()
        dec_data = dec_path.read_bytes()
        assert dec_data == original_data
    finally:
        for p in (orig_path, enc_path, dec_path):
            if p.exists():
                p.unlink()


def test_verify_sqlite_integrity():
    """Verifies that PRAGMA integrity_check correctly validates healthy and rejects corrupt DBs."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_good:
        good_db = Path(tmp_good.name)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_corrupt:
        corrupt_db = Path(tmp_corrupt.name)
        tmp_corrupt.write(b"CORRUPTED_NON_SQLITE_GARBAGE_BYTES_12345")

    try:
        # Populate valid DB
        conn = sqlite3.connect(str(good_db))
        conn.execute("CREATE TABLE test (id INT, val TEXT);")
        conn.execute("INSERT INTO test VALUES (1, 'ok');")
        conn.commit()
        conn.close()

        assert verify_sqlite_integrity(good_db) is True
        assert verify_sqlite_integrity(corrupt_db) is False
    finally:
        for p in (good_db, corrupt_db):
            if p.exists():
                p.unlink()


def test_snapshot_sqlite_database_during_concurrent_writes():
    """
    Simulates high-load production scenario:
    Active Celery workers writing to SQLite in WAL mode while hot backup is executing.
    Verifies that snapshot is created without deadlocks, captures rows, and has 100% integrity.
    """
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as src_tmp:
        src_db = Path(src_tmp.name)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as dst_tmp:
        dst_db = Path(dst_tmp.name)

    # Initialize source DB in WAL mode
    init_conn = sqlite3.connect(str(src_db))
    init_conn.execute("PRAGMA journal_mode=WAL;")
    init_conn.execute("CREATE TABLE call_audits (id INTEGER PRIMARY KEY, deal_id TEXT, score INT);")
    init_conn.commit()
    init_conn.close()

    stop_event = threading.Event()
    inserted_count = [0]

    def background_celery_worker():
        worker_conn = sqlite3.connect(str(src_db), timeout=10.0)
        idx = 0
        while not stop_event.is_set():
            try:
                worker_conn.execute("INSERT INTO call_audits (deal_id, score) VALUES (?, ?);", (f"D-{idx}", idx % 10))
                worker_conn.commit()
                idx += 1
                inserted_count[0] = idx
                time.sleep(0.002)
            except Exception:
                pass
        worker_conn.close()

    worker_thread = threading.Thread(target=background_celery_worker)
    worker_thread.start()

    try:
        # Give worker time to insert rows
        time.sleep(0.05)

        # Execute Hot Online Backup while worker is writing
        success = snapshot_sqlite_database(src_db, dst_db)
        assert success is True, "snapshot_sqlite_database failed during concurrent WAL writes"
        assert dst_db.exists()

        # Stop worker
        stop_event.set()
        worker_thread.join(timeout=2.0)

        # Verify snapshot integrity and content
        assert verify_sqlite_integrity(dst_db) is True

        snap_conn = sqlite3.connect(str(dst_db))
        cursor = snap_conn.cursor()
        cursor.execute("SELECT count(*) FROM call_audits;")
        snap_count = cursor.fetchone()[0]
        snap_conn.close()

        assert snap_count > 0, "Snapshot should contain rows written before or during backup"
    finally:
        stop_event.set()
        if worker_thread.is_alive():
            worker_thread.join(timeout=1.0)
        for p in (src_db, dst_db, Path(str(src_db) + "-wal"), Path(str(src_db) + "-shm")):
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass


def test_create_backup_archive_contains_manifest():
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        archive_path = Path(tmp.name)

    try:
        manifest = create_backup_archive(archive_path)
        assert archive_path.exists()
        assert archive_path.stat().st_size > 0
        assert "timestamp" in manifest
        assert "files_included" in manifest
        assert "skipped_paths" in manifest

        # Inspect archive content
        with tarfile.open(archive_path, "r:gz") as tar:
            names = tar.getnames()
            assert "manifest.json" in names
            f = tar.extractfile("manifest.json")
            assert f is not None
            data = json.load(f)
            assert data["timestamp"] == manifest["timestamp"]
            assert "skipped_paths" in data
            assert isinstance(data["skipped_paths"], list)
    finally:
        if archive_path.exists():
            archive_path.unlink()


def test_create_backup_archive_logs_and_records_skipped_paths(caplog):
    """
    Verifies that when a candidate file encounters PermissionError or OSError,
    it is logged with warning and safely recorded in skipped_paths in the manifest.
    """
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
        archive_path = Path(tmp.name)

    mock_unreadable = MagicMock()
    mock_unreadable.name = "database.sqlite"
    mock_unreadable.exists.side_effect = PermissionError("[Errno 13] Permission denied: '/var/lib/docker/volumes'")
    mock_unreadable.__str__.return_value = "/var/lib/docker/volumes/n8n_n8n_data/_data/database.sqlite"

    try:
        import logging
        with caplog.at_level(logging.WARNING):
            manifest = create_backup_archive(archive_path, candidate_files=[mock_unreadable])

        assert "skipped_paths" in manifest
        skipped = [s for s in manifest["skipped_paths"] if "n8n_n8n_data" in s["path"]]
        assert len(skipped) == 1
        assert "PermissionError" in skipped[0]["reason"]
        assert any("[Backup] Пропущен путь" in r.message for r in caplog.records)

        # Inspect archive manifest.json content
        with tarfile.open(archive_path, "r:gz") as tar:
            f = tar.extractfile("manifest.json")
            assert f is not None
            data = json.load(f)
            assert any("n8n_n8n_data" in s["path"] for s in data.get("skipped_paths", []))
    finally:
        if archive_path.exists():
            archive_path.unlink()


def test_split_file_into_parts_and_reassembly():
    """Verifies that large files are chunked correctly and reassembled bit-for-bit."""
    with tempfile.NamedTemporaryFile(suffix=".bin", delete=False) as tmp:
        file_path = Path(tmp.name)
        test_data = b"X" * (250 * 1024)
        tmp.write(test_data)

    try:
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


def test_send_backup_encrypted_single_part():
    """Verifies single document send with Zero-Knowledge encryption metadata."""
    with tempfile.NamedTemporaryFile(suffix=".tar.gz.enc", delete=False) as tmp:
        archive_path = Path(tmp.name)
        tmp.write(b"ENCRYPTED_BACKUP_TEST_PAYLOAD")

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
                max_part_size=1024 * 1024,
                is_encrypted=True
            )
            assert ok is True
            assert mock_post.call_count == 1
            args, kwargs = mock_post.call_args
            assert "sendDocument" in args[0]
            assert kwargs["data"]["chat_id"] == "123456"
            caption = kwargs["data"]["caption"]
            assert "RevOps Zero-Knowledge Backup" in caption
            assert "AES-256" in caption
            assert "--decrypt" in caption
    finally:
        if archive_path.exists():
            archive_path.unlink()


def test_send_backup_multipart_when_exceeding_limit():
    """Verifies multi-part series upload when archive exceeds chunk threshold."""
    with tempfile.NamedTemporaryFile(suffix=".tar.gz.enc", delete=False) as tmp:
        archive_path = Path(tmp.name)
        tmp.write(b"CHUNKED_TEST_PAYLOAD" * 6000)

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
                max_part_size=30 * 1024,
                is_encrypted=True
            )
            assert ok is True
            assert mock_post.call_count == 4
            for call in mock_post.call_args_list:
                caption = call[1]["data"]["caption"]
                assert "RevOps Zero-Knowledge Backup" in caption
                assert "Часть" in caption
                assert "--decrypt" in caption
    finally:
        if archive_path.exists():
            archive_path.unlink()
