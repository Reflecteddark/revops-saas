#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RevOps Enterprise OS — n8n Anti-Sabotage Prompt & Metadata Engine Patch.
Injects deep detection of simulated activity (hanging on hold/IVR, talking to colleagues,
faking minutes without a real client dialog) into Gemini prompts (nodes 17, 17a, 17b)
and adapts downstream metadata compiler (node 18).
"""

import json
import subprocess
import sys

NEW_INSTRUCTION = """ИНСТРУКЦИЯ ПО АНАЛИЗУ:
1. НЕДОЗВОН: Если в аудио тишина, автоответчик, сброс или менее 15 слов — статус "Недозвон", все cr1..cr13 = 0.
2. АНТИСАБОТАЖ (ПРОВЕРКА НА ИМИТАЦИЮ ДЕЯТЕЛЬНОСТИ):
Определи, является ли звонок реальным рабочим диалогом с клиентом по сделке, или менеджер просто имитирует деятельность:
- Менеджер просто висит на длинных гудках, в меню IVR или на автоответчике для искусственной накрутки минут в CRM;
- Менеджер говорит сам с собой, с посторонним фоновым шумом или с коллегой в офисе на личные/отвлечённые темы;
- Менеджер совершил звонок на подставной/несуществующий номер без реального диалога с клиентом.
Если обнаружена имитация:
- call_type = "Имитация (саботаж)"
- все cr1..cr13 = 0
- error_summary = "Имитация деятельности: звонок без реального диалога с клиентом (накрутка минут в CRM / разговор с коллегой / удержание линии на гудках)"
- ai_recommendation = "ВНИМАНИЕ РУКОВОДСТВУ: зафиксирована имитация активности. Провести проверку сотрудника на предмет саботажа рабочего времени."
- amo_short_summary = "⚠️ Имитация деятельности: нет реального диалога с клиентом (накрутка хронометража в CRM)."

ФОРМАТ ВЫВОДА (СТРОГИЙ JSON):
{
  "transcript": "Дословный текст стенограммы разговора...",
  "call_type": "qualification | negotiation | meeting_confirm | cold_call | presentation | Недозвон | Имитация (саботаж)",
  "manager_name": "Имя менеджера",
  "client_name": "Компания или имя собеседника",
  "client_position": "Должность собеседника",
  "client_niche": "Отрасль / категория",
  "cr1": 1, "cr2": 1, "cr3": 1, "cr4": 0, "cr5": 1, "cr6": 1, "cr7": 0, "cr8": 1, "cr9": 1, "cr10": 1, "cr11": 1, "cr12": 1, "cr13": 1,
  "error_summary": "Главные ошибки диалога списком через точку с запятой",
  "ai_recommendation": "Практический совет менеджеру к следующему звонку (что конкретно сделать/сказать клиенту без упоминания РОПа)",
  "amo_short_summary": "2-3 предложения для примечания CRM: с кем говорили, о чем договорились, следующий шаг",
  "zoom_scheduled": false
}"""

OLD_INSTRUCTION_TARGET = """ИНСТРУКЦИЯ ПО АНАЛИЗУ:
Если в аудио тишина, автоответчик, сброс или менее 15 слов — статус "Недозвон", все cr1..cr13 = 0.

