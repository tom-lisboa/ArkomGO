#!/usr/bin/env node
/* ============================================================
   verify-playbook-coverage.mjs — gate do Bloco B (popover-preview).

   Garante que o PLAYBOOK (EN, components/map/playbook-data.ts) e o
   PLAYBOOK_PT (PT, lib/playbook-pt.ts) cobrem 71/71 os nós do mapa
   (skilltree-data.ts), que os `req` (pills BUILDS ON) apontam para nós
   reais do tree (ou "Company Knowledge Base"), e que a copy dos 68 nós
   autorais (todos menos os 3 já cobertos) é ÚNICA — nenhuma string de
   ladder/human/replaces repetida, em EN nem em PT.

   Uso: node scripts/verify-playbook-coverage.mjs   → exit 0 verde / 1 vermelho.
   ============================================================ */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const TREE = join(ROOT, "src/components/map/skilltree-data.ts");
const PB_EN = join(ROOT, "src/components/map/playbook-data.ts");
const PB_PT = join(ROOT, "src/lib/playbook-pt.ts");

/** nós já cobertos antes deste trabalho — mantidos como estão (a copy `replaces`
 *  deles compartilha o benchmark "Traditional-build"). Ficam fora da checagem de
 *  unicidade e de req; a checagem autoral é sobre os 68 restantes. */
const PRE_COVERED = new Set(["FinanceAI", "Bilhon Ads", "SDR Suite · Bia"]);

const CKB = "Company Knowledge Base"; // nó zero — req válido especial.

const errors = [];
const fail = (msg) => errors.push(msg);

/* ---- 1) nomes de job do tree (todas as chamadas L("<nome>", …)) ---- */
function treeJobNames(text) {
  const re = /\bL\(\s*"((?:[^"\\]|\\.)*)"/g;
  const names = [];
  let m;
  while ((m = re.exec(text))) names.push(JSON.parse(`"${m[1]}"`));
  return names;
}

/* ---- 2) extrai um objeto literal `export const NAME … = { … }` via um scanner
   que respeita strings (braces dentro de "{company}" não contam) e o avalia. ---- */
function extractObject(text, constName) {
  const marker = `export const ${constName}`;
  const at = text.indexOf(marker);
  if (at < 0) throw new Error(`não achei ${constName} em ${constName}`);
  const braceStart = text.indexOf("{", at);
  if (braceStart < 0) throw new Error(`sem '{' após ${constName}`);
  let depth = 0;
  let str = null; // aspa aberta atual (" ' ou `)
  let i = braceStart;
  for (; i < text.length; i++) {
    const c = text[i];
    if (str) {
      if (c === "\\") { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { i++; break; } }
  }
  const objText = text.slice(braceStart, i);
  return Function(`"use strict"; return (${objText});`)();
}

/* ---- carga ---- */
let treeNames, PLAYBOOK, PLAYBOOK_PT;
try {
  treeNames = treeJobNames(readFileSync(TREE, "utf8"));
  PLAYBOOK = extractObject(readFileSync(PB_EN, "utf8"), "PLAYBOOK");
  PLAYBOOK_PT = extractObject(readFileSync(PB_PT, "utf8"), "PLAYBOOK_PT");
} catch (e) {
  console.error("FALHA ao carregar dados:", e.message);
  process.exit(1);
}

const uniqTree = [...new Set(treeNames)];
if (uniqTree.length !== 71) {
  fail(`esperava 71 nós no tree, achei ${uniqTree.length}.`);
}

/* ---- 3) cobertura 71/71 em ambos os mapas ---- */
const enKeys = new Set(Object.keys(PLAYBOOK));
const ptKeys = new Set(Object.keys(PLAYBOOK_PT));
const missingEn = uniqTree.filter((n) => !enKeys.has(n));
const missingPt = uniqTree.filter((n) => !ptKeys.has(n));
if (missingEn.length) fail(`PLAYBOOK (EN) sem entrada p/ ${missingEn.length} nó(s):\n   - ${missingEn.join("\n   - ")}`);
if (missingPt.length) fail(`PLAYBOOK_PT (PT) sem entrada p/ ${missingPt.length} nó(s):\n   - ${missingPt.join("\n   - ")}`);

const authored = uniqTree.filter((n) => !PRE_COVERED.has(n)); // os 68

/* ---- 4) req aponta p/ nó real do tree (ou CKB) — só nos 68 autorais ---- */
const treeSet = new Set(uniqTree);
for (const name of authored) {
  const e = PLAYBOOK[name];
  if (!e) continue;
  if (!Array.isArray(e.req)) { fail(`${name}: req não é array.`); continue; }
  for (const r of e.req) {
    if (r !== CKB && !treeSet.has(r)) {
      fail(`${name}: req "${r}" não existe no tree (nem é "${CKB}").`);
    }
  }
}

/* ---- 5) unicidade global das strings (EN e PT separados), só nos 68 ---- */
function checkUnique(lang, pick) {
  const seen = new Map(); // string -> primeiro nó
  for (const name of authored) {
    for (const { field, value } of pick(name)) {
      if (value == null || value === "") {
        fail(`${name}: campo ${lang}.${field} vazio (os 68 exigem copy sob medida).`);
        continue;
      }
      const key = value.trim();
      if (seen.has(key)) {
        fail(`repetição ${lang}.${field}: "${name}" repete a string de "${seen.get(key)}".`);
      } else {
        seen.set(key, name);
      }
    }
  }
}

checkUnique("EN", (name) => {
  const e = PLAYBOOK[name] ?? {};
  const l = e.ladder ?? {};
  return [
    { field: "ladder.manual", value: l.manual },
    { field: "ladder.assisted", value: l.assisted },
    { field: "ladder.autonomous", value: l.autonomous },
    { field: "human", value: e.human },
    { field: "replaces", value: e.replaces },
  ];
});

checkUnique("PT", (name) => {
  const e = PLAYBOOK_PT[name] ?? {};
  return [
    { field: "ladderManual", value: e.ladderManual },
    { field: "ladderAssisted", value: e.ladderAssisted },
    { field: "ladderAutonomous", value: e.ladderAutonomous },
    { field: "human", value: e.human },
    { field: "replaces", value: e.replaces },
  ];
});

/* ---- relatório ---- */
if (errors.length) {
  console.error("✗ verify-playbook-coverage: FALHOU\n");
  for (const e of errors) console.error("  • " + e);
  console.error(`\n${errors.length} problema(s). Cobertura EN ${enKeys.size ? uniqTree.length - missingEn.length : 0}/71 · PT ${uniqTree.length - missingPt.length}/71.`);
  process.exit(1);
}

console.log("✓ verify-playbook-coverage: OK");
console.log(`  cobertura: 71/71 EN · 71/71 PT`);
console.log(`  ${authored.length} nós autorais · strings de ladder/human/replaces únicas (EN e PT).`);
process.exit(0);
