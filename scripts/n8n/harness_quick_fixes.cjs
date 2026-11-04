// Runs the PATCHED nodes 15 and 18 of the n8n workflow on sample data. Usage: node harness_quick_fixes.cjs <patched.json>
const fs = require('fs');
const wfAll = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const wf = Array.isArray(wfAll) ? wfAll[0] : wfAll;
const byPrefix = (p) => wf.nodes.find((n) => n.name.startsWith(p));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

let failed = 0;
const ok = (name, cond, got) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  -> ' + JSON.stringify(got)}`);
  if (!cond) failed += 1;
};

// ---- node 15: who gets the token ----
const evalExpr = (expr, $json) => new Function('$json', 'return ' + expr.replace(/^=\{\{/, '').replace(/\}\}\s*$/, ''))($json);
const hdr = byPrefix('15. ').parameters.headerParameters.parameters[0];
const sent = (audio_url, amo_domain) => {
  const $json = { audio_url, amo_domain, amo_token: 'SECRET' };
  return { name: evalExpr(hdr.name, $json), value: evalExpr(hdr.value, $json) };
};
const leaked = (h) => JSON.stringify(h).includes('SECRET');

let h = sent('https://drive-b.amocrm.ru/download/x.mp3', 'client.amocrm.ru');
ok('the CRM own file host gets the token', h.name === 'Authorization' && h.value === 'Bearer SECRET', h);
h = sent('https://client.amocrm.ru/files/x.mp3', 'https://client.amocrm.ru/');
ok('the CRM domain itself gets the token (https:// and a slash in the registry are fine)', h.name === 'Authorization', h);
for (const url of ['https://asales.pro/rec/1.mp3', 'https://report.ai-rop.ru/api/v1/calls/audio/a.mp3', 'https://client.amocrm.ru.evil.com/a.mp3', 'https://evilamocrm.ru/a.mp3', 'http://evil.com:8080/a.mp3?x=.amocrm.ru']) {
  h = sent(url, 'client.amocrm.ru');
  ok(`${url.slice(0, 44)}: no token`, !leaked(h) && h.name === 'X-Revops-Source', h);
}
h = sent('https://portal.bitrix24.ru/download/?auth=1', '');
ok('Bitrix (no amoCRM domain): no token', !leaked(h), h);
h = sent(undefined, 'client.amocrm.ru');
ok('no link: no token, no crash', !leaked(h), h);

// ---- node 18: one extra brace is not a failed audit ----
const code18 = byPrefix('18. ').parameters.jsCode;
const crs = (n) => Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`cr${i + 1}`, i < n ? 1 : 0]));
const words = (n) => Array(n).fill('слово').join(' ');
const base = { tenant_id: 'TNT-X', spreadsheet_id: 'sheet', crm_type: 'amocrm', amo_domain: 'x.amocrm.ru', amo_token: 't', lead_id: '77', call_id: 'c1', responsible_user_id: '7', created_at: 1793430656, duration: 120 };

async function run(text) {
  const item = { json: { candidates: [{ finishReason: 'STOP', content: { parts: [{ text }] } }] } };
  const $input = { all: () => [item] };
  const $ = () => ({ item: { json: base } });
  const self = { helpers: { httpRequest: async () => ({ name: 'Кристина' }) } };
  return (await new AsyncFunction('$input', '$', code18).call(self, $input, $))[0].json;
}
const answer = { transcript: words(100), ...crs(9), error_summary: 'нет', ai_recommendation: 'да', manager_name: 'Х', call_type: 'qualification', zoom_scheduled: false };
const good = JSON.stringify(answer, null, 1);

(async () => {
  let j = await run(good);
  ok('a valid answer is unchanged', j.audit_failed === 0 && j.total_score === 9, [j.audit_failed, j.total_score]);

  j = await run(good + '\n}');
  ok('ONE extra "}" at the end: the audit is not failed, the score is kept', j.audit_failed === 0 && j.total_score === 9 && j.transcript_text.length > 100, [j.audit_failed, j.total_score]);

  j = await run('```json\n' + good + '\n}\n```');
  ok('an extra "}" inside a code fence too', j.audit_failed === 0 && j.total_score === 9, [j.audit_failed, j.total_score]);

  j = await run(good + '\n}\n}\n}');
  ok('three extra braces still parse', j.audit_failed === 0 && j.total_score === 9, [j.audit_failed, j.total_score]);

  j = await run(good + '\n}\n}\n}\n}\n}');
  ok('five extra braces are a failed audit (we do not guess far)', j.audit_failed === 1, j.audit_failed);

  j = await run('это не json ' + words(50));
  ok('a text that is no JSON stays a failed audit', j.audit_failed === 1 && j.total_score === 0, [j.audit_failed, j.total_score]);

  j = await run(good.slice(0, good.length - 30));
  ok('a truncated answer stays a failed audit', j.audit_failed === 1, j.audit_failed);

  console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
  process.exit(failed ? 1 : 0);
})();
