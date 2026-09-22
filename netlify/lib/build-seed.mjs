import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePack, usedKeys } from "./pick.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = join(here, "../../questions");
const items = [];
const seen = new Set();
for (const name of readdirSync(packDir).sort()) {
  if (!name.endsWith(".txt")) continue;
  for (const item of parsePack(readFileSync(join(packDir, name), "utf8"))) {
    const keys = usedKeys([item]);
    if ([...keys].some((key) => seen.has(key))) continue;
    for (const key of keys) seen.add(key);
    items.push(item);
  }
}
writeFileSync(join(here, "seed.js"), "export const seed = " + JSON.stringify(items) + ";\n");
console.log("seed " + items.length);
