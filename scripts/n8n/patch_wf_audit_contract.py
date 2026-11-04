"""
n8n workflow "Analysis of sales department calls": the call contract with the cabinet.

Usage: python3 patch_wf_audit_contract.py <exported.json> <patched.json> [<node18_check.js>]

Before:
- node 18 kept the manager in `manager_id`, node 18b sent `$json.manager_name`, which does not exist: the manager
  never reached the API, so since the API resolves managers by the CRM every call would read "Не определён";
- 18b sent neither the moment of the call nor the "nobody talked" / "the AI failed" flags;
- without a CRM user id the name the AI heard in the recording became the manager;
- an unknown duration (0) marked a real conversation as "not answered" (node 05 lets 0 through on purpose);
- an IVR phrase ANYWHERE made a call "not answered": a client saying "перезвоните позже" in the middle of a long talk
  wiped its score;
- a test fixture ('asales_call_') replaced the hour of a call by a fixed list;
- the note in the CRM called a missed call or a failed audit "🔴 0/13 (Слив сделки)", with cut-offs 11/8 instead of
  the 9/6 of the cabinet;
- the Bitrix webhook dated a call by the moment the webhook arrived.

Every replacement asserts it matches exactly once: on a workflow that has changed the script stops, it never guesses.
"""

import json
import sys

wf = json.load(open(sys.argv[1], encoding="utf-8"))
wf = wf[0] if isinstance(wf, list) else wf


def node(prefix):
    found = [x for x in wf["nodes"] if x["name"].startswith(prefix)]
    assert len(found) == 1, prefix
    return found[0]


def replace_once(n, key, old, new):
    c = n["parameters"][key]
    assert c.count(old) == 1, (n["name"], c.count(old), old[:70])
    n["parameters"][key] = c.replace(old, new)


def cut(n, key, start, end, new):
    c = n["parameters"][key]
    assert c.count(start) == 1, (n["name"], start[:70])
    a = c.index(start)
    b = c.index(end, a)
    n["parameters"][key] = c[:a] + new + c[b:]


n18 = node("18. ")
J = "jsCode"

# --- helpers shared by the normal path and the "model refused the recording" path ---
replace_once(n18, J, "const amoUserNames = {};\n", r"""const amoUserNames = {};
const isBadName = (v) => !v || ['-', 'неизвестный', 'неизвестен', 'unknown', 'менеджер', 'не указан'].includes(String(v).trim().toLowerCase());

// The manager is a user of the client's CRM and nothing else: CRM name -> amoCRM user by id in the tenant's own account ->
// 'Менеджер #<id>' (same label as deals/tasks) -> 'Не указан'. A name the AI heard in the recording is never a manager.
const resolveManager = async (source) => {
  const respId = String(source.responsible_user_id || '').trim();
  let managerId = isBadName(source.responsible_user_name) ? '' : String(source.responsible_user_name).trim();
  if (!managerId && respId && (source.crm_type || 'amocrm') === 'amocrm' && source.amo_domain && source.amo_token) {
    const cache = amoUserNames[source.tenant_id] = amoUserNames[source.tenant_id] || {};
    if (!(respId in cache)) {
      const domain = String(source.amo_domain).replace(/^https?:\/\//i, '').replace(/\/+$/, '');
      try {
        const u = await this.helpers.httpRequest({
          method: 'GET',
          url: `https://${domain}/api/v4/users/${encodeURIComponent(respId)}`,
          headers: { Authorization: `Bearer ${source.amo_token}`, Accept: 'application/json' },
          json: true,
          timeout: 10000
        });
        cache[respId] = (u && !isBadName(u.name)) ? String(u.name).trim() : '';
      } catch (e) {
        cache[respId] = '';
        console.log(`[NODE 18] amoCRM user ${respId} lookup failed (tenant ${source.tenant_id}): HTTP ${e.httpCode || e.statusCode || '-'}`);
      }
    }
    managerId = cache[respId];
  }
  if (!managerId && respId) managerId = 'Менеджер #' + respId;
  return { managerId: managerId || 'Не указан', respId };
};

// The moment of the call given by the CRM, in ms.
const callMomentMs = (source) => {
  const at = source.created_at;
  if (typeof at === 'number' && at > 0) return at > 1e11 ? at : at * 1000;
  if (typeof at === 'string' && at) {
    const parsed = Date.parse(at);
    return isNaN(parsed) ? (Number(at) * 1000 || Date.now()) : parsed;
  }
  return Date.now();
};
""")

# --- the "model refused" path keeps its manager and its moment ---
replace_once(n18, J, """    results.push({
      json: {
        call_id: currentCallId,
        deal_id: currentDealId,
        lead_id: currentLeadId,
        entity_type: entityType,
        note_id: currentNoteId,
        tenant_id: source.tenant_id,
""", """    const blocked = await resolveManager(source);
    results.push({
      json: {
        call_id: currentCallId,
        deal_id: currentDealId,
        lead_id: currentLeadId,
        entity_type: entityType,
        note_id: currentNoteId,
        manager_id: blocked.managerId,
        manager_crm_id: blocked.respId,
        call_started_at: new Date(callMomentMs(source)).toISOString(),
        tenant_id: source.tenant_id,
""")

