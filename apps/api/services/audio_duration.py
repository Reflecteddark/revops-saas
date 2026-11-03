"""MP3 duration from frame headers (stdlib only).

Telephony recordings are typically 8-32 kbps (often MPEG-2.5, 8 kHz), so estimating duration from file size
with an assumed 128 kbps under-reports real calls 4x or more.
"""

_BITRATES = {  # Layer III, kbps
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],  # MPEG-1
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],  # MPEG-2 / 2.5
}
_SAMPLE_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_duration_seconds(data: bytes) -> int | None:
    """Duration in seconds, or None if `data` does not look like an MP3 (Layer III) stream."""
    i = 0
    if data[:3] == b"ID3" and len(data) >= 10:
        i = 10 + ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 | (data[8] & 0x7F) << 7 | (data[9] & 0x7F))
    limit = min(len(data) - 4, i + 64 * 1024)
    while i < limit:
        if data[i] == 0xFF and (data[i + 1] & 0xE0) == 0xE0:
            ver, layer = (data[i + 1] >> 3) & 3, (data[i + 1] >> 1) & 3
            br_idx, sr_idx = data[i + 2] >> 4, (data[i + 2] >> 2) & 3
            if ver != 1 and layer == 1 and 0 < br_idx < 15 and sr_idx < 3:  # valid Layer III header
                break
        i += 1
    else:
        return None

    bitrate = _BITRATES[1 if ver == 3 else 2][br_idx] * 1000
    sample_rate = _SAMPLE_RATES[ver][sr_idx]
    samples_per_frame = 1152 if ver == 3 else 576

    # Xing/Info header (VBR or LAME CBR) carries the exact frame count.
    head = data[i:i + 200]
    for tag in (b"Xing", b"Info"):
        pos = head.find(tag)
        if pos != -1 and len(head) >= pos + 12 and head[pos + 7] & 0x01:
            frames = int.from_bytes(head[pos + 8:pos + 12], "big")
            if frames > 0:
                return max(1, round(frames * samples_per_frame / sample_rate))

    return max(1, round((len(data) - i) * 8 / bitrate))