ФОРМАТ ВЫВОДА (СТРОГИЙ JSON):
{
  "transcript": "Дословный текст стенограммы разговора...",
  "call_type": "qualification | negotiation | meeting_confirm | cold_call | presentation | Недозвон",
  "manager_name": "Имя менеджера",
  "client_name": "Компания или имя собеседника",
  "client_position": "Должность собеседника",
  "client_niche": "Отрасль / категория",
  "cr1": 1, "cr2": 1, "cr3": 1, "cr4": 0, "cr5": 1, "cr6": 1, "cr7": 0, "cr8": 1, "cr9": 1, "cr10": 1, "cr11": 1, "cr12": 1, "cr13": 1,
  "error_summary": "Главные ошибки диалога списком через точку с запятой",
  "ai_recommendation": "Практический совет менеджеру к следующему звонку (что конкретно сделать/сказать клиенту без упоминания РОПа)",
  "amo_short_summary": "2-3 предложения для примечания CRM: с кем говорили, о чем договорились, следующий шаг",
  "zoom_scheduled": false
}"""


def patch_n8n():
    print("1. Exporting workflow Sh4JkQtMKVdeRJn5 from n8n...")
    res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'export:workflow', '--id=Sh4JkQtMKVdeRJn5', '--stdout'], capture_output=True, text=True)
    if res.returncode != 0:
        print("Error exporting workflow:", res.stderr)
        sys.exit(1)

    data = json.loads(res.stdout)
    wf = data[0] if isinstance(data, list) else data

    patched_gemini_nodes = 0
    patched_node18 = False

    for n in wf.get('nodes', []):
        name = n.get('name', '')

        # Patch Gemini prompt nodes
        if any(name.startswith(p) for p in ['17.', '17a.', '17b.']):
            jb = n.get('parameters', {}).get('jsonBody', '')
            if OLD_INSTRUCTION_TARGET in jb:
                n['parameters']['jsonBody'] = jb.replace(OLD_INSTRUCTION_TARGET, NEW_INSTRUCTION)
                print(f"  ✓ Patched Gemini prompt in '{name}'")
                patched_gemini_nodes += 1
            else:
                # Try more flexible replacement if formatting differed slightly
                if 'ИНСТРУКЦИЯ ПО АНАЛИЗУ:' in jb:
                    idx = jb.find('ИНСТРУКЦИЯ ПО АНАЛИЗУ:')
                    end_idx = jb.find('}`', idx)
                    if idx != -1 and end_idx != -1:
                        n['parameters']['jsonBody'] = jb[:idx] + NEW_INSTRUCTION + jb[end_idx+1:]
                        print(f"  ✓ Patched Gemini prompt (substring match) in '{name}'")
                        patched_gemini_nodes += 1

        # Patch Node 18 Metadata Compiler
        if name.startswith('18.'):
            code = n.get('parameters', {}).get('jsCode', '')

            # Inject isFakeActivity detection
            old_unanswered_block = """  // Accurate Unanswered Flag
  const isUnanswered = Boolean(
    durationSec < 15 ||
    isShortCall ||
    isPureIVR ||
    data.call_type === 'Недозвон' ||
    data.call_type === 'lost_ivr'
  );"""

            new_unanswered_block = """  // Accurate Fake Activity & Sabotage Detection
  const isFakeActivity = Boolean(
    data.call_type === 'Имитация (саботаж)' ||
    data.call_type === 'fake_call' ||
    (String(data.error_summary || '').toLowerCase().includes('имитация деятельност'))
  );

  // Accurate Unanswered Flag
  const isUnanswered = !isFakeActivity && Boolean(
    durationSec < 15 ||
    isShortCall ||
    isPureIVR ||
    data.call_type === 'Недозвон' ||
    data.call_type === 'lost_ivr'
  );"""

            if old_unanswered_block in code:
                code = code.replace(old_unanswered_block, new_unanswered_block)

            # Score evaluation for fake activity
            old_score_block = """  // Score evaluation (Voice AI Gatekeeper: Voicemail & Short Call safe)
  let totalScore = "";
  let cr = {};
  if (isUnanswered) {
    for (let c = 1; c <= 13; c++) {
      cr['cr' + c] = 0;
    }
    totalScore = ""; // Empty string so AVERAGE() in Google Sheets ignores it and does NOT drag manager score down
  } else {"""

            new_score_block = """  // Score evaluation (Voice AI Gatekeeper: Voicemail, Short Call & Anti-Sabotage safe)
  let totalScore = "";
  let cr = {};
  if (isUnanswered) {
    for (let c = 1; c <= 13; c++) {
      cr['cr' + c] = 0;
    }
    totalScore = ""; // Empty string so AVERAGE() in Google Sheets ignores it and does NOT drag manager score down
  } else if (isFakeActivity) {
    for (let c = 1; c <= 13; c++) {
      cr['cr' + c] = 0;
    }
    totalScore = 0; // Hard 0 score for sabotage detection
  } else {"""

            if old_score_block in code:
                code = code.replace(old_score_block, new_score_block)

            # Badge update
            old_badge_block = "let scoreBadge = isUnanswered ? '⚪ Автоответчик / Недозвон' : (totalScore >= 11 ? `🟢 ${totalScore}/13 (Успешно)` : (totalScore >= 8 ? `🟡 ${totalScore}/13 (Есть риски)` : `🔴 ${totalScore}/13 (Слив сделки)`));"
            new_badge_block = "let scoreBadge = isFakeActivity ? '🚨 ИМИТАЦИЯ ДЕЯТЕЛЬНОСТИ (САБОТАЖ)' : (isUnanswered ? '⚪ Автоответчик / Недозвон' : (totalScore >= 11 ? `🟢 ${totalScore}/13 (Успешно)` : (totalScore >= 8 ? `🟡 ${totalScore}/13 (Есть риски)` : `🔴 ${totalScore}/13 (Слив сделки)`)));"
            if old_badge_block in code:
                code = code.replace(old_badge_block, new_badge_block)

            # Summaries update
            old_summaries_block = """  if (isUnanswered) {
    shortSummary = 'Созвонился с автоответчиком / сброс вызова. Разговор не состоялся.';
    errorSummary = 'Недозвон / IVR автоответчик / короткий сброс';
    aiRecommendation = 'Запланировать повторный звонок в другое время суток';
    data.call_type = 'lost';
  } else {
    shortSummary = String(data.amo_short_summary || 'Разговор состоялся.').trim();
  }"""

            new_summaries_block = """  if (isFakeActivity) {
    shortSummary = '🚨 Обнаружена имитация активности: реальный диалог с клиентом отсутствует.';
    errorSummary = String(data.error_summary || 'Имитация деятельности: накрутка минут в CRM / удержание линии');
    aiRecommendation = String(data.ai_recommendation || 'ВНИМАНИЕ: Проверить сотрудника на саботаж рабочего времени.');
    data.call_type = 'Имитация (саботаж)';
  } else if (isUnanswered) {
    shortSummary = 'Созвонился с автоответчиком / сброс вызова. Разговор не состоялся.';
    errorSummary = 'Недозвон / IVR автоответчик / короткий сброс';
    aiRecommendation = 'Запланировать повторный звонок в другое время суток';
    data.call_type = 'lost';
  } else {
    shortSummary = String(data.amo_short_summary || 'Разговор состоялся.').trim();
  }"""

            if old_summaries_block in code:
                code = code.replace(old_summaries_block, new_summaries_block)

            # Skill cluster
            old_cluster = "const managerSkillCluster = totalScore >= 11 ? 'Senior' : (totalScore >= 8 ? 'Middle' : 'Junior');"
            new_cluster = "const managerSkillCluster = isFakeActivity ? 'Risk (Sabotage)' : (totalScore >= 11 ? 'Senior' : (totalScore >= 8 ? 'Middle' : 'Junior'));"
            if old_cluster in code:
                code = code.replace(old_cluster, new_cluster)

            # Amo and B24 alerts
            old_amo_note = "const amoNoteText = `🎙️ ИИ-Аудит звонка • ${scoreBadge}"
            new_amo_note = "const amoNoteText = isFakeActivity ? `🚨 ИИ-Аудит звонка • ИМИТАЦИЯ ДЕЯТЕЛЬНОСТИ (0/13)\\n━━━━━━━━━━━━━━━━━━━━━━━━━\\n⚠️ ВНИМАНИЕ: Менеджер имитирует работу (накрутка минут в CRM без клиента)\\n📝 Суть: ${shortSummary}\\n🎯 След. шаг: ❌ Не зафиксирован\\n⚠️ Замечания: ${errorSummary}\\n💡 Рекомендация: ${aiRecommendation}\\n──────────\\nid: ${currentCallId}` : `🎙️ ИИ-Аудит звонка • ${scoreBadge}"
            if old_amo_note in code and "isFakeActivity ?" not in code:
                code = code.replace(old_amo_note, new_amo_note)

            n['parameters']['jsCode'] = code
            print(f"  ✓ Patched Node 18 Metadata Compiler")
            patched_node18 = True

    print(f"\nSummary of changes: {patched_gemini_nodes} Gemini nodes patched, Node 18 patched: {patched_node18}")
    if patched_gemini_nodes == 0:
        print("Error: Could not locate Gemini prompt in nodes 17, 17a, 17b")
        sys.exit(1)

    # 4. Save and import back
    tmp_path = "/tmp/updated_wf_antisabotage.json"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump([wf], f, ensure_ascii=False, indent=2)

    print(f"2. Copying {tmp_path} into n8n container and importing...")
    cp_res = subprocess.run(['docker', 'cp', tmp_path, 'n8n:/tmp/updated_wf_antisabotage.json'], capture_output=True, text=True)
    if cp_res.returncode != 0:
        print("docker cp error:", cp_res.stderr)
        sys.exit(1)

    import_res = subprocess.run(['docker', 'exec', 'n8n', 'n8n', 'import:workflow', '--input=/tmp/updated_wf_antisabotage.json'], capture_output=True, text=True)
    print("Import stdout:", import_res.stdout)
    if import_res.returncode != 0:
        print("Import stderr:", import_res.stderr)
        sys.exit(1)

    print("✅ Workflow Sh4JkQtMKVdeRJn5 successfully patched and re-imported into n8n!")


if __name__ == '__main__':
    patch_n8n()
