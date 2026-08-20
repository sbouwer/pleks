#!/usr/bin/env node
/**
 * scripts/check-extension-stem-pairs.mjs — a `.ts` and a `.tsx` must never share a stem.
 *
 * CLAUDE.md (DO NOT DO): "Do not split an extension migration across commits — when changing a
 * file extension (.ts → .tsx, .js → .ts, etc.), delete the predecessor in the same commit that
 * introduces the successor." M-041 in docs/MECHANISABLE.md names the mechanism this file builds.
 *
 * WHY THIS MATTERS: TypeScript's module resolution prefers `.ts` over `.tsx` for an unextended
 * specifier. A migration that adds `foo.tsx` and forgets to delete `foo.ts` in the same commit
 * does not fail the build — it silently masks the new file. Every import of `./foo` keeps
 * resolving to the stale `.ts`, and the `.tsx` sits in the tree, reviewed and merged, doing
 * nothing. That is exactly the silent-defect class this repo builds checks for rather than prose.
 *
 * A SIBLING HAZARD, reported separately (see `findCaseInsensitiveStemPairs` below): win32 and
 * macOS default filesystems are case-insensitive, so `lib/Card.ts` and `lib/card.tsx` resolve
 * `import "./card"` to whichever one the OS's case-folding happens to hand back (observed:
 * `Card.ts` wins on both platforms) — masking the `.tsx` the same way, but ONLY on the platforms
 * most contributors develop on. Linux CI sees two distinct files and reports nothing wrong, for
 * the wrong reason. Different remedy from an exact-stem pair (rename one file to disambiguate,
 * rather than delete a stale predecessor), so it is a separate, distinctly-labelled finding, not
 * merged into the exact-match list.
 *
 * SCOPE: whole tree (`.tsx` ↔ `.ts` same-directory, same-stem pairs), no `app`/`lib`/`components`
 * restriction — a stray pair anywhere the walk reaches is the same defect class as one in `app/`.
 * `scripts/` IS walked (unlike `check-csv-escaping.mjs`, which excludes it for CSV-specific
 * reasons that don't apply here) — but `scripts/` itself carries no TypeScript-resolution hazard,
 * because `tsconfig.json`'s `"exclude": ["node_modules", "scripts"]` means nothing under it is
 * ever compiled or module-resolved by `tsc`; a stem pair there is still worth flagging as tree
 * hygiene, just not for the resolution-masking reason the rest of this file is about.
 * `eslint-rules/` is NOT walked in practice, not because of any exclusion here but because that
 * directory is 100% `.mjs`/`.json` (confirmed at grounding) — the `.tsx?$` filter below never
 * matches anything in it. Deliberately NOT restricted to non-test files either: unlike
 * check-import-cycles.mjs (where a test importing its subject is not a cycle), a stem collision
 * inside a test-fixture directory is exactly as dangerous as one in application code —
 * TypeScript's resolution rule does not care whether the shadowed file is a test. `.d.ts` files
 * are excluded entirely from the file census (see `sourceFiles`): this repo has ZERO tracked
 * `.d.ts` files today (confirmed via `git ls-files '*.d.ts'`) — `next-env.d.ts` exists on disk but
 * is gitignored, generated fresh by `next dev`/`next build`, and carries no `.ts` stem-mate anyway.
 * The exclusion exists to keep the `.ts`-side census honest (a hand-written `foo.d.ts` beside
 * `foo.ts` is a legitimate, deliberate pairing elsewhere in the TypeScript ecosystem, and is not
 * the defect this check exists to catch), not because a `.d.ts` could ever collide by stem — it
 * can't: `basename("foo.d.ts", ".ts")` is `"foo.d"`, which never equals `"foo"`.
 *
 * As of the grounding pass for M-041 (2026-08-20), a full-tree scan found ZERO `.ts`/`.tsx` stem
 * pairs, exact or case-insensitive (966 `.tsx`, 1006 `.ts`). This check therefore ships with NO
 * baseline — following check-csv-escaping.mjs's shape rather than check-import-cycles.mjs's,
 * because a baseline exists to grandfather live violations and there are none to grandfather. It
 * is a pure regression guard.
 *
 * Run: node scripts/check-extension-stem-pairs.mjs             (wired into `npm run check`)
 *      node scripts/check-extension-stem-pairs.mjs <root>       (scan an arbitrary root — used by
 *                                                                 --selftest's subprocess probes;
 *                                                                 skips the git reconciliation and
 *                                                                 file-count floor, both of which
 *                                                                 assume the real repo tree)
 *      node scripts/check-extension-stem-pairs.mjs --selftest  (probes both directions)
 */
import { readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs"
import { join, dirname, extname, basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { spawnSync } from "node:child_process"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
// Narrowed at M-041 walk review: "generated" and "build" are legal, real directory names in this
// tree (lib/comms/templates/seed/generated/ holds real seed source) — either could hide a live
// stem collision from the walk. Only genuinely tool-owned, never-hand-authored directories remain.
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "coverage", "dist"])

/**
 * Every `.ts`/`.tsx` file in the tree, `.d.ts` excluded. Whole-tree walk, no directory allowlist
 * and no test-file exclusion — see header for why both differ from check-import-cycles.mjs.
 */
export function sourceFiles(root = ROOT, skipDirs = SKIP_DIRS) {
  const out = []
  ;(function walk(dir) {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (skipDirs.has(e.name)) continue
        walk(join(dir, e.name))
        continue
      }
      const name = e.name
      // Keeps the file census honest — see header. NOT a stem-collision guard: a `.d.ts` file's
      // stem (basename minus `.ts`) is always `*.d`, which cannot equal a `.ts`/`.tsx` stem, so
      // removing this line would not create a false-positive collision. It exists so a `.d.ts`
      // file never appears in `sourceFiles`'s output at all, the way the header promises.
      if (name.endsWith(".d.ts")) continue
      if (/\.tsx?$/.test(name)) out.push(join(dir, name).replace(/\\/g, "/"))
    }
  })(root.replace(/\\/g, "/"))
  return out
}

/**
 * Group files by `directory + stem` (basename minus extension) and return every group that has
 * BOTH a `.ts` and a `.tsx` member — the collision this check exists to catch. Route-group parens
 * in Next.js paths (`app/(dashboard)/...`) are just directory-name characters here; they do not
 * affect stem comparison at all. Case-EXACT: `Foo.ts` vs `foo.tsx` will not appear here even
 * though it collides on a case-insensitive filesystem — see `findCaseInsensitiveStemPairs`.
 */
