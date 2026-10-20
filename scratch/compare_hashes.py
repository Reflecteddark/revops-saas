import hashlib
import urllib.request

with open('apps/web/index.html', 'rb') as f:
    local_bytes = f.read()
local_hash = hashlib.md5(local_bytes).hexdigest()
print(f"Local apps/web/index.html: length={len(local_bytes)}, md5={local_hash}")

req = urllib.request.Request('https://report.ai-rop.ru/', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    remote_bytes = resp.read()
remote_hash = hashlib.md5(remote_bytes).hexdigest()
print(f"Remote report.ai-rop.ru/:   length={len(remote_bytes)}, md5={remote_hash}")

print(f"Identical HTML: {local_hash == remote_hash}")
