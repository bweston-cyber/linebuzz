export function normalize(value) {
  let text = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  text = text.replace(/^(the|a|an) /, "");
  return text;
}

export function parsePack(text) {
  const items = [];
  const trimmed = String(text || "").trim();
  if (!trimmed) return items;
  if (trimmed[0] === "[" || trimmed[0] === "{") {
    try {
      const data = JSON.parse(trimmed);
      const arr = Array.isArray(data) ? data : (data.questions || data.items || []);
      for (const row of arr) {
        const q = row.q || row.question || row.prompt;
        const a = row.a || row.answer || row.ans;
        if (q && a) items.push({ q: String(q).trim(), a: String(a).trim() });
      }
      return items;
    } catch {
      /* fall through to the line format */
    }
  }
  let pendingQ = null;
  for (const raw of trimmed.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const numbered = line.match(/^\d+\.\s*(.+)$/);
    if (numbered) {
      if (pendingQ) items.push({ q: pendingQ, a: "" });
      pendingQ = numbered[1].trim();
      continue;
    }
    if (/^(q|question)\s*[:.-]\s*/i.test(line)) {
      if (pendingQ) items.push({ q: pendingQ, a: "" });
      pendingQ = line.replace(/^(q|question)\s*[:.-]\s*/i, "").trim();
      continue;
    }
    if (/^(a|answer)\s*[:.-]\s*/i.test(line)) {
      const a = line.replace(/^(a|answer)\s*[:.-]\s*/i, "").trim();
      if (pendingQ) {
        items.push({ q: pendingQ, a });
        pendingQ = null;
      }
      continue;
    }
    if (pendingQ && !/^(MOVIES|MUSIC|SPORTS|GEOGRAPHY|HISTORY|SCIENCE|FOOD|BIBLE|ODDS|LINEBUZZ|Host only)/i.test(line)) {
      items.push({ q: pendingQ, a: line });
      pendingQ = null;
    }
  }
  return items.filter((item) => item.q && item.a);
}

export function usedKeys(items) {
  const keys = new Set();
  for (const item of items) addKeys(keys, item.q, item.a);
  return keys;
}

function addKeys(keys, question, answer) {
  const q = normalize(question);
  const a = normalize(answer);
  if (q) keys.add("q:" + q);
  if (a) keys.add("a:" + a);
  return keys;
}

export function takeFresh(candidates, used, limit) {
  const accepted = [];
  const seen = new Set(used);
  const max = Math.max(0, limit | 0);
  for (const raw of candidates || []) {
    const q = String(raw?.q || "").replace(/\s+/g, " ").trim();
    const a = String(raw?.a || "").replace(/\s+/g, " ").trim();
    if (!q || !a || q.length > 240 || a.length > 120) continue;
    const nq = normalize(q);
    const na = normalize(a);
    if (!nq || !na) continue;
    if (seen.has("q:" + nq) || seen.has("a:" + na)) continue;
    seen.add("q:" + nq);
    seen.add("a:" + na);
    accepted.push({ q, a });
    if (accepted.length >= max) break;
  }
  return accepted;
}

export function steerList(items, max = 80) {
  const answers = [];
  const seen = new Set();
  for (let i = items.length - 1; i >= 0 && answers.length < max; i--) {
    const answer = String(items[i].a || "").replace(/\s+/g, " ").trim();
    const key = normalize(answer);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }
  return answers;
}
