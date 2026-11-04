// Runs the PATCHED node 18 (and checks node 18b) on sample answers. Usage: node harness_contract_v2_scoring.cjs <patched.json>
const fs = require('fs');
const wfAll = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const wf = Array.isArray(wfAll) ? wfAll[0] : wfAll;
const code18 = wf.nodes.find((n) => n.name.startsWith('18. ')).parameters.jsCode;
const body18b = wf.nodes.find((n) => n.name.startsWith('18b.')).parameters.jsonBody;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failed = 0;
const ok = (name, cond, got) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + JSON.stringify(got)}`);
  if (!cond) failed += 1;
};

const ones = () => Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`cr${i + 1}`, 1]));
const words = (n) => Array(n).fill('слово').join(' ');
const base = { tenant_id: 'TNT-X', spreadsheet_id: 'sheet', crm_type: 'amocrm', amo_domain: 'x.amocrm.ru', amo_token: 't', lead_id: '77', call_id: 'c1', responsible_user_id: '7', created_at: 1793430656, duration: 120, audio_url: 'https://rec.example.ru/a.mp3?sig=1' };

async function run(answer, sourceOver = {}, extra = {}) {
  const source = { ...base, ...sourceOver };
  const item = { json: { modelVersion: 'gemini-3.6-flash', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }], ...extra } };
  const $input = { all: () => [item] };
  const $ = () => ({ item: { json: source } });
  const self = { helpers: { httpRequest: async () => ({ name: 'Кристина' }) } };
  return (await new AsyncFunction('$input', '$', code18).call(self, $input, $))[0].json;
}

// a talk of 50 manager words and 50 client words (client share 50%)
const dialog = (m, c) => `Менеджер: ${words(m)}\nКлиент: ${words(c)}`;
const talk = (over = {}) => ({ transcript: dialog(50, 50), ...ones(), error_summary: 'нет', ai_recommendation: 'да', call_type: 'qualification', amo_short_summary: 'Клиент просит КП', ...over });

(async () => {
  // ---- n/a and the score
  let j = await run(talk({ cr5: null, cr13: null, cr2: 0, cr3: 0 }));
  ok('two criteria did not apply: passed 9 of 11, score round(13*9/11)=11', j.passed === 9 && j.applicable === 11 && j.total_score === 11, [j.passed, j.applicable, j.total_score]);
  ok('the nulls stay null in cr5 and cr13', j.cr5 === null && j.cr13 === null && j.cr6 === 1, [j.cr5, j.cr6, j.cr13]);

  j = await run(talk({ cr5: null, cr6: null, cr13: null, cr2: 0 }));
  ok('three did not apply: 9 of 10, score round(13*9/10)=12', j.passed === 9 && j.applicable === 10 && j.total_score === 12, [j.passed, j.applicable, j.total_score]);

  j = await run(talk());
  ok('nothing is null: score = passed, applicable 13 (the old way)', j.total_score === 13 && j.applicable === 13 && j.passed === 13, [j.total_score, j.applicable]);

  j = await run(talk({ cr1: null, cr4: null, cr9: null }));
  ok('null in a criterion that may not be n/a is a 0', j.cr1 === 0 && j.cr4 === 0 && j.cr9 === 0 && j.applicable === 13 && j.total_score === 10, [j.cr1, j.cr4, j.applicable, j.total_score]);

  const missing = talk(); delete missing.cr5; delete missing.cr6;
  j = await run(missing);
  ok('a MISSING field is a 0, not "did not apply" (only an explicit null is)', j.cr5 === 0 && j.cr6 === 0 && j.applicable === 13, [j.cr5, j.cr6, j.applicable]);

  j = await run(talk({ cr5: null, cr6: null, cr13: null, cr1: 0, cr2: 0, cr3: 0, cr4: 0, cr7: 0, cr8: 0 }));
  ok('weak call with 3 n/a: 4 of 10 -> score 5 (round(5.2)): still a "срыв" (0-5)', j.passed === 4 && j.applicable === 10 && j.total_score === 5, [j.passed, j.applicable, j.total_score]);

  // ---- CR11 by code
  j = await run(talk({ transcript: dialog(100, 20), cr11: 1 }));
  ok('CR11: client says 17% of the words -> 0 although the model said 1', j.cr11 === 0, [j.cr11]);
  j = await run(talk({ transcript: dialog(60, 40), cr11: 0 }));
  ok('CR11: client says 40% -> 1 although the model said 0', j.cr11 === 1, [j.cr11]);
  j = await run(talk({ transcript: dialog(70, 30), cr11: 0 }));
  ok('CR11: exactly 30% passes', j.cr11 === 1, [j.cr11]);
  j = await run(talk({ transcript: dialog(80, 20), cr11: 1 }));
  ok('CR11: 20% fails', j.cr11 === 0, [j.cr11]);
  j = await run(talk({ transcript: `Менеджер: ${words(50)} Клиент: ${words(50)} Менеджер: ${words(10)}`, cr11: 0 }));
  ok('CR11: all in one line is read by the labels, not by the lines', j.cr11 === 1, [j.cr11]);
  j = await run(talk({ transcript: `Менеджер: ${words(40)}\nКлиент 1: ${words(25)}\nКлиент 2: ${words(25)}`, cr11: 0 }));
  ok('CR11: "Клиент 2:" counts as the client', j.cr11 === 1, [j.cr11]);
  j = await run(talk({ transcript: words(100), cr11: 1 }));
  ok('CR11: no labels -> the answer of the model stays', j.cr11 === 1, [j.cr11]);
  j = await run(talk({ transcript: `Менеджер: ${words(100)}`, cr11: 1 }));
  ok('CR11: only one role is labelled -> the answer of the model stays', j.cr11 === 1, [j.cr11]);

  // ---- evidence
  const transcript = 'Менеджер: Давайте созвонимся в четверг в 15:00.\nКлиент: Хорошо, договорились, пришлите приглашение. ' + words(40);
  j = await run(talk({
    transcript,
    evidence: {
      cr1: { why: 'Назвал день и время', quote: 'давайте созвонимся в четверг в 15:00' },
      cr2: { why: 'Задавал вопросы', quote: 'Этого в разговоре не было' },
      cr3: { why: 'x'.repeat(900), quote: '' },
      cr4: 'not an object',
      cr99: { why: 'unknown', quote: 'x' },
    },
  }));
  ok('a quote found in the transcript (case and punctuation aside) is kept', j.evidence.cr1.quote === 'давайте созвонимся в четверг в 15:00' && j.evidence.cr1.why === 'Назвал день и время', j.evidence && j.evidence.cr1);
  ok('a quote that is not in the transcript is dropped, the reason stays, and it is counted', j.evidence.cr2.quote === '' && j.evidence.cr2.why === 'Задавал вопросы' && j.evidence_unverified === 1, [j.evidence.cr2, j.evidence_unverified]);
  ok('a long reason is cut to 400; junk items and unknown criteria are ignored', j.evidence.cr3.why.length === 400 && !('cr4' in j.evidence) && !('cr99' in j.evidence), Object.keys(j.evidence));
  j = await run(talk());
  ok('no evidence from the model (old prompt): null, nothing breaks', j.evidence === null && j.evidence_unverified === 0, [j.evidence]);
  j = await run(talk({ evidence: 'junk' }));
  ok('evidence that is not an object is ignored', j.evidence === null, [j.evidence]);

  // ---- the other new fields
  j = await run(talk({ ended_by: 'client', reached_decision_maker: true }));
  ok('model, version, audio link, summary and the rest are passed on',
    j.audit_model === 'gemini-3.6-flash' && j.audit_version === 2 && j.audio_url === base.audio_url && j.summary === 'Клиент просит КП' && j.ended_by === 'client' && j.reached_decision_maker === true,
    [j.audit_model, j.audit_version, j.audio_url, j.summary, j.ended_by, j.reached_decision_maker]);
  j = await run(talk({ reached_decision_maker: 'yes' }), { audio_url: '' });
  ok('a non-boolean reached_decision_maker and an empty link become null', j.reached_decision_maker === null && j.audio_url === null, [j.reached_decision_maker, j.audio_url]);

  // ---- unanswered and failed: no score basis, no summary
  j = await run(talk({ transcript: 'Алло. Секретариат.', call_type: 'Недозвон' }));
  ok('a missed call: zeros, no basis, no summary, no evidence', j.is_unanswered === 1 && j.passed === null && j.applicable === null && j.summary === null && j.evidence === null && j.cr5 === 0, [j.passed, j.summary, j.cr5]);
  j = await run(talk({ transcript: '' }));
  ok('a failed audit (empty transcript): no summary', j.audit_failed === 1 && j.summary === null, [j.audit_failed, j.summary]);

  // ---- the notes
  j = await run(talk({ cr5: null, cr13: null }));
  ok('the CRM note says how many criteria were rated', j.amo_note_text.includes('13/13 (Эталон) (оценено 11 из 13)') || /\(оценено 11 из 13\)/.test(j.amo_note_text), j.amo_note_text.slice(0, 80));
  ok('Bitrix comment says it too', j.b24_comment_text.includes('оценено 11 из 13'), j.b24_comment_text.slice(0, 80));
  j = await run(talk());
  ok('nothing n/a: no "оценено" in the notes', !j.amo_note_text.includes('оценено') && !j.b24_comment_text.includes('оценено'), j.amo_note_text.slice(0, 80));

  // ---- the small things
  j = await run(talk({ cr2: 0, cr3: 0, cr4: 0, cr7: 0 }));
  ok('skill cluster follows the cabinet bands: 9 of 13 = Senior', j.manager_skill_cluster === 'Senior', [j.total_score, j.manager_skill_cluster]);
  j = await run(talk({ cr2: 0, cr3: 0, cr4: 0, cr7: 0, cr8: 0 }));
  ok('8 of 13 = Middle', j.manager_skill_cluster === 'Middle', [j.total_score, j.manager_skill_cluster]);
  j = await run(talk(), { lead_id: '', deal_id: '' });
  ok('no deal id in the CRM data: it stays empty, no invented "D-100"', j.deal_id === '', j.deal_id);

  // ---- node 18b: the request to the cabinet
  const fields = ['audio_url', 'call_type', 'summary', 'evidence', 'ended_by', 'reached_decision_maker', 'audit_model', 'audit_version'];
  ok('node 18b sends all the new fields and still the old ones', fields.every((f) => body18b.includes(`"${f}": $json.${f}`)) && body18b.includes('"cr": $json.audit_blocked') && body18b.includes('"transcript": $json.transcript_text'), body18b.slice(0, 200));
  const expr = body18b.replace(/^=\{\{/, '').replace(/\}\}$/, '').trim();
  const built = JSON.parse(new Function('$json', `return ${expr};`)({ ...(await run(talk({ cr5: null }))), audit_blocked: false }));
  ok('the body of 18b is valid JSON with null in cr and the basis kept in the score', built.cr[4] === null && built.cr[0] === 1 && built.audit_version === 2 && built.score === 13, [built.cr, built.score]);

  console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
  process.exit(failed ? 1 : 0);
})();
