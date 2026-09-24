import { getStore } from "@netlify/blobs";
import { reduce, view } from "../lib/room.mjs";

const WAIT_MS = 8000;
const STEP_MS = 400;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function rooms() {
  return getStore("linebuzz-rooms", { consistency: "strong" });
}

function roomCode(req) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("room") || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/^[A-Z0-9]{3,6}$/.test(query)) return query;
  const match = url.pathname.toUpperCase().match(/\/ROOM\/([A-Z0-9]{3,6})\/?$/);
  return match ? match[1] : "";
}

async function load(code) {
  const got = await rooms().getWithMetadata(code, { type: "json", consistency: "strong" });
  if (!got || !got.data) return { room: null, etag: undefined };
  return { room: got.data, etag: got.etag };
}

async function commit(code, action) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { room, etag } = await load(code);
    const result = reduce(room, action, Date.now());
    if (result.error) return { error: result.error, room: view(room, Date.now()) };
    if (result.unchanged) return { room: view(room, Date.now()) };
    const wrote = await rooms().setJSON(code, result.room, etag ? { onlyIfMatch: etag } : { onlyIfNew: true });
    if (wrote.modified) return { room: view(result.room, Date.now()), buzzed: !!result.buzzed };
  }
  return { error: "The room was busy. Try again." };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req) {
  const code = roomCode(req);
  if (!code) return json({ error: "Missing room code." }, 400);

  if (req.method === "GET") {
    const url = new URL(req.url);
    const since = Number(url.searchParams.get("since") || 0);
    const id = (url.searchParams.get("id") || "").slice(0, 40);
    if (id) await commit(code, { type: "seen", id });
    const deadline = Date.now() + WAIT_MS;
    let latest = null;
    while (Date.now() < deadline) {
      const { room } = await load(code);
      latest = view(room, Date.now());
      if (latest && latest.version !== since) return json({ room: latest });
      await sleep(STEP_MS);
    }
    return json({ room: latest });
  }

  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const result = await commit(code, body || {});
  return json(result, result.error ? 409 : 200);
}
