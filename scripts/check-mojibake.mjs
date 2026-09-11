#!/usr/bin/env node
/**
 * scripts/check-mojibake.mjs — text that has been UTF-8 decoded as Windows-1252 and re-saved
 *
 * Auth:   none — local/CI script
 * Data:   git-tracked text files (extension-filtered; `git ls-files -z`)
 * Notes:  M-126 in docs/MECHANISABLE.md · dev-standards L-71. `CLAUDE.md` §8 already states the
 *         rule ("never author a pattern through a shell string… write the script to a file with
 *         an editor"). This is the half that was missing: DETECTION. The rule cannot see damage
 *         that predates it, and the migrations carried 861 corrupted runs entered at `b5636b9d`
 *         (2026-07-06) under a bulk mechanical rewrite, which sat there for two months.
 *
 * WHAT MOJIBAKE IS, EXACTLY, AND WHY THAT MAKES IT DECIDABLE. A shell round-trip of a file on
 * Windows is `decode → transform → encode`, and both codecs are the shell's choice, not yours.
 * When UTF-8 bytes are decoded as cp1252 every multi-byte character becomes two or three Latin-1
 * characters. Save that back as UTF-8 and the damage is real bytes on disk, and it survives every
 * gate here: the file still parses, still diffs, still deploys.
 *
 * The detection is NOT a blacklist of "the Ã / Â / â families". It is the inverse transform
 * itself: take a maximal run of characters cp1252 can represent, encode it back to cp1252 bytes,
 * and try to decode those bytes as STRICT UTF-8. If that succeeds, the run is mojibake — because
 * correctly-encoded text cannot do this. An em dash alone is cp1252 0x97, a lone continuation byte
 * that strict UTF-8 rejects; the box-drawing characters and arrows this repo's SQL headers use are
 * not in cp1252 at all. Only text that already WAS a UTF-8 byte sequence can pass back through,
 * which is the definition of the defect. Nothing has to be enumerated, so nothing can be missed
 * by an enumeration that was written from the damage someone happened to look at.
 *
 * That property is also what makes a repair terminate rather than overshoot: applying the inverse
 * to already-correct text fails, so a fixed point exists and it is the original text.
 *
 * ⚠ DAMAGE STACKS. The migrations carried one AND two levels of it in the same file — an en dash
 * doubly encoded sits eight characters from a singly encoded em dash. So both this check and any
 * repair iterate to a fixed point; a single pass reports a file clean while leaving a level behind,
 * and it is the deeper damage that looks least like the pattern anyone would grep for.
 *
 * ⚠ SEVERITY IS NOT UNIFORM, AND THE COMMENT LINES ARE THE LESS INTERESTING HALF. Most of the
 * damage was in comments and cosmetic. Roughly 32 runs were inside the `$$…$$` clause bodies in
 * `006_seed.sql` that render into generated lease documents. Production was never affected — it
 * was seeded before the corruption and the insert carries `ON CONFLICT DO NOTHING` — which is
 * exactly why nobody would have noticed: only a freshly-seeded environment (a new dev database, a
 * staging project, a disaster-recovery rebuild) gets the garbled legal text, and prod's
 * cleanliness is what would stop anyone believing it.
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

// cp1252's 0x80–0x9F block, which is the whole reason this is lossy in an interesting way: those
// 27 codepoints are what UTF-8 continuation bytes turn into. The five undefined slots
// (0x81 0x8D 0x8F 0x90 0x9D) round-trip as the C1 control of the same value, which is what the
// decoder that caused the damage did — U+0090 appeared 15,371 times in the migrations, and it is
// the third byte of the box-drawing `═` (E2 95 90) surviving the trip INVISIBLY.
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86,
  0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c,
  0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95,
  0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
}

// A maximal run of non-ASCII characters cp1252 can hold. Anything it cannot — the box-drawing
// characters, the arrows, `⚠`, the emoji — is already correct and terminates a run by construction.
//
// ⚠ WRITTEN AS ESCAPES, NEVER AS THE CHARACTERS THEMSELVES. This class contains the C1 controls
// and a `Â`/`â` that are invisible or confusable in an editor, and a character class that silently
// loses one member is how a scan reports 328, then 29, then 21 across three rebuilds (CLAUDE.md
// §6). The escapes are legible in a diff; the characters are not.
const RUN = new RegExp(
  "[\\u0080-\\u00ff\\u0152\\u0153\\u0160\\u0161\\u0178\\u017d\\u017e\\u0192\\u02c6\\u02dc" +
    "\\u2013\\u2014\\u2018\\u2019\\u201a\\u201c\\u201d\\u201e\\u2020\\u2021\\u2022\\u2026" +
    "\\u2030\\u2039\\u203a\\u20ac\\u2122]+",
  "gu",
)

const decoder = new TextDecoder("utf-8", { fatal: true })

function toByte(cp) {
  if (cp <= 0xff) return cp
  return CP1252_HIGH[cp] ?? -1
}

/** One inverse pass, or null when the run is not mojibake at this level. */
function unmojibakeOnce(run) {
  const bytes = []
  for (const ch of run) {
    const b = toByte(ch.codePointAt(0))
    if (b < 0) return null
    bytes.push(b)
  }
  try {
    return decoder.decode(new Uint8Array(bytes))
  } catch {
    return null
  }
}

