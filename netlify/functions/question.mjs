import { timingSafeEqual } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { seed } from "../lib/seed.js";
import { steerList, takeFresh, usedKeys } from "../lib/pick.mjs";

const MODEL = "grok-4.7";
const STORE = "linebuzz-asked";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          q: { type: "string" },
          a: { type: "string" },
        },
        required: ["q", "a"],
      },
    },
  },
  required: ["questions"],
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pinsMatch(sent, expected) {
  const left = Buffer.from(String(sent));
  const right = Buffer.from(String(expected));
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function outputText(data) {
  if (typeof data?.output_text === "string" && data.output_text) return data.output_text;
  const parts = [];
  for (const item of data?.output || []) {
    for (const part of item.content || []) {
      if (part.type === "output_text" && part.text) parts.push(part.text);
    }
  }
  return parts.join("");
}

async function loadGenerated() {
  const store = getStore(STORE);
  const saved = await store.get("items", { type: "json" });
  return Array.isArray(saved) ? saved : [];
}

async function saveGenerated(items) {
  const store = getStore(STORE);
  await store.setJSON("items", items.slice(-5000));
}

async function askGrok(theme, count, blocked) {
  const avoid = blocked.length
    ? "Do not use these answers, or close variants of them:\n" + blocked.map((answer) => "- " + answer).join("\n")
    : "Avoid famous trivia that gets asked at every party.";
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      authorization: "Bearer " + process.env.XAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input: [
        {
          role: "system",
          content: "You write fair toss-up questions for a live party game. The host reads the question out loud. The answer is a name, place, or a few words. No multiple choice, no trick wording, and no questions that need a picture.",
        },
        {
          role: "user",
          content: [
            "Write " + (count + 6) + " brand-new questions.",
            "Theme: " + (theme || "mixed general knowledge for adults at a party"),
            "Each answer must be under 6 words.",
            avoid,
          ].join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "trivia_pack",
          strict: true,
          schema: SCHEMA,
        },
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.error?.message || data.error || response.statusText;
    throw new Error("Grok returned " + response.status + (detail ? ": " + detail : ""));
  }
  const parsed = JSON.parse(outputText(data) || "{}");
  return Array.isArray(parsed.questions) ? parsed.questions : [];
}

export default async function handler(req) {
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const pin = process.env.LINEBUZZ_PIN || "";
  if (!process.env.XAI_API_KEY || !pin) {
    return json({ error: "The server still needs XAI_API_KEY and LINEBUZZ_PIN." }, 503);
  }
  if (!pinsMatch(req.headers.get("x-linebuzz-pin") || "", pin)) {
    return json({ error: "Wrong host pin." }, 401);
  }

  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const count = Math.max(1, Math.min(12, Number(body.count) || 8));
  const theme = String(body.theme || "").replace(/\s+/g, " ").trim().slice(0, 120);

  let generated = [];
  try {
    generated = await loadGenerated();
  } catch (err) {
    return json({ error: "Could not open the asked-question list. " + err.message }, 500);
  }

  const history = seed.concat(generated);
  const blocked = steerList(history, 80);
  let fresh = [];
  try {
    const drafted = await askGrok(theme, count, blocked);
    fresh = takeFresh(drafted, usedKeys(history), count);
  } catch (err) {
    return json({ error: err.message }, 502);
  }
  if (!fresh.length) {
    return json({ error: "Grok only suggested questions that were already used. Try a different theme." }, 409);
  }

  try {
    await saveGenerated(generated.concat(fresh));
  } catch (err) {
    return json({ error: "Questions were written but could not be saved. " + err.message }, 500);
  }
  return json({ questions: fresh, saved: history.length + fresh.length });
}
