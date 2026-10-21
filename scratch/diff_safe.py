import difflib
import urllib.request

with open('apps/web/index.html', 'r', encoding='utf-8') as f:
    local_lines = f.readlines()

req = urllib.request.Request('https://report.ai-rop.ru/', headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp:
    remote_lines = resp.read().decode('utf-8', errors='ignore').splitlines(keepends=True)

diff = list(difflib.unified_diff(remote_lines, local_lines, fromfile='remote', tofile='local', n=1))
print(f"Total diff lines: {len(diff)}")
for line in diff:
    safe = line.encode('ascii', errors='replace').decode('ascii')
    print(safe, end='')