/** The run's repaired form, and how many levels of damage it carried. */
export function unmojibake(run) {
  let cur = run
  let levels = 0
  for (let i = 0; i < 8; i++) {
    const next = unmojibakeOnce(cur)
    if (next === null || next === cur) break
    cur = next
    levels++
  }
  return { fixed: cur, levels }
}

/** Every mojibake run in `text`, with its 1-indexed line and its repair. */
export function findMojibake(text) {
  const out = []
  text.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(RUN)) {
      const { fixed, levels } = unmojibake(m[0])
      if (levels > 0) {
        out.push({ line: i + 1, found: m[0], fixed, levels, context: line.trim().slice(0, 100) })
      }
    }
  })
  return out
}

// Text this repo owns. Binary and generated trees are excluded by EXTENSION rather than by a
// skip-list of directories: a skip-list is what hides a whole corrupted subtree, and the four
// corrupted files here were all in one directory.
const TEXT_EXT = /\.(sql|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|md|mdx|yml|yaml|css|html|txt|sh)$/i

function trackedTextFiles() {
  const out = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  return out.split("\0").filter(p => p && TEXT_EXT.test(p))
}

// The probe fixtures: real sequences lifted from the damage, named by what they originally were.
//
// ⚠ BUILT FROM CODEPOINTS, NOT WRITTEN AS THE CHARACTERS, AND THIS FILE IS THE PROOF OF WHY. It is
// tracked text, so it scans ITSELF — a fixture written as the characters it stands for makes this
// check fail on its own source, and the only ways out of that are an allowlist entry (forbidden,
// CLAUDE.md §4) or a skip-list that would also hide the next real one. `docs/MECHANISABLE.md` hit
// exactly this and had its M-126 entry rewritten to name the sequences by codepoint.
//
// Codepoints are also the only honest notation here. `BOX_RULE_1` ends in U+0090, a C1 control that
// renders as nothing at all: written literally it and a one-character-shorter version of it are the
// same two glyphs on screen, so a probe that lost the tail would still look right and would be
// testing something else. An editor cannot show you that difference; this can.
const chars = (...cps) => String.fromCodePoint(...cps)

const EM_DASH_1 = chars(0x00e2, 0x20ac, 0x201d) //                    an em dash, once
const SECTION_1 = chars(0x00c2, 0x00a7) //                            a section sign, once
const SECTION_2 = chars(0x00c3, 0x201a, 0x00c2, 0x00a7) //            a section sign, twice
const EN_DASH_2 = chars(0x00c3, 0x00a2, 0x00e2, 0x201a, 0x00ac, 0x00e2, 0x20ac, 0x0153) // en dash, twice
const CEDILLA_2 = chars(0x00c3, 0x0192, 0x00c2, 0x00a7) //            the ç of façade, twice
const BOX_RULE_1 = chars(0x00e2, 0x2022, 0x0090) //                   a box rule, once — C1 tail

