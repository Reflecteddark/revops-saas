// Runs the PATCHED node 18 on sample answers. Usage: node harness_node18_empty_transcript.cjs <patched.json>
const fs = require('fs');
const wfAll = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const wf = Array.isArray(wfAll) ? wfAll[0] : wfAll;
const code18 = wf.nodes.find((n) => n.name.startsWith('18. ')).parameters.jsCode;
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failed = 0;
const ok = (name, cond, got) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + JSON.stringify(got)}`);
  if (!cond) failed += 1;
};

const crs = (n) => Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`cr${i + 1}`, i < n ? 1 : 0]));
const words = (n) => Array(n).fill('слово').join(' ');
const base = { tenant_id: 'TNT-X', spreadsheet_id: 'sheet', crm_type: 'amocrm', amo_domain: 'x.amocrm.ru', amo_token: 't', lead_id: '77', call_id: 'c1', responsible_user_id: '7', created_at: 1793430656, duration: 120 };

async function run(answer, sourceOver = {}) {
  const source = { ...base, ...sourceOver };
  const item = { json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }] } };
  const $input = { all: () => [item] };
  const $ = () => ({ item: { json: source } });
  const self = { helpers: { httpRequest: async () => ({ name: 'Кристина' }) } };
  return (await new AsyncFunction('$input', '$', code18).call(self, $input, $))[0].json;
}
const talk = { transcript: words(100), ...crs(9), error_summary: 'нет', ai_recommendation: 'да', manager_name: 'Х', call_type: 'qualification', zoom_scheduled: false };

(async () => {
  let j = await run([talk]);
  ok('an answer wrapped in an array is read: score kept, not failed, not missed', j.audit_failed === 0 && j.is_unanswered === 0 && j.total_score === 9 && j.transcript_text.length > 100, [j.audit_failed, j.is_unanswered, j.total_score]);

  j = await run([null, talk]);
  ok('the first OBJECT of the array is the answer (a null before it is skipped)', j.audit_failed === 0 && j.total_score === 9, [j.audit_failed, j.total_score]);

  j = await run([]);
  ok('an empty array is a failed audit, not a crash', j.audit_failed === 1 && j.is_unanswered === 0, [j.audit_failed, j.is_unanswered]);

  j = await run({ ...talk, transcript: '' });
  ok('REAL BUG: no transcript, 120 s talk, not called missed by the model -> failed audit, not "missed"', j.audit_failed === 1 && j.is_unanswered === 0, [j.audit_failed, j.is_unanswered]);
  ok('the failed audit says so in the CRM note and has no score', j.amo_note_text.includes('Сбой анализа') && !j.amo_note_text.includes('0/13'), j.amo_note_text.slice(0, 60));

  const { transcript, ...noTranscriptField } = talk;
  j = await run(noTranscriptField);
  ok('a missing transcript field is the same', j.audit_failed === 1 && j.is_unanswered === 0, [j.audit_failed, j.is_unanswered]);

  j = await run({ ...talk, transcript: '', call_type: 'Недозвон' });
  ok('the model itself says missed: still missed', j.is_unanswered === 1 && j.audit_failed === 0, [j.is_unanswered, j.audit_failed]);

  j = await run({ ...talk, transcript: '', call_type: 'qualification' }, { duration: 10 });
  ok('a 10 s call with no transcript is missed (real short call)', j.is_unanswered === 1 && j.audit_failed === 0, [j.is_unanswered, j.audit_failed]);

  j = await run({ ...talk, transcript: 'Алло. Секретариат Алисова аппарата. Слушаю вас.', call_type: 'Недозвон' }, { duration: 407 });
  ok('the real TNT-004 case: 6 words, the model says missed, 407 s: stays missed', j.is_unanswered === 1 && j.audit_failed === 0, [j.is_unanswered, j.audit_failed]);

  j = await run({ ...talk, transcript: words(10), call_type: 'qualification' });
  ok('10 words and no "missed" from the model: unchanged behaviour (missed by the 20-word rule)', j.is_unanswered === 1, j.is_unanswered);

  j = await run(talk);
  ok('a normal answer is unchanged', j.audit_failed === 0 && j.is_unanswered === 0 && j.total_score === 9, [j.audit_failed, j.is_unanswered, j.total_score]);

  console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
  process.exit(failed ? 1 : 0);
})();
