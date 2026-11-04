"""
n8n workflow "Analysis of sales department calls": audit contract v2, scoring side (nodes 18 and 18b).
Spec: docs/audit/spec_contract_v2.md, sections 3 and 4.

Usage: python3 patch_wf_contract_v2_scoring.py <exported.json> <patched.json> [<node_check.js>]

Node 18 (scores the answer of the model):
- CR5, CR6, CR13 may be `null` ("the situation did not come up in the talk"); such a criterion is not counted. Any other
  criterion, and a missing field, is 0 or 1 as before. passed = the ones, applicable = 13 minus the nulls,
  total_score = round(13 * passed / applicable), so scores stay comparable and the 9/6 bands stay the same.
- CR11 is counted by code: the share of the client's words in the transcript is at least 30%. The model put 1 almost
  always. Needs the labels "Менеджер:" and "Клиент:"; without them (or with one role only) the answer of the model stays.
- evidence (why + quote per criterion): texts are cut, a quote that is not found in the transcript is dropped.
- new fields: passed, applicable, evidence, evidence_unverified, ended_by, reached_decision_maker, audit_model
  (modelVersion of the answer), audit_version 2, summary, audio_url.
- the CRM note says "(оценено N из 13)" when something did not apply.
- manager_skill_cluster uses the bands of the cabinet (9 / 6); no more invented deal id "D-100+i".
Node 18b sends the new fields to /calls/ingest.

Nothing changes for an answer of the old prompt (it never returns null) except CR11, which follows the 30% rule.
Every replacement asserts it matches exactly once: on a workflow that has changed the script stops, it never guesses.
"""

import json
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
wf = wf[0] if isinstance(wf, list) else wf
J = "jsCode"


def node(prefix):
    found = [x for x in wf["nodes"] if x["name"].startswith(prefix)]
    assert len(found) == 1, (prefix, len(found))
    return found[0]


n18 = node("18. ")
n18b = node("18b.")


def replace_once(old, new, target=n18, key=J):
    c = target["parameters"][key]
    assert c.count(old) == 1, (c.count(old), old[:70])
    target["parameters"][key] = c.replace(old, new)


# --- no invented deal id
replace_once(
    ": currentLeadId) || ('D-' + (100 + i)));",
    ": currentLeadId) || '');",
)

# --- helper: the share of the client's words
replace_once(
    "const nowIso = new Date()",
    r"""// Share of the client's words in a transcript labelled "Менеджер:" / "Клиент:" (also "Клиент 2:"). null when a role has no
// label: then the answer of the model stays.
const clientWordShare = (text) => {
  const t = String(text || '');
  const marks = [...t.matchAll(/(Менеджер|Клиент(?: \d+)?)\s*:/g)];
  if (!marks.some((m) => m[1] === 'Менеджер') || !marks.some((m) => m[1] !== 'Менеджер')) return null;
  let manager = 0;
  let client = 0;
  marks.forEach((m, k) => {
    const end = k + 1 < marks.length ? marks[k + 1].index : t.length;
    const n = t.slice(m.index + m[0].length, end).split(/\s+/).filter(Boolean).length;
    if (m[1] === 'Менеджер') manager += n; else client += n;
  });
  return manager + client > 0 ? client / (manager + client) : null;
};
const nowIso = new Date()""",
)

