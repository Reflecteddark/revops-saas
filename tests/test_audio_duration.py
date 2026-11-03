"""Call duration must come from the MP3 itself: telephony 32 kbps / 8 kHz files were stored as 25 s."""

from apps.api.services.audio_duration import mp3_duration_seconds

# MPEG-2.5 Layer III, 32 kbps, 8 kHz, mono (typical telephony recording): 288-byte frames, 576 samples
TEL_HDR = bytes([0xFF, 0xE3, 0x48, 0xC4])
TEL_FRAME = TEL_HDR + b"\x00" * 284
# MPEG-1 Layer III, 128 kbps, 44.1 kHz
HIFI_HDR = bytes([0xFF, 0xFB, 0x90, 0x44])


def test_telephony_cbr_duration():
    data = TEL_FRAME * 834  # 834 * 576 / 8000 = 60 s
    assert mp3_duration_seconds(data) == 60


def test_mpeg1_cbr_duration():
    data = HIFI_HDR + b"\x00" * (160000 - 4)  # 128 kbps * 10 s
    assert mp3_duration_seconds(data) == 10


def test_xing_frame_count_wins_over_size():
    xing = b"Xing" + (1).to_bytes(4, "big") + (1389).to_bytes(4, "big")  # 1389 * 576 / 8000 = 100 s
    first = TEL_HDR + b"\x00" * 9 + xing
    data = first + b"\x00" * (288 - len(first)) + TEL_FRAME * 10
    assert mp3_duration_seconds(data) == 100


def test_id3_tag_is_skipped():
    tag_body = b"\xFF\xFF\xFF\xFF" + b"\x00" * 96  # sync-like bytes inside the tag must be ignored
    id3 = b"ID3\x03\x00\x00" + bytes([0, 0, 0, len(tag_body)]) + tag_body
    assert mp3_duration_seconds(id3 + TEL_FRAME * 834) == 60


def test_not_mp3_returns_none():
    assert mp3_duration_seconds(b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 1000) is None
    assert mp3_duration_seconds(b"") is None
