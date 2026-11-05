"""
n8n workflow "Analysis of sales department calls": audit contract v2, the prompt (nodes 17, 17a, 17b, 17c).
Spec: docs/audit/spec_contract_v2.md section 2. The text is the one tried in the pilot: scripts/pilot/prompts/B_v2.txt
(harness_contract_v2_prompt.cjs compares the two line by line).

Usage: python3 patch_wf_contract_v2_prompt.py <exported.json> <patched.json>

Changes in every one of the four copies (they are identical, the script stops if they are not):
- the transcript is written with a new line per turn, signed "Менеджер:" / "Клиент:" (needed for CR11 by code);
- CR5, CR6, CR13 may be null (the situation did not come up), every other criterion is 0 or 1;
- evidence (why + quote per criterion), ended_by, reached_decision_maker;
- CR11 says 30% (the code counts it);
- responseSchema fixes the shape of the answer (null allowed in cr5, cr6, cr13 only). maxOutputTokens is NOT set: the
  "thinking" tokens count against it and the answer is cut off.
The tenant context block and the date stay as they are in the live prompt.
Every replacement asserts it matches exactly once: on a workflow that has changed the script stops, it never guesses.
"""

import json
import re
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
wf = wf[0] if isinstance(wf, list) else wf

nodes = [n for n in wf["nodes"] if re.match(r"17[abc]?\. ", n["name"])]
assert len(nodes) == 4, [n["name"] for n in nodes]
bodies = {n["parameters"]["jsonBody"] for n in nodes}
assert len(bodies) == 1, "the four Gemini nodes no longer carry the same prompt: look before patching"
body = bodies.pop()


def replace_once(old, new):
    global body
    assert body.count(old) == 1, (body.count(old), old[:70])
    body = body.replace(old, new)


replace_once(
    """1. Внимательно прослушать аудиозапись телефонного разговора и сделать дословную расшифровку (поле transcript) на русском языке.
2. Провести строгий 13-критериальный аудит звонка отдела продаж B2B по шкале cr1..cr13 (1 - зачет, 0 - дефект).
""",
    """1. Внимательно прослушать аудиозапись телефонного разговора и сделать дословную расшифровку (поле transcript) на русском языке.
   Каждая реплика с новой строки: «Менеджер: текст» или «Клиент: текст». Только эти две подписи, без номеров и имён: секретарь, администратор и любой другой собеседник менеджера — это «Клиент».
2. Провести строгий 13-критериальный аудит звонка отдела продаж B2B по шкале cr1..cr13.
   1 = менеджер выполнил критерий. 0 = должен был выполнить и не выполнил.
   null = ТОЛЬКО для cr5, cr6, cr13, если нужная ситуация в разговоре не возникла:
   - cr5: клиент не возражал по цене («дорого», «нет бюджета», «у других дешевле», «не потянем»). Простой вопрос о цене — не возражение.
   - cr6: клиент не откладывал решение: «подумаю», «посоветуюсь», «сам перезвоню», «пришлите на почту или в мессенджер», «передам руководителю или юристам», «посмотрим и вернёмся». Прямой отказ с понятной причиной — не откладывание, тогда null.
   - cr13: ни клиент, ни менеджер не упоминали скидку, процент от цены, выгоду за оплату вперёд, акцию, бесплатный период или другие уступки.
   Все остальные критерии — всегда 0 или 1, даже если разговор короткий: незавершённый этап — это 0.
3. Для каждого критерия указать в evidence: why — почему такая оценка (до 12 слов) и quote — дословная цитата из transcript до 20 слов, подтверждающая оценку. Если цитировать нечего (критерий не выполнен или null) — quote пустая строка.
""",
)
replace_once("(transcript, error_summary, ai_recommendation и др.)", "(transcript, evidence, error_summary, ai_recommendation и др.)")
replace_once("cr11: Слушание клиента (клиент говорит не менее 40% хронометража).", "cr11: Слушание клиента (клиент говорит не менее 30% хронометража).")
replace_once(
    '''  "cr1": 1, "cr2": 1, "cr3": 1, "cr4": 0, "cr5": 1, "cr6": 1, "cr7": 0, "cr8": 1, "cr9": 1, "cr10": 1, "cr11": 1, "cr12": 1, "cr13": 1,
''',
    '''  "cr1": 1, "cr2": 1, "cr3": 1, "cr4": 0, "cr5": null, "cr6": 1, "cr7": 0, "cr8": 1, "cr9": 1, "cr10": 1, "cr11": 1, "cr12": 1, "cr13": null,
  "evidence": {
    "cr1": {"why": "до 12 слов", "quote": "дословная цитата или пустая строка"},
    "...": "так для каждого из cr1..cr13"
  },
  "ended_by": "manager | client | unknown",
  "reached_decision_maker": true,
''',
)
replace_once(
    """        temperature: 0.1,
        responseMimeType: "application/json"
""",
    """        temperature: 0.1,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            transcript: { type: "STRING" },
            call_type: { type: "STRING" },
            manager_name: { type: "STRING" },
            client_name: { type: "STRING" },
            client_position: { type: "STRING" },
            client_niche: { type: "STRING" },
            cr1: { type: "INTEGER" }, cr2: { type: "INTEGER" }, cr3: { type: "INTEGER" }, cr4: { type: "INTEGER" },
            cr5: { type: "INTEGER", nullable: true }, cr6: { type: "INTEGER", nullable: true },
            cr7: { type: "INTEGER" }, cr8: { type: "INTEGER" }, cr9: { type: "INTEGER" }, cr10: { type: "INTEGER" },
            cr11: { type: "INTEGER" }, cr12: { type: "INTEGER" }, cr13: { type: "INTEGER", nullable: true },
            evidence: {
              type: "OBJECT",
              properties: Object.fromEntries(Array.from({ length: 13 }, (_, i) => ['cr' + (i + 1), {
                type: "OBJECT", properties: { why: { type: "STRING" }, quote: { type: "STRING" } }, required: ["why", "quote"]
              }])),
              required: Array.from({ length: 13 }, (_, i) => 'cr' + (i + 1))
            },
            ended_by: { type: "STRING" },
            reached_decision_maker: { type: "BOOLEAN", nullable: true },
            error_summary: { type: "STRING" },
            ai_recommendation: { type: "STRING" },
            amo_short_summary: { type: "STRING" },
            zoom_scheduled: { type: "BOOLEAN" }
          },
          required: ["transcript", "call_type", "cr1", "cr2", "cr3", "cr4", "cr5", "cr6", "cr7", "cr8", "cr9", "cr10", "cr11", "cr12", "cr13", "evidence", "error_summary", "ai_recommendation", "amo_short_summary"]
        }
""",
)

for n in nodes:
    n["parameters"]["jsonBody"] = body

json.dump([wf], open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("patched:", ", ".join(n["name"][:4].strip() for n in nodes))
