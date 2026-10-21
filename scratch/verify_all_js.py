import hashlib
import urllib.request

files = [
    'core.js',
    'calls.js',
    'charts.js',
    'deals.js',
    'admin.js',
    'settings.js',
    'analyst.js',
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Cache-Control': 'no-cache'}

print(f"{'FILE':<15} | {'LOCAL':<10} | {'REPORT (VPS)':<12} | {'AI-ROP (Vercel)':<15} | {'MATCH?'}")
print("-" * 75)

for f in files:
    with open(f'apps/web/js/{f}', 'rb') as fp:
        local_hash = hashlib.md5(fp.read()).hexdigest()[:8]
    
    # report.ai-rop.ru
    req1 = urllib.request.Request(f'https://report.ai-rop.ru/js/{f}', headers=headers)
    with urllib.request.urlopen(req1) as r1:
        rep_hash = hashlib.md5(r1.read()).hexdigest()[:8]

    # ai-rop.ru
    req2 = urllib.request.Request(f'https://ai-rop.ru/app/js/{f}', headers=headers)
    with urllib.request.urlopen(req2) as r2:
        air_hash = hashlib.md5(r2.read()).hexdigest()[:8]

    match = (local_hash == rep_hash == air_hash)
    status = "YES (100%)" if match else f"DIFF ({local_hash}/{rep_hash}/{air_hash})"
    print(f"{f:<15} | {local_hash:<10} | {rep_hash:<12} | {air_hash:<15} | {status}")
