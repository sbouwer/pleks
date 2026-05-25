/**
 * scripts/check-marketing-consistency.mjs
 * Three-class marketing consistency CI gate (ADDENDUM_00J §4, D-MKT-12/13)
 *
 * Class 1 — Numeric drift: hardcoded count strings that must derive from MARKETING_FACTS
 * Class 2 — Dead anchor: charter card hrefs must resolve to existing id= anchors
 * Class 3 — Canonical phrase: no non-canonical variants in public surfaces
 *
 * Exit 0 = clean. Exit 1 = violations found.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROOT = process.cwd()

function readFile(p) {
  try { return readFileSync(p, "utf8") } catch { return "" }
}

function walkTsx(dir, out = []) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) walkTsx(full, out)
    else if (e.name.endsWith(".tsx") || e.name.endsWith(".ts")) out.push(full)
  }
  return out
}

const PUBLIC_FILES = [
  join(ROOT, "app", "(public)"),
  join(ROOT, "components", "marketing"),
].flatMap(d => walkTsx(d))

let errors = 0

function fail(cls, file, line, detail) {
  const rel = file.replace(ROOT + "\\", "").replace(ROOT + "/", "")
  const loc = line > 0 ? `:${line}` : ""
  console.error(`[marketing-consistency] FAIL [${cls}] ${rel}${loc} — ${detail}`)
  errors++
}

// ── Class 1: Numeric drift ────────────────────────────────────────────────────
// Previously-hardcoded count strings that must now derive from MARKETING_FACTS.
// These patterns catch regressions where a developer hardcodes the count again.

const DRIFT_PATTERNS = [
  [/\b12\s+platform purposes\b/i,                 "Class1:numeric-drift", 'use {MARKETING_FACTS.popiaPurposes.partA}'],
  [/\b27\s+(agency-side|operator)\s+purposes\b/i, "Class1:numeric-drift", 'use {MARKETING_FACTS.popiaPurposes.partB}'],
  [/These\s+12\s+purposes\b/i,                    "Class1:numeric-drift", 'use {MARKETING_FACTS.popiaPurposes.partA}'],
  [/\b(Eight|8)\s+commitments\b/i,                "Class1:numeric-drift", 'use {MARKETING_FACTS.charter.total}'],
  [/\b39\s+processing activities\b/i,             "Class1:numeric-drift", 'use {MARKETING_FACTS.popiaPurposes.total}'],
]

for (const file of PUBLIC_FILES) {
  const lines = readFile(file).split("\n")
  for (let i = 0; i < lines.length; i++) {
    for (const [pattern, cls, hint] of DRIFT_PATTERNS) {
      if (pattern.test(lines[i])) {
        fail(cls, file, i + 1, `Hardcoded count — ${hint}`)
      }
    }
  }
}

// ── Class 2: Dead anchor ──────────────────────────────────────────────────────
// Charter commitment hrefs containing # must resolve to id="anchor" in the target page.

const COMMITMENTS_FILE = join(ROOT, "components", "marketing", "charter", "commitments.tsx")
const commitmentsSource = readFile(COMMITMENTS_FILE)
const hrefMatches = [...commitmentsSource.matchAll(/href:\s*["']([^"']+#[^"']+)["']/g)]

for (const [, href] of hrefMatches) {
  const hashIdx = href.indexOf("#")
  const path = href.slice(0, hashIdx).replace(/^\//, "")
  const anchor = href.slice(hashIdx + 1)
  const targetFile = join(ROOT, "app", "(public)", path, "page.tsx")
  const targetSource = readFile(targetFile)
  if (!targetSource) {
    fail("Class2:dead-anchor", COMMITMENTS_FILE, 0,
      `href="${href}" — target page not found: app/(public)/${path}/page.tsx`)
    continue
  }
  if (!new RegExp(`id=["']${anchor}["']`).test(targetSource)) {
    fail("Class2:dead-anchor", COMMITMENTS_FILE, 0,
      `href="${href}" — anchor id="${anchor}" not found in app/(public)/${path}/page.tsx`)
  }
}

// ── Class 3: Canonical phrase drift ──────────────────────────────────────────
// Non-canonical variants of phrases in lib/marketing/canonical-phrases.ts.
// Canonical forms: "Section 86 trust account", "PDF + JSON + ZIP",
//                  "72 hours", "Information Regulator"

const PHRASE_DRIFT = [
  // Pattern (case-sensitive unless noted)    human-readable detail
  [/PDF \+ JSON(?!\s*\+\s*ZIP)/,              '"PDF + JSON" missing ZIP — canonical: "PDF + JSON + ZIP"'],
  [/\b72\s*hr(s)?\b/i,                        '"72hr/72hrs" — canonical: "72 hours"'],
  [/\binformation regulator\b/,               '"information regulator" — canonical: "Information Regulator"'],
  [/Information regulator\b/,                 '"Information regulator" (lowercase r) — canonical: "Information Regulator"'],
  [/section 86 trust account/,               '"section 86 trust account" — canonical: "Section 86 trust account"'],
]

for (const file of PUBLIC_FILES) {
  const lines = readFile(file).split("\n")
  for (let i = 0; i < lines.length; i++) {
    for (const [pattern, detail] of PHRASE_DRIFT) {
      if (pattern.test(lines[i])) {
        fail("Class3:phrase-drift", file, i + 1, detail)
      }
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
if (errors === 0) {
  console.log("[marketing-consistency] OK — numeric drift, dead anchors, canonical phrases all clean")
  process.exit(0)
} else {
  console.error(`[marketing-consistency] FAIL — ${errors} violation(s) found`)
  process.exit(1)
}