function selftest() {
  let failed = 0
  const check = (name, got, want) => {
    if (got === want) console.log(`   ✓ ${name}`)
    else { console.error(`   ✗ ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failed++ }
  }

  console.log("[check-mojibake] selftest — a planted violation must FAIL and known-good text must PASS")

  // ── Direction 1: planted violations are caught, at every depth the migrations actually carried.
  check("single-encoded em dash", findMojibake(`-- a ${EM_DASH_1} b`).length, 1)
  check("single-encoded section sign", findMojibake(`-- ${SECTION_1}32 superseded`).length, 1)
  check("double-encoded section sign", findMojibake(`-- ${SECTION_2}7.2 tokenisation`).length, 1)
  check("double-encoded en dash", findMojibake(`$$In this agreement ${EN_DASH_2}`).length, 1)
  check("double-encoded cedilla mid-word", findMojibake(`its fa${CEDILLA_2}ade, appearance`).length, 1)
  check("box rule whose damage ends in an invisible C1", findMojibake(`-- ${BOX_RULE_1}`).length, 1)

  // The REPAIR is asserted, not only the detection. A check that says "something is wrong here"
  // and cannot say what it should be sends the next person back to the shell that caused this.
  check("em dash repairs", unmojibake(EM_DASH_1).fixed, "—")
  check("section sign repairs", unmojibake(SECTION_1).fixed, "§")
  check("en dash repairs through two levels", unmojibake(EN_DASH_2).fixed, "–")
  check("…and reports both", unmojibake(EN_DASH_2).levels, 2)
  check("cedilla repairs", unmojibake(CEDILLA_2).fixed, "ç")
  check("box rule repairs", unmojibake(BOX_RULE_1).fixed, "═")

  // ── Direction 2: correct text passes. These are the exact characters this repo's SQL headers
  // use, and a check that flagged them would be deleted within a day.
  check("correct em dash", findMojibake("-- a — b").length, 0)
  check("correct box rules, section sign, arrow", findMojibake("-- ═══ ─── §5.2 →").length, 0)
  check("correct accents and maths", findMojibake("café façade ÷ ≈ ² × ≥").length, 0)
  check("correct curly quotes and middot", findMojibake("the “Saved · …” state").length, 0)
  check("warning sign and emoji", findMojibake("⚠ welcome \u{1f44b} \u{1f3e0}").length, 0)
  check("pure ASCII", findMojibake("-- an ordinary comment").length, 0)

  // The repair is idempotent — running it on its own output must be a no-op. Without this a
  // "fix" that overshoots by one level looks green on the first pass and corrupts on the second.
  check("repairing correct text is a no-op", unmojibake("—§é").levels, 0)

  if (failed) {
    console.error(`\n❌ check-mojibake selftest: ${failed} probe(s) failed`)
    process.exit(1)
  }
  console.log("✅ check-mojibake selftest green")
}

function main() {
  const findings = []
  for (const file of trackedTextFiles()) {
    let text
    try {
      text = readFileSync(file, "utf8")
    } catch {
      continue
    }
    for (const f of findMojibake(text)) findings.push({ file, ...f })
  }

  if (findings.length === 0) {
    console.log("✅ mojibake: none in tracked text")
    return
  }

  const byFile = new Map()
  for (const f of findings) byFile.set(f.file, (byFile.get(f.file) ?? 0) + 1)

  console.error(`❌ mojibake: ${findings.length} run(s) in ${byFile.size} file(s) — text decoded as`)
  console.error(`   Windows-1252 and re-saved. See M-126 and CLAUDE.md §8.\n`)
  for (const [file, n] of [...byFile].sort((a, b) => b[1] - a[1])) console.error(`   ${file}: ${n}`)
  console.error("")
  for (const f of findings.slice(0, 20)) {
    console.error(`   ${f.file}:${f.line}  ${JSON.stringify(f.found)} → ${JSON.stringify(f.fixed)}  (${f.levels} level${f.levels > 1 ? "s" : ""})`)
    console.error(`      ${f.context}`)
  }
  if (findings.length > 20) console.error(`   … and ${findings.length - 20} more`)
  console.error(`\n   ⚠ REPAIR WITH AN EDITOR, NOT A SHELL REWRITE. A shell round-trip is what causes`)
  console.error(`   this; reaching for one to fix it is the failure mode, not a shortcut past it.`)
  process.exit(1)
}

if (process.argv.includes("--selftest")) selftest()
else main()
