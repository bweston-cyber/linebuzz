import assert from "node:assert/strict";
import test from "node:test";
import { reduce } from "./room.mjs";

const now = 1_000_000;

test("host creates a room and a player can join", () => {
  const created = reduce(null, { type: "join", role: "host", id: "host", name: "Alex" }, now);
  assert.equal(created.room.phase, "lobby");
  const joined = reduce(created.room, { type: "join", role: "player", id: "p1", name: "Sam" }, now + 1);
  assert.equal(joined.room.players.p1.score, 0);
  assert.equal(joined.room.phase, "idle");
});

test("server gives the lock to the first buzz and ignores the next", () => {
  let room = reduce(null, { type: "join", role: "host", id: "host", name: "Alex" }, now).room;
  room = reduce(room, { type: "join", role: "player", id: "p1", name: "Sam" }, now).room;
  room = reduce(room, { type: "join", role: "player", id: "p2", name: "Jo" }, now).room;
  room = reduce(room, { type: "arm", role: "host", id: "host" }, now).room;
  const first = reduce(room, { type: "buzz", role: "player", id: "p2" }, now);
  assert.equal(first.room.phase, "locked");
  assert.equal(first.room.firstBuzzId, "p2");
  const second = reduce(first.room, { type: "buzz", role: "player", id: "p1" }, now + 5);
  assert.equal(second.unchanged, true);
  assert.equal(first.room.firstBuzzId, "p2");
});

test("a wrong answer locks that player out and reopens the buzzers", () => {
  let room = reduce(null, { type: "join", role: "host", id: "host", name: "Alex" }, now).room;
  room = reduce(room, { type: "join", role: "player", id: "p1", name: "Sam" }, now).room;
  room = reduce(room, { type: "arm", role: "host", id: "host" }, now).room;
  room = reduce(room, { type: "buzz", role: "player", id: "p1" }, now).room;
  room = reduce(room, { type: "wrong", role: "host", id: "host" }, now).room;
  assert.equal(room.phase, "live");
  assert.equal(room.players.p1.score, -1);
  assert.deepEqual(room.lockedOut, ["p1"]);
  const again = reduce(room, { type: "buzz", role: "player", id: "p1" }, now);
  assert.equal(again.unchanged, true);
});

test("correct scores and the same host keeps the score after rejoining", () => {
  let room = reduce(null, { type: "join", role: "host", id: "host", name: "Alex" }, now).room;
  room = reduce(room, { type: "join", role: "player", id: "p1", name: "Sam" }, now).room;
  room = reduce(room, { type: "arm", role: "host", id: "host" }, now).room;
  room = reduce(room, { type: "buzz", role: "player", id: "p1" }, now).room;
  room = reduce(room, { type: "correct", role: "host", id: "host" }, now).room;
  assert.equal(room.players.p1.score, 1);
  assert.equal(room.phase, "idle");
  const again = reduce(room, { type: "join", role: "host", id: "host", name: "Alex" }, now + 1000);
  assert.equal(again.room.players.p1.score, 1);
});

test("a second host cannot take a live room", () => {
  const room = reduce(null, { type: "join", role: "host", id: "host", name: "Alex" }, now).room;
  const stolen = reduce(room, { type: "join", role: "host", id: "other", name: "Pat" }, now + 1000);
  assert.equal(stolen.error, "That room already has a host.");
});
