// Evaluates the request body of the PATCHED Gemini nodes 17, 17a, 17b, 17c.
// Usage: node harness_contract_v2_prompt.cjs <patched.json> [<B_v2.txt>]
const fs = require('fs');
const wfAll = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const wf = Array.isArray(wfAll) ? wfAll[0] : wfAll;
const nodes = wf.nodes.filter((n) => /^17[abc]?\. /.test(n.name));

let failed = 0;
const ok = (name, cond, got) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + JSON.stringify(got)}`);
  if (!cond) failed += 1;
};

const $now = { setZone: () => ({ format: () => '2026-11-05 (четверг)' }) };
function build(node, json) {
  const expr = node.parameters.jsonBody.replace(/^=\{\{/, '').replace(/\}\}\s*$/, '').trim();
  return JSON.parse(new Function('$json', '$now', `return ${expr};`)(json, $now));
}

ok('four Gemini nodes found', nodes.length === 4, nodes.map((n) => n.name));
ok('all four carry the same body', new Set(nodes.map((n) => n.parameters.jsonBody)).size === 1);

const body = build(nodes[0], { audio_b64: 'QUJD', audio_mime: 'audio/mpeg' });
const parts = body.contents[0].parts;
const prompt = parts[parts.length - 1].text;
ok('audio goes first as inline_data, the prompt last', parts.length === 2 && parts[0].inline_data.data === 'QUJD' && parts[0].inline_data.mime_type === 'audio/mpeg');
ok('the date of the live prompt is kept', prompt.includes('- Дата: 2026-11-05 (четверг)'));

const cfg = body.generationConfig;
ok('temperature and JSON mime kept, NO maxOutputTokens (thinking tokens count against it)', cfg.temperature === 0.1 && cfg.responseMimeType === 'application/json' && !('maxOutputTokens' in cfg), cfg);
const props = cfg.responseSchema.properties;
ok('null is allowed in cr5, cr6, cr13 and nowhere else', [5, 6, 13].every((i) => props['cr' + i].nullable === true) && [1, 2, 3, 4, 7, 8, 9, 10, 11, 12].every((i) => !props['cr' + i].nullable), Object.keys(props).filter((k) => props[k].nullable));
ok('evidence has why + quote for all 13 criteria, all required', Array.from({ length: 13 }, (_, i) => props.evidence.properties['cr' + (i + 1)]).every((e) => e.required.join() === 'why,quote') && props.evidence.required.length === 13);
ok('required fields include all 13 criteria and evidence', ['transcript', 'evidence', 'cr1', 'cr13', 'amo_short_summary'].every((f) => cfg.responseSchema.required.includes(f)));
ok('the schema is the one the pilot used (same property names)', ['ended_by', 'reached_decision_maker', 'zoom_scheduled', 'client_niche'].every((f) => f in props));

ok('transcript format, null rules and evidence are in the prompt', ['«Менеджер: текст» или «Клиент: текст»', 'null = ТОЛЬКО для cr5, cr6, cr13', 'Простой вопрос о цене — не возражение.', 'quote — дословная цитата из transcript до 20 слов', '"ended_by": "manager | client | unknown"'].every((s) => prompt.includes(s)));
ok('CR11 says 30%, not 40%', prompt.includes('не менее 30% хронометража') && !prompt.includes('40%'));
ok('the old "all 0/1" instruction is gone', !prompt.includes('(1 - зачет, 0 - дефект)') && !prompt.includes('"cr5": 1, "cr6": 1'));
ok('the missed-call rule stays', prompt.includes('статус "Недозвон", все cr1..cr13 = 0'));

const withCtx = build(nodes[1], { audio_b64: 'QUJD', custom_prompt_context: 'Клиника: приём по записи' }).contents[0].parts[1].text;
ok('the tenant context block is kept when there is one', withCtx.includes('ОТРАСЛЕВАЯ СПЕЦИФИКА И РЕГЛАМЕНТ ТЕНАНТА:\nКлиника: приём по записи'));
ok('and absent when there is none', !prompt.includes('ОТРАСЛЕВАЯ СПЕЦИФИКА'));
const noAudio = build(nodes[2], {}).contents[0].parts;
ok('no audio: only the prompt part (as before)', noAudio.length === 1);

if (process.argv[3]) {
  const pilot = fs.readFileSync(process.argv[3], 'utf8').replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim() && !l.includes('{CALL_DATE}'));
  const missing = pilot.filter((l) => !prompt.includes(l));
  ok(`every line of the pilot prompt B_v2.txt is in the live prompt (${pilot.length} lines)`, missing.length === 0, missing.slice(0, 3));
}

console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
