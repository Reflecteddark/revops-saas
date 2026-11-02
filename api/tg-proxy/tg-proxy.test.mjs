// Run: node --test api/tg-proxy/tg-proxy.test.mjs
// The edge proxy must relay only our own bot(s); anything else is rejected without
// contacting api.telegram.org (it used to be an open relay for any bot token).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const { default: handler } = await import(new URL('./[...slug].js', import.meta.url));

let upstreamCalls = [];
beforeEach(() => {
  upstreamCalls = [];
  globalThis.fetch = async (url, init) => {
    upstreamCalls.push({ url, init });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
});

const OWN = '8950801302:AAFakeTokenForTestsOnly_xxxxxxxxxxxxx';

test('own bot is relayed via /tg-proxy/', async () => {
  const res = await handler(new Request(`https://ai-rop.ru/tg-proxy/bot${OWN}/getMe`));
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, `https://api.telegram.org/bot${OWN}/getMe`);
});

test('own bot file download is relayed via /api/tg-proxy/', async () => {
  const res = await handler(new Request(`https://ai-rop.ru/api/tg-proxy/file/bot${OWN}/voice/f.oga`));
  assert.equal(res.status, 200);
  assert.equal(upstreamCalls[0].url, `https://api.telegram.org/file/bot${OWN}/voice/f.oga`);
});

test('query string is preserved for own bot', async () => {
  await handler(new Request(`https://ai-rop.ru/tg-proxy/bot${OWN}/getUpdates?offset=5`));
  assert.equal(upstreamCalls[0].url, `https://api.telegram.org/bot${OWN}/getUpdates?offset=5`);
});

for (const path of [
  '/tg-proxy/bot123456789:AAOtherBotToken_yyyyyyyyyyyyyyyyyyyy/getMe', // foreign bot
  '/tg-proxy/botINVALID/getMe',
  '/tg-proxy/sendMessage',                                             // no token at all
  '/tg-proxy/',
  `/tg-proxy/bot${OWN}/../bot123:AAx/getMe`,                            // traversal attempt
  '/tg-proxy/bot89508013020:AAlongerIdPrefix_zzzzzzzzzzzzzzzzzzzz/getMe', // id prefix trick
]) {
  test(`rejected without upstream call: ${path}`, async () => {
    const res = await handler(new Request(`https://ai-rop.ru${path}`));
    assert.equal(res.status, 403);
    assert.equal(upstreamCalls.length, 0);
  });
}
