"""
n8n workflow "Analysis of sales department calls": node 18 and an answer without a transcript.

Usage: python3 patch_wf_node18_empty_transcript.py <exported.json> <patched.json> [<node_check.js>]

Found by the pilot (2026-11-04): a real talk of 1298 words (TNT-004, 11 minutes) was stored as a missed call with an
empty transcript, and its second run gave the full talk. Two causes are closed:
1. Gemini answers sometimes arrive as an array `[{...}]`. Node 18 read the fields of the array (all missing), so the
   transcript was empty. The object inside the array is read now.
2. An empty transcript made the call "not answered" (fewer than 20 words) whatever the CRM duration said. A call the
   CRM says lasted 15 seconds or more, with no transcript, and which the model did not call a missed call itself, is
   a broken answer, not a missed call: it is a failed audit ("Сбой анализа"), so the talk is not lost silently and
   does not count as "nobody talked". A real missed call stays one: the model says 'Недозвон' / 'lost_ivr', or the
   CRM duration is under 15 seconds.

Every replacement asserts it matches exactly once: on a workflow that has changed the script stops, it never guesses.
"""

import json
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
wf = wf[0] if isinstance(wf, list) else wf
found = [x for x in wf["nodes"] if x["name"].startswith("18. ")]
assert len(found) == 1
n18 = found[0]
J = "jsCode"


def replace_once(old, new):
    c = n18["parameters"][J]
    assert c.count(old) == 1, (c.count(old), old[:70])
    n18["parameters"][J] = c.replace(old, new)


replace_once("  // Calculate Accurate Call Timestamp & Moscow Timezone\n", """  // Gemini sometimes wraps the answer in an array: [{...}]. Read the object inside, not the missing fields of the array.
  if (Array.isArray(data)) data = data.find((x) => x && typeof x === 'object' && !Array.isArray(x)) || {};
  if (!data || typeof data !== 'object') data = {};

  // Calculate Accurate Call Timestamp & Moscow Timezone
""")

replace_once("  const isUnanswered = Boolean(\n", """  // No transcript at all, the CRM says there was a talk (15 s or more) and the model did not call it a missed call:
  // the answer is broken, not the call. It used to be filed as "not answered" and its talk was lost.
  const modelSaidMissed = data.call_type === 'Недозвон' || data.call_type === 'lost_ivr';
  const emptyTranscript = wordCount === 0 && !modelSaidMissed && !(durationSec > 0 && durationSec < 15);
  const isUnanswered = !emptyTranscript && Boolean(
""")

replace_once("  const isAuditFailed = data.error_summary === 'JSON parse error from Gemini response';\n",
             "  const isAuditFailed = data.error_summary === 'JSON parse error from Gemini response' || emptyTranscript;\n")

json.dump([wf], open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if len(sys.argv) > 3:  # for `node --check`: a Code node body is an async function body
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        f.write("(async function () {\n" + n18["parameters"][J] + "\n})\n")

print("patched:", n18["name"][:20])
