/**
 * Cloudflare Worker: reverse proxy to the Gemini API. A safer version of the one in production (draft, not deployed).
 *
 * What changed against the old worker (it is public and holds the Google keys in its source):
 *  - the Google keys live in a Worker SECRET (GEMINI_KEYS, one string, keys separated by commas), never in the code;
 *  - the caller proves itself with its OWN token: `?key=<PROXY_TOKEN>` (the URL shape n8n and the API already use, only
 *    the value changes). The Worker compares it with the secret PROXY_TOKEN, a random string that is NOT a Google key;
 *  - only model calls are forwarded (generateContent / streamGenerateContent): bots probing other paths get 404
 *    without costing a request to Google;
 *  - keys are rotated on 429 only (quota). A rotation on 503 would multiply the load on an overloaded model.
 *
 * Setup (Cloudflare dashboard -> Workers -> gemini-proxy -> Settings -> Variables and Secrets):
 *   GEMINI_KEYS  = <key1>,<key2>,<key3>,<key4>          (type: Secret)
 *   PROXY_TOKEN  = <a new long random string>           (type: Secret)
 * Then replace the old code with this file, deploy, and change the token in: GEMINI_PROXY_KEY on the server and the
 * `key=` of the four Gemini nodes (17, 17a, 17b, 17c) of the n8n workflow.
 */
const ALLOWED = /^\/v1beta\/models\/[A-Za-z0-9._-]+:(generateContent|streamGenerateContent)$/;

const json = (status, message) =>
  new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method !== "POST" || !ALLOWED.test(url.pathname)) return json(404, "Not found");

    const token = url.searchParams.get("key") || "";
    if (!env.PROXY_TOKEN || token !== env.PROXY_TOKEN) return json(401, "Unauthorized");

    const keys = (env.GEMINI_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length === 0) return json(500, "No Gemini keys configured");

    const body = await request.arrayBuffer();
    let last = null;
    for (const key of keys) {
      const target = new URL(`https://generativelanguage.googleapis.com${url.pathname}`);
      url.searchParams.forEach((value, name) => {
        if (name !== "key") target.searchParams.set(name, value);
      });
      target.searchParams.set("key", key);

      const response = await fetch(target.toString(), {
        method: "POST",
        headers: { "Content-Type": request.headers.get("Content-Type") || "application/json" },
        body,
      });
      if (response.status !== 429) return response; // success, or an error another key cannot fix
      last = response; // 429: this key's quota is spent, try the next one
    }
    return last;
  },
};