export function findStemPairs(files) {
  const groups = new Map()
  for (const f of files) {
    const dir = dirname(f)
    const ext = extname(f)
    const stem = basename(f, ext)
    const key = `${dir}/${stem}`
    if (!groups.has(key)) groups.set(key, {})
    groups.get(key)[ext] = f
  }
  const pairs = []
  for (const [key, byExt] of groups) {
    if (byExt[".ts"] && byExt[".tsx"]) pairs.push({ key, ts: byExt[".ts"], tsx: byExt[".tsx"] })
  }
  return pairs.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Same defect, different trigger: a `.ts` and a `.tsx` in the same directory whose stems match
 * ONLY when case-folded (`Card.ts` / `card.tsx`). On win32/macOS's default case-insensitive
 * filesystem this masks the `.tsx` exactly like an exact-stem pair does; on Linux (incl. most CI)
 * the two are distinct files on disk and nothing looks wrong there — which is precisely why it
 * needs its own detector rather than relying on a case-sensitive CI runner to catch it. Excludes
 * exact-case matches (`t.stem !== x.stem` below) — those are already `findStemPairs`'s job, and
 * double-reporting the same pair under two headings would make both lists harder to trust.
 */
export function findCaseInsensitiveStemPairs(files) {
  const groups = new Map()
  for (const f of files) {
    const dir = dirname(f)
    const ext = extname(f)
    const stem = basename(f, ext)
    const key = `${dir}/${stem.toLowerCase()}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ file: f, ext, stem })
  }
  const pairs = []
  for (const [key, entries] of groups) {
    const tsEntries = entries.filter((e) => e.ext === ".ts")
    const tsxEntries = entries.filter((e) => e.ext === ".tsx")
    for (const t of tsEntries) {
      for (const x of tsxEntries) {
        if (t.stem !== x.stem) pairs.push({ key, ts: t.file, tsx: x.file })
      }
    }
  }
  return pairs.sort((a, b) => a.key.localeCompare(b.key))
}

// Deliberately a SEPARATE literal from `SKIP_DIRS`, not an alias of it, even though the values
// are identical today. `SKIP_DIRS` is what `sourceFiles` (the thing under test) reads; if this
// function read the same binding, a future regression that grows `SKIP_DIRS` (exactly the
// M-041-review incident: "app"/"generated"/"build" all being live, hand-authored directories)
// would narrow BOTH sides of the reconciliation identically and the two would keep agreeing —
// silently defeating the one check whose entire job is to catch that class of regression. A
// small over-reach (a directory holding a few dozen files, not enough to trip the file-count
// floor below) would pass undetected. Kept independent on purpose.
const GIT_RECONCILE_SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "coverage", "dist"])

/**
 * The file set `git` knows about (staged/tracked + untracked-but-not-ignored), narrowed by
 * `GIT_RECONCILE_SKIP_DIRS` (see above — independent of `SKIP_DIRS` on purpose). `--others
 * --exclude-standard` alongside `--cached` matters: a plain `git ls-files` lists only the INDEX,
 * so a brand-new `.ts` file created but not yet `git add`ed would read as "the walk found it, git
 * doesn't know it" every time a contributor runs `npm run check` mid-edit — a false alarm this
 * reconciliation must not raise. Returns `null` when git itself is unavailable (no `.git`, no
 * binary on PATH) so the caller can fall back rather than crash.
 */
export function gitTrackedSourceFiles(root = ROOT, skipDirs = GIT_RECONCILE_SKIP_DIRS) {
  const r = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.ts", "*.tsx"], {
    cwd: root,
    encoding: "utf8",
  })
  if (r.error || r.status !== 0 || typeof r.stdout !== "string") return null
  return r.stdout
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.endsWith(".d.ts"))
    .filter((f) => !f.split("/").some((seg) => skipDirs.has(seg)))
    .map((f) => `${root}/${f}`)
}

// Only when RUN — importing this module must never side-effect or process.exit its importer.
const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  // Fixtures on disk, walked by the REAL `sourceFiles` — a fixture handed straight to
  // `findStemPairs` would prove the grouping and nothing about discovery, which is the half that
  // decays (per the CLAUDE.md §6 scar: a detector that misclassified a known-good file every time).
  const tmp = mkdtempSync(join(tmpdir(), "stem-pairs-")).replace(/\\/g, "/")
  mkdirSync(join(tmp, "lib", "(group)"), { recursive: true })
  const w = (p, s) => writeFileSync(join(tmp, p), s)

  w("lib/foo.tsx", "export const Foo = () => null\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: a lone .tsx with no .ts sibling is not a collision")

  w("lib/foo.ts", "export const x = 1\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a .ts/.tsx sharing a stem in the same directory fires — the extension-migration hazard")
  rmSync(join(tmp, "lib", "foo.ts"))

  // The `.d.ts` case: assert what the exclusion line ACTUALLY does — keep `.d.ts` out of the
  // census entirely — not "no false collision", which would pass even with the exclusion line
  // deleted, since `foo.d.ts`'s stem is `foo.d`, never `foo` (see the exclusion's own comment).
  w("lib/foo.d.ts", "export type Foo = {}\n")
  const dtsPath = join(tmp, "lib", "foo.d.ts").replace(/\\/g, "/")
  ok(!sourceFiles(tmp).includes(dtsPath),
    "KNOWN-GOOD: a .d.ts file is excluded from the file census by name, not merely unable to collide")
  rmSync(join(tmp, "lib", "foo.d.ts"))

  // A same-stem pair in DIFFERENT directories is not a collision — resolution is per-directory.
  w("lib/(group)/foo.ts", "export const y = 1\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: same stem in a different directory does not collide")

  // Route-group parens in the path do not interfere with stem comparison.
  w("lib/(group)/foo.tsx", "export const Foo2 = () => null\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a collision inside a Next.js route-group directory (parens in the path) still fires")

  // No test-file exclusion — unlike check-import-cycles.mjs, a collision in a test file is not
  // exempt (see header rationale).
  rmSync(join(tmp, "lib", "(group)"), { recursive: true, force: true })
  w("lib/foo.test.ts", "export const t = 1\n")
  w("lib/foo.test.tsx", "export const T = () => null\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a .ts/.tsx collision is NOT exempted just because both sides are .test files")
  rmSync(join(tmp, "lib", "foo.test.ts"))
  rmSync(join(tmp, "lib", "foo.test.tsx"))

  ok(sourceFiles(join(tmp, "does-not-exist")).length === 0,
    "a missing directory yields nothing rather than throwing")

  // ── F5: case-insensitive stem collisions — a distinct class from an exact-stem pair ──────────
  w("lib/Card.ts", "export const x = 1\n")
  w("lib/card.tsx", "export const Y = () => null\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: Card.ts / card.tsx is NOT an exact-stem collision — different finding class")
  ok(findCaseInsensitiveStemPairs(sourceFiles(tmp)).length === 1,
    "Card.ts / card.tsx fires as a case-only collision — masks on win32/macOS, invisible on Linux CI")
  rmSync(join(tmp, "lib", "Card.ts"))
  rmSync(join(tmp, "lib", "card.tsx"))

  ok(findCaseInsensitiveStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: an empty tree reports no case-only collisions")

  w("lib/exact.ts", "export const e = 1\n")
  w("lib/exact.tsx", "export const E = () => null\n")
  ok(findCaseInsensitiveStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: an exact-stem pair is NOT double-reported in the case-insensitive list")
  rmSync(join(tmp, "lib", "exact.ts"))
  rmSync(join(tmp, "lib", "exact.tsx"))

  rmSync(tmp, { recursive: true, force: true })

  // ── F6: drive the actual failing exit path as a subprocess ───────────────────────────────────
  // Every probe above calls sourceFiles/findStemPairs directly and never executes the entry
  // block itself — a probe suite could pass in full while process.exit(1) never fires (setting
  // both floors to 0 previously left the whole selftest green). Spawn the real script against a
  // fixture root, passed as the optional positional root argument, and assert on its actual exit
  // code and stderr rather than on the exported functions.
  {
    const exitTmpBad = mkdtempSync(join(tmpdir(), "stem-pairs-exit-bad-")).replace(/\\/g, "/")
    mkdirSync(join(exitTmpBad, "lib"), { recursive: true })
    writeFileSync(join(exitTmpBad, "lib", "foo.ts"), "export const x = 1\n")
    writeFileSync(join(exitTmpBad, "lib", "foo.tsx"), "export const y = 1\n")
    const bad = spawnSync(process.execPath, [fileURLToPath(import.meta.url), exitTmpBad], { encoding: "utf8" })
    ok(bad.status === 1 && bad.stderr.includes("foo.ts") && bad.stderr.includes("foo.tsx"),
      "the real entry point exits 1 and names the colliding pair, run as a subprocess against a fixture root")
    rmSync(exitTmpBad, { recursive: true, force: true })

    const exitTmpClean = mkdtempSync(join(tmpdir(), "stem-pairs-exit-clean-")).replace(/\\/g, "/")
    mkdirSync(join(exitTmpClean, "lib"), { recursive: true })
    writeFileSync(join(exitTmpClean, "lib", "foo.tsx"), "export const y = 1\n")
    const clean = spawnSync(process.execPath, [fileURLToPath(import.meta.url), exitTmpClean], { encoding: "utf8" })
    ok(clean.status === 0,
      "the real entry point exits 0 against a clean fixture root, run as a subprocess")
    rmSync(exitTmpClean, { recursive: true, force: true })
  }

  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — fires on real stem collisions, quiet on every known-good shape")
  process.exit(failed ? 1 : 0)
}

if (isEntry && !process.argv.includes("--selftest")) {
  // An explicit positional root (used by --selftest's subprocess probes above, and available for
  // ad-hoc fixture scans) scopes to JUST the stem-pair detectors — the file-count floor and the
  // git reconciliation below both assume they are looking at the real repo tree and would fail
  // every fixture run for reasons that have nothing to do with what the fixture is testing.
  const explicitRoot = process.argv[2] ? resolve(process.argv[2]).replace(/\\/g, "/") : null
  const scanRoot = explicitRoot ?? ROOT
  const files = sourceFiles(scanRoot)
  const short = (p) => p.replace(scanRoot + "/", "")

  if (!explicitRoot) {
    const tsxCount = files.filter((f) => f.endsWith(".tsx")).length
    const tsCount = files.filter((f) => f.endsWith(".ts")).length

    // L-10 (per check-import-cycles.mjs): assert the ENUMERATION before trusting a zero result — a
    // walk of nothing reports a clean tree. Floors set well under the 966/1006 counts found at the
    // grounding pass for M-041, so ordinary tree growth/shrinkage never trips this, but a broken
    // walk (wrong ROOT, an over-eager SKIP_DIRS) does. This floor is a cheap first line of defence;
    // the git reconciliation below is the precise one — see its own comment for why both exist.
    const TSX_FLOOR = 700
    const TS_FLOOR = 700
    if (tsxCount < TSX_FLOOR || tsCount < TS_FLOOR) {
      console.error(
        `\n❌ extension-stem-pairs: only ${tsxCount} .tsx / ${tsCount} .ts files discovered ` +
          `(floors ${TSX_FLOOR}/${TS_FLOOR}).\n` +
          `   The walk is broken or the tree moved — a scan of nothing reports a clean tree.\n`,
      )
      process.exit(1)
    }
  }

  const pairs = findStemPairs(files)
  if (pairs.length) {
    console.error(`\n❌ extension-stem-pairs: ${pairs.length} directory/stem pair(s) have BOTH a .ts and a .tsx file\n`)
    for (const p of pairs) console.error(`   ${short(p.ts)}\n   ${short(p.tsx)}\n`)
    console.error(
      `   TypeScript resolves an unextended import to the .ts file first, silently masking the\n` +
        `   .tsx. Delete the predecessor in the SAME commit that introduces the successor —\n` +
        `   CLAUDE.md, "Do not split an extension migration across commits".\n`,
    )
    process.exit(1)
  }

  const casePairs = findCaseInsensitiveStemPairs(files)
  if (casePairs.length) {
    console.error(`\n❌ extension-stem-pairs: ${casePairs.length} directory/stem pair(s) collide ONLY when case-folded\n`)
    for (const p of casePairs) console.error(`   ${short(p.ts)}\n   ${short(p.tsx)}\n`)
    console.error(
      `   These are two distinct files on a case-sensitive filesystem (Linux CI sees no problem),\n` +
        `   but win32/macOS's default case-insensitive filesystem resolves an unextended import to\n` +
        `   just one of them — silently masking the other. Rename one file so the stems no longer\n` +
        `   collide even when case-folded.\n`,
    )
    process.exit(1)
  }

  // Precise version of the floor check above: the walk's file set must equal what git itself
  // knows about, modulo the same .d.ts/SKIP_DIRS narrowing. A skip-list that grows to swallow a
  // real source directory (the exact defect class this check's own SKIP_DIRS was found to have
  // during M-041 review — "app"/"generated"/"build" all being live, hand-authored directory
  // names) shrinks `files` without shrinking the floor-tripping threshold, and the floor alone
  // cannot see that; this can. Real-run only (see the `explicitRoot` comment above) — a fixture
  // root has no relationship to this repo's git index and would fail here for an unrelated reason.
  if (!explicitRoot) {
    const tracked = gitTrackedSourceFiles(scanRoot)
    if (tracked === null) {
      console.log("   ⚠ extension-stem-pairs: git unavailable — skipping the git-reconciliation check, relying on the file-count floor only.")
    } else {
      const walkedSet = new Set(files)
      const trackedSet = new Set(tracked)
      const onlyWalked = files.filter((f) => !trackedSet.has(f))
      const onlyTracked = tracked.filter((f) => !walkedSet.has(f))
      if (onlyWalked.length || onlyTracked.length) {
        console.error(`\n❌ extension-stem-pairs: the filesystem walk and \`git ls-files\` disagree on the source-file set.\n`)
        if (onlyWalked.length) {
          console.error(`   Walk found, git does not track/see (${onlyWalked.length}):`)
          for (const f of onlyWalked) console.error(`     ${short(f)}`)
        }
        if (onlyTracked.length) {
          console.error(`   git tracks/sees, the walk skipped (${onlyTracked.length}):`)
          for (const f of onlyTracked) console.error(`     ${short(f)}`)
        }
        console.error(
          `\n   SKIP_DIRS is likely hiding real source (or the walk root/extension match is wrong) —\n` +
            `   a stem pair inside a hidden directory would never be reported.\n`,
        )
        process.exit(1)
      }
    }
  }

  const tsxCount = files.filter((f) => f.endsWith(".tsx")).length
  const tsCount = files.filter((f) => f.endsWith(".ts")).length
  console.log(`🔀 extension-stem-pairs: no .ts/.tsx collisions (exact or case-only) across ${tsxCount} .tsx + ${tsCount} .ts files`)
}
