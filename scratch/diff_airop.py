import difflib
import urllib.request

with open('app/index.html', 'r', encoding='utf-8') as f:
    local_lines = f.readlines()

req = urllib.request.Request('https://ai-rop.ru/app', headers={'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache'})
with urllib.request.urlopen(req) as resp:
    remote_lines = resp.read().decode('utf-8', errors='ignore').splitlines(keepends=True)

diff = list(difflib.unified_diff(remote_lines, local_lines, fromfile='remote', tofile='local', n=1))
print(f"Total diff lines between ai-rop.ru/app and local app/index.html: {len(diff)}")
for line in diff[:30]:
    safe = line.encode('ascii', errors='replace').decode('ascii')
    print(safe, end='')
