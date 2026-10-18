export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  // Match and strip the proxy prefix, e.g. /api/tg-proxy/... or /tg-proxy/...
  const cleanPath = url.pathname.replace(/^\/(api\/)?tg-proxy\/?/, '/');
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
