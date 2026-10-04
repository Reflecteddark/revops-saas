import json
import openpyxl

wb = openpyxl.load_workbook(
    r'C:\Users\strel\.gemini\antigravity\scratch\revops-enterprise-os\presentation\RevOps_Platform_V17.6_Clean_Client_Starter.xlsx',
    data_only=True
)

tests = json.load(open('tests_v17_dump.json', encoding='utf-8'))
with open('tests_summary.txt', 'w', encoding='utf-8') as f:
    for t in tests:
        line = f"{t['id']}: [{t['cat']}] {t['desc']} == {t['expected']} (Formula: {t['formula']})\n"
        f.write(line)

print(f"Successfully processed {len(tests)} tests into tests_summary.txt")
