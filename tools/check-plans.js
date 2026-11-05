#!/usr/bin/env node
// Checks that every lesson id used in js/plans.js exists in js/catalog.js.
//   node tools/check-plans.js
const path = require("path");
global.window = global;
require(path.join(__dirname, "..", "js", "catalog.js"));
require(path.join(__dirname, "..", "js", "plans.js"));
const { paths, classes, validate, totalMinutes, lessonIndex, lessonIds } = window.PLANS;
const idx = lessonIndex(window.CATALOG);
for (const p of [...paths, ...classes]) {
  const n = lessonIds(p).length;
  console.log(`${p.sessions ? "class" : "path "}  ${p.id.padEnd(16)} ${String(n).padStart(2)} lessons  ${String(totalMinutes(p, idx)).padStart(4)} min  [${p.audience.join(", ")}]`);
}
const problems = validate(window.CATALOG);
if (problems.length) { problems.forEach((m) => console.error("FAIL " + m)); process.exit(1); }
console.log(`OK: ${paths.length} paths + ${classes.length} classroom plans; every lesson id resolves.`);