# --- the criteria and the score
replace_once(
    """  // Score evaluation
  let totalScore = 0;
  let cr = {};
  for (let c = 1; c <= 13; c++) {
    const key = 'cr' + c;
    if (isUnanswered) {
      cr[key] = 0;
    } else {
      cr[key] = (data[key] === 1 || data[key] === '1' || data[key] === true) ? 1 : 0;
      totalScore += cr[key];
    }
  }
""",
    """  // Score evaluation (audit contract v2). CR5, CR6, CR13 may be null: the situation did not come up in the talk, the
  // criterion is not counted at all. Everything else, and a missing field, is 0 or 1. The score is brought to 13.
  const MAY_NOT_APPLY = ['cr5', 'cr6', 'cr13'];
  const clientShare = isUnanswered ? null : clientWordShare(transcriptText);
  let passed = 0;
  let applicable = 0;
  let cr = {};
  for (let c = 1; c <= 13; c++) {
    const key = 'cr' + c;
    if (isUnanswered) {
      cr[key] = 0;
    } else if (data[key] === null && MAY_NOT_APPLY.includes(key)) {
      cr[key] = null;
    } else {
      cr[key] = (data[key] === 1 || data[key] === '1' || data[key] === true) ? 1 : 0;
      // CR11 "listening": the client says at least 30% of the words. The model put 1 almost always.
      if (key === 'cr11' && clientShare !== null) cr[key] = clientShare >= 0.3 ? 1 : 0;
      passed += cr[key];
      applicable += 1;
    }
  }
  const totalScore = isUnanswered ? 0 : Math.round(13 * passed / applicable);

  // Reasons and quotes of the AI. A quote that is not in the transcript is dropped: an invented quote is worse than none.
  const normText = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^\\p{L}\\p{N}\\s]/gu, ' ').replace(/\\s+/g, ' ').trim();
  const transNorm = normText(transcriptText);
  const evidence = {};
  let evidenceUnverified = 0;
  if (!isUnanswered && !emptyTranscript && data.evidence && typeof data.evidence === 'object' && !Array.isArray(data.evidence)) {
    for (let c = 1; c <= 13; c++) {
      const e = data.evidence['cr' + c];
      if (!e || typeof e !== 'object') continue;
      const why = String(e.why || '').trim().slice(0, 400);
      let quote = String(e.quote || '').trim().slice(0, 400);
      if (quote) {
        const q = normText(quote);
        if (!q || !transNorm.includes(q)) { quote = ''; evidenceUnverified += 1; }
      }
      if (why || quote) evidence['cr' + c] = { why, quote };
    }
    if (evidenceUnverified) console.log(`[NODE 18] call ${currentCallId}: ${evidenceUnverified} quote(s) not found in the transcript, dropped`);
  }
""",
)

# --- the CRM notes say how the score was counted
replace_once(
    "  let nextStepLine = noScoreText ?",
    "  if (!noScoreText && applicable < 13) scoreBadge += ` (оценено ${applicable} из 13)`;\n  let nextStepLine = noScoreText ?",
)
replace_once(
    "(Оценка: ${noScoreText || (totalScore + '/13')})",
    "(Оценка: ${noScoreText || (totalScore + '/13' + (applicable < 13 ? ', оценено ' + applicable + ' из 13' : ''))})",
)

# --- bands of the cabinet
replace_once(
    "totalScore >= 11 ? 'Senior' : (totalScore >= 8 ? 'Middle' : 'Junior')",
    "totalScore >= 9 ? 'Senior' : (totalScore >= 6 ? 'Middle' : 'Junior')",
)

# --- new fields
replace_once(
    """      audit_failed: isAuditFailed ? 1 : 0,
      client_name: data.client_name || 'Клиент'
""",
    """      audit_failed: isAuditFailed ? 1 : 0,
      client_name: data.client_name || 'Клиент',
      // audit contract v2 (docs/audit/spec_contract_v2.md)
      passed: isUnanswered ? null : passed,
      applicable: isUnanswered ? null : applicable,
      evidence: Object.keys(evidence).length ? evidence : null,
      evidence_unverified: evidenceUnverified,
      ended_by: String(data.ended_by || '').trim().slice(0, 40) || null,
      reached_decision_maker: typeof data.reached_decision_maker === 'boolean' ? data.reached_decision_maker : null,
      audit_model: String(item.json.modelVersion || '').trim().slice(0, 60) || null,
      audit_version: 2,
      summary: (isUnanswered || isAuditFailed) ? null : (shortSummary || null),
      audio_url: String(source.audio_url || '').trim() || null
""",
)

# --- node 18b: send them to the cabinet
replace_once(
    '  "transcript": $json.transcript_text,\n',
    '''  "transcript": $json.transcript_text,
  "audio_url": $json.audio_url,
  "call_type": $json.call_type,
  "summary": $json.summary,
  "evidence": $json.evidence,
  "ended_by": $json.ended_by,
  "reached_decision_maker": $json.reached_decision_maker,
  "audit_model": $json.audit_model,
  "audit_version": $json.audit_version,
''',
    target=n18b,
    key="jsonBody",
)

json.dump([wf], open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if len(sys.argv) > 3:  # for `node --check`: a Code node body is an async function body
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        f.write("(async function () {\n" + n18["parameters"][J] + "\n})\n")

print("patched:", n18["name"][:20], "+", n18b["name"][:4])