# --- the moment of the call ---
cut(n18, J, "  let callTimestampMs = 0;\n", "  const mskDate = new Date(callTimestampMs);",
    "  const callTimestampMs = callMomentMs(source);\n\n")

# --- no test fixture in production ---
cut(n18, J, "  if (String(currentCallId).startsWith('asales_call_')) {\n", "  const responseDelayMin =", "")
replace_once(n18, J, "  let callHourMsk = Number(partMap.hour || 0);\n", "  const callHourMsk = Number(partMap.hour || 0);\n")
replace_once(n18, J, "  let isWorkingHours = (!isWeekend", "  const isWorkingHours = (!isWeekend")

# --- "nobody talked": unknown duration is not a short call; an IVR phrase counts only where an IVR speaks ---
cut(n18, J, "  const isPureIVR = (\n", "  // Accurate Unanswered Flag\n", r"""  // An IVR speaks at the very start of a short recording. Anywhere else these are ordinary words: a client saying
  // 'перезвоните позже' in the middle of a long talk is a real conversation and must be scored.
  const transHead = transLower.slice(0, 300);
  const isPureIVR = wordCount < 200 && (
    transHead.includes('автоответчик') ||
    transHead.includes('голосовое сообщение') ||
    transHead.includes('оставьте сообщение') ||
    transHead.includes('после сигнала') ||
    transHead.includes('перезвоните позже') ||
    transHead.includes('абонент временно недоступен') ||
    transHead.includes('вызов переадресован') ||
    transHead.includes('нажмите один')
  );

""")
replace_once(n18, J, "    durationSec < 15 ||\n", "    (durationSec > 0 && durationSec < 15) || // 0 = the CRM did not say; node 05 lets those through on purpose\n")

# --- the manager ---
cut(n18, J, "  // Manager: the CRM is the source of truth.", "  let shortSummary = '';",
    "  const { managerId, respId } = await resolveManager(source);\n\n")

# --- the note in the CRM speaks the cabinet's language ---
cut(n18, J, "    let scoreBadge = `🔴 ${totalScore}/13 (Слив сделки)`;\n", "  let nextStepLine =", r"""  const isAuditFailed = data.error_summary === 'JSON parse error from Gemini response';
  // Same bands as the cabinet: 9-13 / 6-8 / 0-5. A missed call or a failed audit has no score at all.
  const noScoreText = isUnanswered ? 'разговор не состоялся' : (isAuditFailed ? 'сбой анализа, оценки нет' : '');
  let scoreBadge = `🔴 ${totalScore}/13 (Срыв)`;
  if (noScoreText) {
    scoreBadge = `⚪ ${noScoreText[0].toUpperCase()}${noScoreText.slice(1)}`;
  } else if (totalScore >= 9) {
    scoreBadge = `🟢 ${totalScore}/13 (Эталон)`;
  } else if (totalScore >= 6) {
    scoreBadge = `🟡 ${totalScore}/13 (Норма)`;
  }

""")
replace_once(n18, J, "  let nextStepLine = '❌ Не зафиксирован (дата и время следующего контакта отсутствуют)';\n",
             "  let nextStepLine = noScoreText ? '—' : '❌ Не зафиксирован (дата и время следующего контакта отсутствуют)';\n")
replace_once(n18, J, "(Оценка: ${totalScore}/13)[/b]", "(Оценка: ${noScoreText || (totalScore + '/13')})[/b]")

# --- what leaves node 18 ---
replace_once(n18, J, "      manager_id: managerId,\n      call_date: callDateMsk,\n",
             "      manager_id: managerId,\n      manager_crm_id: respId,\n      call_started_at: new Date(callTimestampMs).toISOString(),\n      call_date: callDateMsk,\n")
replace_once(n18, J, "      audit_failed: data.error_summary === 'JSON parse error from Gemini response' ? 1 : 0,\n",
             "      audit_failed: isAuditFailed ? 1 : 0,\n")

# --- 18b: the manager (was the non-existent $json.manager_name), the moment and the two flags ---
replace_once(node("18b."), "jsonBody", '  "manager": $json.manager_name,\n', """  "manager": $json.manager_id,
  "manager_crm_id": $json.manager_crm_id,
  "call_started_at": $json.call_started_at,
  "audit_failed": $json.audit_failed,
  "is_unanswered": $json.is_unanswered,
""")

# --- Bitrix webhook: the moment of the call, not of the webhook ---
n12 = node("12. ")
replace_once(n12, J, "      created_at: Math.floor(Date.now() / 1000),\n",
             "      created_at: Math.floor((Date.parse(callData.CALL_START_DATE || '') || Date.now()) / 1000),\n")

json.dump([wf], open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if len(sys.argv) > 3:  # for `node --check`: a Code node body is an async function body
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        f.write("(async function () {\n" + n18["parameters"][J] + "\n})\n")
        f.write("(async function () {\n" + n12["parameters"][J] + "\n})\n")

print("patched:", n18["name"][:20], "|", node("18b.")["name"][:20], "|", n12["name"][:20])
