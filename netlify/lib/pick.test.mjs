import assert from "node:assert/strict";
import test from "node:test";
import { normalize, parsePack, takeFresh, usedKeys } from "./pick.mjs";

test("normalize ignores case, punctuation, and a leading the", () => {
  assert.equal(normalize("The Beatles!"), "beatles");
  assert.equal(normalize("  Ottawa. "), "ottawa");
});

test("parsePack reads numbered lines and the answer on the next line", () => {
  const items = parsePack("GENERAL\n1. What is the capital of Canada?\n   Ottawa\n");
  assert.deepEqual(items, [{ q: "What is the capital of Canada?", a: "Ottawa" }]);
});

test("takeFresh drops a reworded question with an answer already used", () => {
  const used = usedKeys([{ q: "What is the capital of Canada?", a: "Ottawa" }]);
  const fresh = takeFresh(
    [
      { q: "Name Canada's capital city.", a: "Ottawa" },
      { q: "What is the capital of Canada?", a: "Ottawa, Ontario" },
      { q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci" },
    ],
    used,
    5
  );
  assert.deepEqual(fresh, [{ q: "Who painted the Mona Lisa?", a: "Leonardo da Vinci" }]);
});

test("takeFresh drops duplicates inside one new batch", () => {
  const fresh = takeFresh(
    [
      { q: "Capital of France?", a: "Paris" },
      { q: "Which city is the capital of France?", a: "Paris" },
    ],
    new Set(),
    5
  );
  assert.equal(fresh.length, 1);
});
