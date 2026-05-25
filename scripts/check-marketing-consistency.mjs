/**
 * scripts/check-marketing-consistency.mjs
 * Three-class marketing consistency CI gate (ADDENDUM_00J §4, D-MKT-12/13/14/15)
 *
 * Class 1 — Numeric drift: hardcoded count strings that must derive from MARKETING_FACTS
 * Class 2 — Dead anchor: charter card hrefs must resolve to existing id= anchors
 * Class 3 — Canonical phrase: no non-canonical variants in public surfaces
 *
 * Ignore annotation: add `// marketing-consistency-ignore[: reason]` on the violation
 * line or the line immediately preceding it to suppress a specific violation.
 *
 * Class 3 derives canonical phrases from lib/marketing/canonical-phrases.ts (SSOT).
 * Extra structural patterns (abbreviation drift, substring drift) are listed in
 * EXTRA_DRIFT_PATTERNS and supplement the auto-derived case-drift checks.
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
let skipped = 0
const skipReasons = []

function getIgnoreAnnotation(lines, lineIdx) {
  const MARKER = "// marketing-consistency-ignore"
  const current = lines[lineIdx] ?? ""
  const prev    = lineIdx > 0 ? (lines[lineIdx - 1] ?? "") : ""
  for (const src of [current, prev]) {
    const idx = src.indexOf(MARKER)
    if (idx !== -1) {
      const reason = src.slice(idx + MARKER.length).replace(/^:\s*/, "").trim()
      return reason || "(no reason given)"
    }
  }
  return null
}

function fail(cls, file, line, detail) {
  const rel = file.replace(ROOT + "\\", "").replace(ROOT + "/", "")
  const loc = line > 0 ? `:${line}` : ""
  console.error(`[marketing-consistency] FAIL [${cls}] ${rel}${loc} — ${detail}`)
  errors++
}

function recordSkip(file, lineNum, reason) {
  skipped++
  skipReasons.push(`${file}:${lineNum} — ${reason}`)
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
        const reason = getIgnoreAnnotation(lines, i)
        if (reason === null) {
          fail(cls, file, i + 1, `Hardcoded count — ${hint}`)
        } else {
          recordSkip(file, i + 1, reason)
        }
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
  if (targetSource) {
    if (!new RegExp(`id=["']${anchor}["']`).test(targetSource)) {
      fail("Class2:dead-anchor", COMMITMENTS_FILE, 0,
        `href="${href}" — anchor id="${anchor}" not found in app/(public)/${path}/page.tsx`)
    }
  } else {
    fail("Class2:dead-anchor", COMMITMENTS_FILE, 0,
      `href="${href}" — target page not found: app/(public)/${path}/page.tsx`)
  }
}

// ── Class 3: Canonical phrase drift ──────────────────────────────────────────
// Derives canonical phrases from lib/marketing/canonical-phrases.ts (SSOT).
// Auto-generates case-drift checks for each phrase.
// Extra structural patterns supplement for drift that case-checking cannot catch.

function parseCanonicalPhrases(filepath) {
  const src = readFile(filepath)
  const matches = [...src.matchAll(/["']([^"'\r\n]{4,})["']/g)]
  return [...new Set(matches.map(m => m[1]).filter(p => p.length >= 4))]
}

const CANONICAL_PHRASES_FILE = join(ROOT, "lib", "marketing", "canonical-phrases.ts")
const CANONICAL_PHRASES = parseCanonicalPhrases(CANONICAL_PHRASES_FILE)

// Patterns for structural drift that case-comparison cannot auto-detect.
const EXTRA_DRIFT_PATTERNS = [
  [/PDF \+ JSON(?!\s*\+\s*ZIP)/,  '"PDF + JSON" without ZIP — canonical: "PDF + JSON + ZIP"'],
  [/\b72\s*hr(s)?\b/i,            '"72hr/72hrs" — canonical: "72 hours"'],
]

for (const file of PUBLIC_FILES) {
  const lines = readFile(file).split("\n")
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const reason = getIgnoreAnnotation(lines, i)

    // Auto-derived case-drift check for each canonical phrase
    for (const phrase of CANONICAL_PHRASES) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
      const re = new RegExp(escaped, "gi")
      let m
      while ((m = re.exec(line)) !== null) {
        if (m[0] === phrase) continue  // exact canonical match — fine
        if (reason === null) {
          fail("Class3:phrase-drift", file, i + 1, `"${m[0]}" — canonical: "${phrase}"`)
        } else {
          recordSkip(file, i + 1, reason)
        }
      }
    }

    // Extra structural patterns
    for (const [pattern, detail] of EXTRA_DRIFT_PATTERNS) {
      if (pattern.test(line)) {
        if (reason === null) {
          fail("Class3:phrase-drift", file, i + 1, detail)
        } else {
          recordSkip(file, i + 1, reason)
        }
      }
    }
  }
}

// ── Result ────────────────────────────────────────────────────────────────────
if (skipped > 0) {
  console.log(`[marketing-consistency] ${skipped} violation(s) suppressed via ignore annotation:`)
  for (const r of skipReasons) console.log(`  ↳ ${r}`)
}
if (errors === 0) {
  console.log("[marketing-consistency] OK — numeric drift, dead anchors, canonical phrases all clean")
  process.exit(0)
} else {
  console.error(`[marketing-consistency] FAIL — ${errors} violation(s) found`)
  process.exit(1)
}
