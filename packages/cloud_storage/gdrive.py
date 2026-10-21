"""
Google Drive Cloud Storage Client for RevOps Enterprise OS.
Zero-Footprint Storage Engine for Backups, Call Audio, and Reports.
Uses Service Account authentication with no extra heavyweight dependencies.
"""

import io
import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import requests
from google.auth.transport.requests import Request
from google.oauth2 import service_account

logger = logging.getLogger("cloud_storage.gdrive")

DEFAULT_ROOT_FOLDER_ID = os.getenv("GDRIVE_ROOT_FOLDER_ID", "1WIxLFFnKsqRWxQ0cZ_hZBHu3be2REkI2")
DRIVE_SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file"
]

_TOKEN_CACHE: Dict[str, Any] = {
    "token": None,
    "expiry": 0
}


def find_service_account_path() -> Optional[Path]:
    """Finds service_account.json across standard project and VPS paths."""
    env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS") or os.getenv("SERVICE_ACCOUNT_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)

    candidates = [
        Path(__file__).resolve().parent.parent.parent / "service_account.json",
        Path(__file__).resolve().parent.parent.parent.parent / "revops-enterprise-os" / "service_account.json",
        Path.home() / ".gemini" / "antigravity" / "scratch" / "revops-enterprise-os" / "service_account.json",
        Path("/opt/revops-enterprise-os/service_account.json"),
        Path("/opt/my_ai_crew/service_account.json"),
        Path("/opt/revops-saas/service_account.json"),
        Path("service_account.json"),
    ]
    for c in candidates:
        if c.exists():
            return c
    return None


def get_drive_auth_headers() -> Dict[str, str]:
    """Acquires OAuth2 Bearer token from Service Account credentials."""
    now = time.time()
    if _TOKEN_CACHE["token"] and (now < _TOKEN_CACHE["expiry"] - 60):
        return {"Authorization": f"Bearer {_TOKEN_CACHE['token']}"}

    sa_path = find_service_account_path()
    if not sa_path:
        raise FileNotFoundError("service_account.json not found in candidate paths")

    creds = service_account.Credentials.from_service_account_file(
        str(sa_path),
        scopes=DRIVE_SCOPES
    )
    creds.refresh(Request())
    _TOKEN_CACHE["token"] = creds.token
    _TOKEN_CACHE["expiry"] = now + 3500
    return {"Authorization": f"Bearer {creds.token}"}


def ensure_subfolder(folder_name: str, parent_id: str = DEFAULT_ROOT_FOLDER_ID) -> str:
    """
    Ensures a subfolder with folder_name exists under parent_id on Google Drive.
    Returns the folder ID.
    """
    headers = get_drive_auth_headers()
    # 1. Search existing subfolder
    q = f"'{parent_id}' in parents and name = '{folder_name}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    res = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers=headers,
        params={"q": q, "fields": "files(id, name)"},
        timeout=10
    )
    if res.status_code == 200:
        files = res.json().get("files", [])
        if files:
            return files[0]["id"]

    # 2. Create subfolder if missing
    create_payload = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id]
    }
    create_res = requests.post(
        "https://www.googleapis.com/drive/v3/files",
        headers={**headers, "Content-Type": "application/json"},
        json=create_payload,
        timeout=10
    )
    create_res.raise_for_status()
    folder_id = create_res.json()["id"]
    logger.info(f"Created Google Drive subfolder '{folder_name}' (ID: {folder_id})")
    return folder_id


def upload_file_to_drive(
    content: Union[str, Path, bytes, io.BytesIO],
    filename: str,
    folder_id: str = DEFAULT_ROOT_FOLDER_ID,
    mime_type: str = "application/octet-stream"
) -> Dict[str, Any]:
    """
    Uploads a file to Google Drive using standard multipart upload.
    Returns file metadata including web_view_link.
    """
    headers = get_drive_auth_headers()

    # Read binary content
    if isinstance(content, (str, Path)):
        with open(content, "rb") as f:
            file_bytes = f.read()
    elif isinstance(content, io.BytesIO):
        file_bytes = content.getvalue()
    elif isinstance(content, bytes):
        file_bytes = content
    else:
        raise ValueError("Unsupported content type for upload")

    metadata = {
        "name": filename,
        "parents": [folder_id]
    }

    # Multipart boundary upload
    boundary = f"===============revops_upload_{int(time.time()*1000)}=="
    delimiter = f"--{boundary}\r\n".encode("utf-8")
    close_delimiter = f"\r\n--{boundary}--\r\n".encode("utf-8")

    meta_part = (
        f"Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
    ).encode("utf-8")

    data_header = (
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode("utf-8")

    body = delimiter + meta_part + delimiter + data_header + file_bytes + close_delimiter

    upload_headers = {
        **headers,
        "Content-Type": f"multipart/related; boundary={boundary}",
        "Content-Length": str(len(body))
    }

    res = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink",
        headers=upload_headers,
        data=body,
        timeout=60
    )
    res.raise_for_status()
    data = res.json()
    file_id = data.get("id")
    web_link = data.get("webViewLink") or f"https://drive.google.com/file/d/{file_id}/view"
    
    logger.info(f"Successfully uploaded {filename} ({len(file_bytes)} bytes) to Google Drive: {web_link}")
    return {
        "id": file_id,
        "name": filename,
        "size": len(file_bytes),
        "web_view_link": web_link,
        "folder_id": folder_id
    }


def list_drive_files(folder_id: str = DEFAULT_ROOT_FOLDER_ID, max_results: int = 50) -> List[Dict[str, Any]]:
    """Lists non-trashed files in folder."""
    headers = get_drive_auth_headers()
    q = f"'{folder_id}' in parents and trashed = false"
    res = requests.get(
        "https://www.googleapis.com/drive/v3/files",
        headers=headers,
        params={"q": q, "fields": "files(id, name, mimeType, size, createdTime, webViewLink)", "pageSize": str(max_results)},
        timeout=15
    )
    res.raise_for_status()
    return res.json().get("files", [])


def delete_drive_file(file_id: str) -> bool:
    """Permanently deletes a file from Google Drive."""
    headers = get_drive_auth_headers()
    res = requests.delete(
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        headers=headers,
        timeout=10
    )
    return res.status_code in (200, 204)
