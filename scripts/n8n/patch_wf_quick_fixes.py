"""
n8n workflow "Analysis of sales department calls": two small fixes found by the audit-tab review.

Usage: python3 patch_wf_quick_fixes.py <exported.json> <patched.json> [<node_check.js>]

1. Node 15 sent `Authorization: Bearer <the tenant's amoCRM token>` to WHATEVER host the recording link names. The
   link comes from a call note written by a telephony provider, so the token of the client's CRM went to that
   provider (TNT-001: all 10 links are asales.pro). Now the token goes only to the client's own amoCRM domain
   (and its *.amocrm.ru / *.amocrm.com / *.kommo.com subdomains); any other host gets a harmless X-Revops-Source.
2. Node 18 turned a response that ends with ONE EXTRA '}' into "JSON parse error from Gemini response": two strong
   calls (10/13 and 11/13) of TNT-004 showed as "Сбой анализа". The object is complete, so trailing braces are
   dropped (at most three) until it parses; a response that is still invalid stays a failed audit.

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


# --- 1. node 15: the CRM token goes to the CRM only ---
OWN_HOST = (
    "(() => { const m = String($json.audio_url || '').match(/^https?:\\/\\/([^\\/:?#]+)/i); "
    "const h = m ? m[1].toLowerCase() : ''; "
    "const d = String($json.amo_domain || '').replace(/^https?:\\/\\//i, '').replace(/\\/+$/, '').toLowerCase(); "
    "return Boolean(h) && Boolean(d) && (h === d || h.endsWith('.amocrm.ru') || h.endsWith('.amocrm.com') || h.endsWith('.kommo.com')); })()"
)
n15 = node("15. ")
headers = n15["parameters"]["headerParameters"]["parameters"]
auth = [h for h in headers if h["name"] == "Authorization"]
assert len(auth) == 1 and auth[0]["value"] == "=Bearer {{ $json.amo_token || '' }}", headers
auth[0]["name"] = "={{ " + OWN_HOST + " ? 'Authorization' : 'X-Revops-Source' }}"
auth[0]["value"] = "={{ " + OWN_HOST + " ? ('Bearer ' + ($json.amo_token || '')) : 'n8n' }}"

# --- 2. node 18: one extra closing brace is not a failed audit ---
n18 = node("18. ")
J = "jsCode"
replace_once(n18, J, "  let data = {};\n  try {\n    data = JSON.parse(rawText);\n",
             """  // Gemini sometimes ends a complete object with one extra '}': drop trailing braces (at most 3) until it parses.
  const parseTrimmed = (s) => {
    let t = s.trim();
    for (let k = 0; k < 4; k++) {
      try { return JSON.parse(t); } catch (e) { if (!t.endsWith('}')) throw e; t = t.slice(0, -1).trimEnd(); }
    }
    throw new Error('JSON is still invalid after trimming');
  };

  let data = {};
  try {
    data = parseTrimmed(rawText);
""")
replace_once(n18, J, "        data = JSON.parse(jsonMatch[0]);\n", "        data = parseTrimmed(jsonMatch[0]);\n")

json.dump([wf], open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)

if len(sys.argv) > 3:  # for `node --check`: a Code node body is an async function body
    with open(sys.argv[3], "w", encoding="utf-8") as f:
        f.write("(async function () {\n" + n18["parameters"][J] + "\n})\n")

print("patched:", n15["name"][:22], "|", n18["name"][:20])
