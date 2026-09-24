const ROOM_TTL_MS = 3 * 60 * 60 * 1000;
const AWAY_MS = 25000;

export function view(room, now) {
  if (!room) return null;
  const players = {};
  for (const [id, player] of Object.entries(room.players || {})) {
    players[id] = {
      name: player.name,
      score: player.score || 0,
      online: now - (player.seen || 0) < AWAY_MS,
    };
  }
  return {
    version: room.version || 0,
    hostId: room.hostId,
    hostName: room.hostName || "",
    phase: room.phase,
    firstBuzzId: room.firstBuzzId || null,
    firstBuzzName: room.firstBuzzName || null,
    lastResult: room.lastResult || null,
    lockedOut: room.lockedOut || [],
    players,
  };
}

function blank(hostId, hostName, now) {
  return {
    version: 1,
    updated: now,
    hostId,
    hostName,
    phase: "lobby",
    firstBuzzId: null,
    firstBuzzName: null,
    lastResult: null,
    lockedOut: [],
    players: {
      [hostId]: { name: hostName, score: 0, seen: now },
    },
  };
}

function bump(room, now) {
  room.version += 1;
  room.updated = now;
}

export function reduce(room, action, now) {
  const id = String(action.id || "").slice(0, 40);
  const name = String(action.name || "Player").trim().slice(0, 20) || "Player";
  const role = action.role === "host" ? "host" : "player";
  const type = action.type;
  if (!id) return { error: "Missing player." };

  if (type === "join" && role === "host") {
    if (!room || (room.hostId !== id && now - (room.updated || 0) > ROOM_TTL_MS)) {
      return { room: blank(id, name, now) };
    }
    if (room.hostId !== id) return { error: "That room already has a host." };
    const score = room.players[id] ? room.players[id].score : 0;
    room.players[id] = { name, score, seen: now };
    room.hostName = name;
    bump(room, now);
    return { room };
  }

  if (!room) return { error: "That room is not open yet. The host has to create it first." };

  if (type === "join") {
    const existing = room.players[id];
    room.players[id] = { name, score: existing ? existing.score : 0, seen: now };
    if (room.phase === "lobby") room.phase = "idle";
    bump(room, now);
    return { room };
  }

  if (type === "seen") {
    if (!room.players[id]) return { error: "Join the room first." };
    room.players[id].seen = now;
    return { room, unchanged: false, quiet: true };
  }

  if (["arm", "correct", "wrong", "reset", "next"].includes(type) && id !== room.hostId) {
    return { error: "Only the host can do that." };
  }

  if (type === "buzz") {
    const player = room.players[id];
    if (!player || id === room.hostId) return { error: "Join as a player first." };
    if (room.phase !== "live" || (room.lockedOut || []).includes(id)) {
      return { room, unchanged: true };
    }
    room.phase = "locked";
    room.firstBuzzId = id;
    room.firstBuzzName = player.name;
    room.lastResult = null;
    player.seen = now;
    bump(room, now);
    return { room, buzzed: true };
  }

  if (type === "arm") {
    room.phase = "live";
    room.firstBuzzId = null;
    room.firstBuzzName = null;
    room.lastResult = null;
    room.lockedOut = [];
    bump(room, now);
    return { room };
  }

  if (type === "correct") {
    if (room.phase !== "locked" || !room.firstBuzzId) return { error: "Nobody has buzzed." };
    const player = room.players[room.firstBuzzId];
    if (player) player.score += 1;
    room.lastResult = (player ? player.name : "Player") + " — correct!";
    room.phase = "idle";
    room.firstBuzzId = null;
    room.firstBuzzName = null;
    bump(room, now);
    return { room };
  }

  if (type === "wrong") {
    if (room.phase !== "locked" || !room.firstBuzzId) return { error: "Nobody has buzzed." };
    const wrongId = room.firstBuzzId;
    const player = room.players[wrongId];
    if (player) player.score -= 1;
    room.lockedOut = room.lockedOut || [];
    if (!room.lockedOut.includes(wrongId)) room.lockedOut.push(wrongId);
    room.lastResult = (room.firstBuzzName || "Player") + " — incorrect (−1)";
    room.phase = "live";
    room.firstBuzzId = null;
    room.firstBuzzName = null;
    bump(room, now);
    return { room };
  }

  if (type === "reset") {
    room.phase = "idle";
    room.firstBuzzId = null;
    room.firstBuzzName = null;
    room.lastResult = null;
    bump(room, now);
    return { room };
  }

  if (type === "next") {
    room.phase = "idle";
    room.firstBuzzId = null;
    room.firstBuzzName = null;
    room.lastResult = null;
    room.lockedOut = [];
    bump(room, now);
    return { room };
  }

  return { error: "Unknown action." };
}
