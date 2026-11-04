# -*- coding: utf-8 -*-
"""
Playing the recording of a call in the cabinet: GET /calls/{id}/audio.

The browser never gets the stored link: it may be a signed link of the telephony provider, and an <audio> element
cannot send our login anyway. The server fetches the file on the user's behalf:
- a file in our own storage (/calls/audio/<random name>) is served from disk;
- a link to somewhere else is proxied. The link comes from the CRM, not from the user, but the CRM data is still
  outside our control, so the proxy takes https only, only public addresses (every address the name resolves to,
  also after each redirect), no CRM tokens, a size cap and no HTML (a login page of the provider is not a recording).
Known gap: the name is resolved once for the check and once for the connection (DNS rebinding). The link is written by
our own n8n flow, so this is not worth pinning connections for.
"""

import asyncio
import ipaddress
import socket
from collections.abc import AsyncIterator
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx

MAX_BYTES = 80 * 1024 * 1024
MAX_REDIRECTS = 3
LOCAL_PREFIXES = ("/api/v1/calls/audio/", "/calls/audio/")
PASS_HEADERS = ("content-length", "content-range", "accept-ranges")
NOT_AUDIO = ("text/", "application/json", "application/xml", "application/xhtml")


class AudioUnavailable(Exception):
    """The recording cannot be played: no link, a closed link, a forbidden address, not an audio file."""


def local_file(url: str, storage_dir: Path) -> Path | None:
    """The file of our own storage that the link points to, if it is there."""
    path = urlsplit(url).path
    if not path.startswith(LOCAL_PREFIXES):
        return None
    name = Path(path).name
    candidate = storage_dir / name
    return candidate if name and candidate.is_file() else None


def _is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%")[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_global


async def assert_public_https(url: str) -> None:
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise AudioUnavailable("only plain https links are played")
    try:
        if parts.port not in (None, 443):
            raise AudioUnavailable("only the standard https port is allowed")
        infos = await asyncio.get_running_loop().getaddrinfo(parts.hostname, 443, type=socket.SOCK_STREAM)
        addresses = {str(info[4][0]) for info in infos}
    except (OSError, ValueError) as err:
        raise AudioUnavailable(f"the address cannot be resolved: {err}") from err
    if not addresses or not all(_is_public(a) for a in addresses):
        raise AudioUnavailable("the link points to a non-public address")


async def open_remote(url: str, range_header: str | None = None) -> tuple[httpx.Response, httpx.AsyncClient]:
    """The opened (not yet read) response of the recording. The caller closes both through stream_body."""
    client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, read=30.0), follow_redirects=False)
    try:
        headers = {"Accept-Encoding": "identity", **({"Range": range_header} if range_header else {})}
        resp: httpx.Response | None = None
        for _ in range(MAX_REDIRECTS + 1):
            await assert_public_https(url)
            resp = await client.send(client.build_request("GET", url, headers=headers), stream=True)
            if resp.status_code not in (301, 302, 303, 307, 308):
                break
            location = resp.headers.get("location")
            await resp.aclose()
            if not location:
                raise AudioUnavailable("redirect without a target")
            url, resp = urljoin(url, location), None
        if resp is None:
            raise AudioUnavailable("too many redirects")
        ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
        too_big = resp.headers.get("content-length", "").isdigit() and int(resp.headers["content-length"]) > MAX_BYTES
        if resp.status_code not in (200, 206) or ctype.startswith(NOT_AUDIO) or too_big:
            await resp.aclose()
            raise AudioUnavailable(f"the storage answered {resp.status_code} {ctype or 'without a type'}")
        return resp, client
    except httpx.HTTPError as err:
        await client.aclose()
        raise AudioUnavailable(f"the storage is not reachable: {err}") from err
    except AudioUnavailable:
        await client.aclose()
        raise


def response_headers(resp: httpx.Response) -> dict[str, str]:
    return {h: resp.headers[h] for h in PASS_HEADERS if h in resp.headers}


def media_type(resp: httpx.Response) -> str:
    ctype = resp.headers.get("content-type", "").split(";")[0].strip().lower()
    return ctype if ctype.startswith("audio/") else "audio/mpeg"


async def stream_body(resp: httpx.Response, client: httpx.AsyncClient) -> AsyncIterator[bytes]:
    sent = 0
    try:
        async for chunk in resp.aiter_bytes(65536):
            sent += len(chunk)
            if sent > MAX_BYTES:
                break
            yield chunk
    except httpx.HTTPError:
        return
    finally:
        await resp.aclose()
        await client.aclose()
