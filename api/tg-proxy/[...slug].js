export const config = {
  runtime: 'edge',
};

// Only our own bots may be relayed. Without this check the proxy was an open relay:
// anyone could push any bot's traffic through ai-rop.ru.
const DEFAULT_ALLOWED_BOT_IDS = '8950801302';
// /bot<id>:<token>/<method>  or  /file/bot<id>:<token>/<file path>
const BOT_PATH_RE = /^\/(?:file\/)?bot(\d+):[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.\-/]*)?$/;

function allowedBotIds() {
  const raw = (typeof process !== 'undefined' && process.env && process.env.TG_PROXY_ALLOWED_BOT_IDS) || DEFAULT_ALLOWED_BOT_IDS;
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

function forbidden() {
  return new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden' }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  // Match and strip the proxy prefix, e.g. /api/tg-proxy/... or /tg-proxy/...
  const cleanPath = url.pathname.replace(/^\/(api\/)?tg-proxy\/?/, '/');
  const m = cleanPath.match(BOT_PATH_RE);
  if (!m || cleanPath.includes('..') || !allowedBotIds().has(m[1])) {
    return forbidden();
  }
  const targetUrl = new URL(`https://api.telegram.org${cleanPath}${url.search}`);

  const forwardedHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const k = key.toLowerCase();
    if (k !== 'host' && k !== 'connection' && !k.startsWith('x-vercel-')) {
      forwardedHeaders.set(key, value);
    }
  }

  const fetchInit = {
    method: req.method,
    headers: forwardedHeaders,
    redirect: 'follow',
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    fetchInit.body = req.body;
  }

  try {
    const response = await fetch(targetUrl.toString(), fetchInit);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'content-type': response.headers.get('content-type') || 'application/json',
        'access-control-allow-origin': '*',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    });
  }
}
