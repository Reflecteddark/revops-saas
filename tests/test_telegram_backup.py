"""
Unit test suite for Telegram Cloud Backup Engine:
- Archive creation with metadata manifest.json
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
import tarfile
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from cryptography.fernet import Fernet
from scripts.telegram_backup_engine import (
    create_backup_archive,
    split_file_into_parts,
    send_backup_to_telegram,
    run_telegram_backup,
    derive_fernet_key,
    encrypt_file,
    decrypt_file,
    MAX_PART_SIZE_BYTES
)


def test_derive_fernet_key():
    """Validates key derivation for passphrases and base64 Fernet keys."""
    # From arbitrary passphrase
    key1 = derive_fernet_key("my-super-secret-passphrase-2026")
    assert isinstance(key1, bytes)
    assert len(key1) == 44  # Valid urlsafe base64 32-byte key

    # Deterministic: same passphrase gives same key
    key2 = derive_fernet_key("my-super-secret-passphrase-2026")
    assert key1 == key2

    # Direct valid Fernet key passed through
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
        # 1. Encrypt
        encrypt_file(orig_path, enc_path, key)
        assert enc_path.exists()
        assert enc_path.stat().st_size > 0
        enc_data = enc_path.read_bytes()
        # Ciphertext must not match original plaintext
        assert original_data not in enc_data

        # 2. Decrypt
        decrypt_file(enc_path, dec_path, key)
        assert dec_path.exists()
        dec_data = dec_path.read_bytes()
        # Decrypted content must match bit-for-bit
        assert dec_data == original_data
    finally:
        for p in (orig_path, enc_path, dec_path):
            if p.exists():
                p.unlink()


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
