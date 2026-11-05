#!/usr/bin/env node
// Validates js/glossary.js against the shared contract.
//   node tools/check-glossary.js
const path = require("path");
global.window = global;
require(path.join(__dirname, "..", "js", "catalog.js"));
require(path.join(__dirname, "..", "js", "glossary.js"));
const G = window.GLOSSARY, C = window.CATALOG;
const lessons = new Set(C.flatMap((c) => c.demos.map((d) => d.id)));
const problems = [];
if (!Array.isArray(G) || !G.length) problems.push("window.GLOSSARY is missing or empty");
const ids = new Set();
const cmp = (a, b) => a.localeCompare(b, "en", { sensitivity: "base" });
(G || []).forEach((g, i) => {
  const at = `#${i} ${g && g.id}`;
  for (const k of ["id", "term", "kid", "grown"]) if (typeof g[k] !== "string" || !g[k].trim()) problems.push(`${at}: ${k} is empty`);
  for (const k of ["aliases", "lessons", "see"]) if (!Array.isArray(g[k])) problems.push(`${at}: ${k} must be an array`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id || "")) problems.push(`${at}: id is not kebab-case`);
  if (ids.has(g.id)) problems.push(`${at}: duplicate id`);
  ids.add(g.id);
  if (!(g.lessons || []).length) problems.push(`${at}: no lessons`);
  (g.lessons || []).forEach((l) => { if (!lessons.has(l)) problems.push(`${at}: unknown lesson "${l}"`); });
  if (i && cmp(G[i - 1].term, g.term) > 0) problems.push(`${at}: not sorted ("${G[i - 1].term}" before "${g.term}")`);
});
(G || []).forEach((g) => (g.see || []).forEach((s) => {
  if (!ids.has(s)) problems.push(`${g.id}: see "${s}" not in glossary`);
  if (s === g.id) problems.push(`${g.id}: sees itself`);
}));
if (problems.length) { problems.forEach((m) => console.error("FAIL " + m)); process.exit(1); }
const used = new Set(G.flatMap((g) => g.lessons));
console.log(`OK: ${G.length} terms; ${used.size}/${lessons.size} lessons linked from at least one term.`);
