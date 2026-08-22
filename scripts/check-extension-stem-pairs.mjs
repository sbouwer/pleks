#!/usr/bin/env node
/**
 * scripts/check-extension-stem-pairs.mjs — two source files must never share a directory+stem
 * across the extensions a migration can move a file between: `.ts`/`.tsx`, the js-family
 * (`.js`/`.jsx`/`.mjs`/`.cjs`), and the multi-extension spellings (`.mts`/`.cts`).
 *
 * CLAUDE.md (DO NOT DO): "Do not split an extension migration across commits — when changing a
 * file extension (.ts → .tsx, .js → .ts, etc.), delete the predecessor in the same commit that
 * introduces the successor." M-041 in docs/MECHANISABLE.md named the `.ts`/`.tsx` half of this
 * mechanism; M-063 (2026-08-21) widened it to the js-family and multi-extension spellings — the
 * half the original build left uncovered, per CLAUDE.md §4's "coverage boundaries split the rule,
 * never qualify the tag."
 *
 * WHY THIS MATTERS: TypeScript's module resolution prefers `.ts` over `.tsx` for an unextended
 * specifier, and this repo's own build tooling resolves an unextended import against exactly one
 * of several same-stem candidates when more than one exists. A migration that adds the successor
 * extension and forgets to delete the predecessor in the same commit does not fail the build — it
 * silently masks the new file. Every import of `./foo` keeps resolving to the stale file, and the
 * new one sits in the tree, reviewed and merged, doing nothing. That is exactly the silent-defect
 * class this repo builds checks for rather than prose. SYMMETRIC by design, same as before
 * widening: this check does not try to know which extension "wins" resolution for any given
 * pair — two source files sharing a stem is itself the finding, regardless of which pair.
 *
 * A SIBLING HAZARD, reported separately (see `findCaseInsensitiveStemPairs` below): win32 and
 * macOS default filesystems are case-insensitive, so `lib/Card.ts` and `lib/card.tsx` resolve
 * `import "./card"` to whichever one the OS's case-folding happens to hand back (observed:
 * `Card.ts` wins on both platforms) — masking the other file the same way, but ONLY on the
 * platforms most contributors develop on. Linux CI sees two distinct files and reports nothing
 * wrong, for the wrong reason. Different remedy from an exact-stem pair (rename one file to
 * disambiguate, rather than delete a stale predecessor), so it is a separate, distinctly-labelled
 * finding, not merged into the exact-match list.
 *
 * SCOPE: whole tree, same-directory same-stem pairs across the eight extensions above, no
 * `app`/`lib`/`components` restriction — a stray pair anywhere the walk reaches is the same
 * defect class as one in `app/`. `scripts/` IS walked (unlike `check-csv-escaping.mjs`, which
 * excludes it for CSV-specific reasons that don't apply here) — but `scripts/` itself carries no
 * TypeScript-resolution hazard, because `tsconfig.json`'s `"exclude": ["node_modules", "scripts"]`
 * means nothing under it is ever compiled or module-resolved by `tsc`; a stem pair there is still
 * worth flagging as tree hygiene, just not for the resolution-masking reason the rest of this file
 * is about. Deliberately NOT restricted to non-test files either: unlike check-import-cycles.mjs
 * (where a test importing its subject is not a cycle), a stem collision inside a test-fixture
 * directory is exactly as dangerous as one in application code — the resolution rule does not
 * care whether the shadowed file is a test. Declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are
 * excluded entirely from the file census (see `sourceFiles`): this repo has ZERO tracked `.d.ts`
 * files today (confirmed via `git ls-files '*.d.ts'`) — `next-env.d.ts` exists on disk but is
 * gitignored, generated fresh by `next dev`/`next build`, and carries no stem-mate anyway. The
 * exclusion exists to keep the census honest (a hand-written `foo.d.ts` beside `foo.ts` is a
 * legitimate, deliberate pairing in the TypeScript ecosystem, and is not the defect this check
 * exists to catch), not because a declaration file could ever collide by stem — it can't:
 * `basename("foo.d.ts", ".ts")` is `"foo.d"`, which never equals `"foo"`.
 *
 * As of the M-063 grounding pass (2026-08-21, commit d52366f6), a full-tree scan across all eight
 * extensions found ZERO stem pairs, exact or case-insensitive (2062 tracked files: 966 `.tsx`,
 * 1006 `.ts`, 5 `.js`, 0 `.jsx`, 74 `.mjs`, 2 `.cjs`, 9 `.mts`, 0 `.cts`). This check therefore
 * ships with NO baseline — following check-csv-escaping.mjs's shape rather than
 * check-import-cycles.mjs's, because a baseline exists to grandfather live violations and there
 * are none to grandfather. It is a pure regression guard.
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
import { spawnSync as rawSpawnSync } from "node:child_process"

// Git's repo-context environment variables. When git runs a hook it EXPORTS its own context into
// the hook's environment — `GIT_INDEX_FILE` always for a pathspec commit (`git commit -- path`,
// which builds a temporary index), and `GIT_DIR`/`GIT_WORK_TREE` in other invocations. Any `git`
// subprocess this script spawns then inherits that context and IGNORES its own `cwd`.
//
// That is not theoretical: it is how this check failed. Every probe here passed standalone and the
// whole of `npm run check` was green, but the identical run under `.githooks/pre-commit` failed
// `KNOWN-GOOD: real js-bearing gitignored directories ... do NOT false-fail the reconciliation`.
// The probe `git init`s a temp fixture and calls `gitTrackedSourceFiles(gitTmp)`; with
// `GIT_INDEX_FILE` inherited, `git ls-files` read PLEKS' index instead of the fixture's, so a
// fixture holding four files reconciled against a few thousand tracked paths and "false-failed"
// exactly as the probe's name says it must not. Reproduced deterministically outside any hook with
// `GIT_INDEX_FILE=… node scripts/check-extension-stem-pairs.mjs --selftest`.
//
// The real (non-probe) path has the same exposure for the same reason — a check whose answer
// depends on whether a hook invoked it is not a check — so the scrub is applied to EVERY git spawn
// in this file, not only the fixtures. Scrubbed rather than pinned: this script always passes an
// explicit `cwd`, so git discovering the repo from that directory is the intended behaviour, and
// unsetting is the only way to say "discover normally" once a caller has set these.
const GIT_CONTEXT_VARS = [
  "GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_NAMESPACE",
  "GIT_OBJECT_DIRECTORY", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_CEILING_DIRECTORIES",
  "GIT_PREFIX", "GIT_INDEX_VERSION",
]

/** `process.env` with git's inherited repo context removed. Exported for the probe below. */
export function scrubbedGitEnv(env = process.env) {
  const out = { ...env }
  for (const k of GIT_CONTEXT_VARS) delete out[k]
  return out
}

/**
 * Every subprocess spawn in this file goes through here. Named `spawnSync` so the call sites read
 * normally and a new one cannot accidentally reach the unscrubbed builtin — the raw import is
 * aliased away above for the same reason.
 */
function spawnSync(cmd, args, opts = {}) {
  return rawSpawnSync(cmd, args, { ...opts, env: scrubbedGitEnv(opts.env ?? process.env) })
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..").replace(/\\/g, "/")
// Narrowed at M-041 walk review: "generated" and "build" are legal, real directory names in this
// tree (lib/comms/templates/seed/generated/ holds real seed source) — either could hide a live
// stem collision from the walk. Only genuinely tool-owned, never-hand-authored directories remain.
const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".vercel", "coverage", "dist"])

// The extensions a migration can move a file between (M-063 widened this from `.ts`/`.tsx` only).
// Order carries no matching effect on `SOURCE_EXT_RE` below — it is `$`-anchored, so only the
// alternative that exactly matches the trailing bytes can succeed regardless of alternation
// order — but it IS the order used when rendering a colliding group's files for a human,
// longest/most-specific first.
const SOURCE_EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".mts", ".cts"]
// DERIVED from SOURCE_EXTS, not a second hand-written spelling — walker review (M-063 re-entry,
// F1) demonstrated that two independent spellings of "the extension set" can silently desync:
// drop `.jsx` from the array alone, leave a hand-written regex intact, and a real `.js`/`.jsx`
// stem pair is reported by NEITHER detector while every probe stays green, because the probes
// only exercise extensions the discriminator still recognises. Deriving the regex makes that
// class of edit impossible — changing SOURCE_EXTS changes what the walk matches, by construction.
const SOURCE_EXT_RE = new RegExp(`\\.(?:${SOURCE_EXTS.map((e) => e.slice(1)).join("|")})$`)
// Parallel to the single `.d.ts` exclusion this file always had — TypeScript ships THREE
// declaration-file suffixes (`.d.ts`, `.d.mts`, `.d.cts`), one per module-format spelling now in
// scope. A hand-written `foo.d.mts` beside `foo.mts` is the same legitimate, deliberate pairing
// `.d.ts` beside `.ts` always was — see header for why it can never collide by stem regardless.
const DECLARATION_RE = /\.d\.(?:ts|mts|cts)$/

/**
 * Every source file in the tree (see `SOURCE_EXTS`), declaration files excluded. Whole-tree walk,
 * no directory allowlist and no test-file exclusion — see header for why both differ from
 * check-import-cycles.mjs.
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
      // Keeps the file census honest — see header. NOT a stem-collision guard: a declaration
      // file's stem (basename minus its extension) is always `*.d`, which cannot equal a source
      // stem, so removing this line would not create a false-positive collision. It exists so a
      // declaration file never appears in `sourceFiles`'s output at all, the way the header promises.
      if (DECLARATION_RE.test(name)) continue
      if (SOURCE_EXT_RE.test(name)) out.push(join(dir, name).replace(/\\/g, "/"))
    }
  })(root.replace(/\\/g, "/"))
  return out
}

/**
 * Group files by `directory + stem` (basename minus extension) and return every group with MORE
 * THAN ONE distinct extension present, from `SOURCE_EXTS` — the collision this check exists to
 * catch, generalised (M-063) from the original `.ts`/`.tsx`-only test to the whole extension set a
 * migration can move a file between. Still symmetric: no side "wins", any two (or more) source
 * extensions sharing a stem is the finding, listed together in `SOURCE_EXTS` order. Route-group
 * parens in Next.js paths (`app/(dashboard)/...`) are just directory-name characters here; they do
 * not affect stem comparison at all. Case-EXACT: `Foo.ts` vs `foo.tsx` will not appear here even
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
    const present = SOURCE_EXTS.filter((e) => byExt[e])
    if (present.length > 1) pairs.push({ key, files: present.map((e) => byExt[e]) })
  }
  return pairs.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Same defect, different trigger: two source files in the same directory whose stems match ONLY
 * when case-folded (`Card.ts` / `card.tsx`). On win32/macOS's default case-insensitive filesystem
 * this masks the later one exactly like an exact-stem pair does; on Linux (incl. most CI) the two
 * are distinct files on disk and nothing looks wrong there — which is precisely why it needs its
 * own detector rather than relying on a case-sensitive CI runner to catch it. Generalised (M-063)
 * from the original `.ts`-vs-`.tsx`-only cross product to any two DIFFERENT extensions from
 * `SOURCE_EXTS`. Excludes same-extension pairs (`a.ext === b.ext` below) — a case-only collision
 * between two files of the SAME extension is a different defect class (a duplicate filename, not
 * an extension-migration hazard) and was out of scope before this widening too; unchanged here.
 * Excludes exact-case matches (`a.stem === b.stem` below) — those are already `findStemPairs`'s
 * job, and double-reporting the same pair under two headings would make both lists harder to trust.
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
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i]
        const b = entries[j]
        if (a.ext === b.ext) continue
        if (a.stem === b.stem) continue
        pairs.push({ key, files: [a.file, b.file] })
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
  const r = spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard", ...SOURCE_EXTS.map((e) => `*${e}`)],
    { cwd: root, encoding: "utf8" },
  )
  if (r.error || r.status !== 0 || typeof r.stdout !== "string") return null
  // `-z`, parsed on NUL — hardened to match `filterGitIgnored`'s own `-z --stdin` contract (M-063
  // re-entry 2, W2-F3). Without it, `.split("\n")` is a naive line split of the same shape M-064
  // already names as a silent-under-reporting class: `core.quotepath` would octal-quote any
  // non-ASCII path, and a space/newline-bearing path breaks the split silently rather than loudly.
  // Zero quoted tracked source paths exist in this repo today, so this was latent, not live.
  return r.stdout
    .split("\0")
    .filter(Boolean)
    .filter((f) => !DECLARATION_RE.test(f))
    .filter((f) => !f.split("/").some((seg) => skipDirs.has(seg)))
    .map((f) => `${root}/${f}`)
}

// Per-extension minimum live-file counts (M-063 re-entry, F2/W2-F2). The ORIGINAL floor (below,
// TSX_FLOOR/TS_FLOOR) only ever asserted `.ts`/`.tsx` counts — after the widening that left a gap
// walker demonstrated concretely: with git unavailable (so the reconciliation degrades to "skip,
// rely on the floor"), a mutant that dropped the ENTIRE js-family from the walk still exited 0,
// and the success line still claimed all eight extensions were examined.
//
// KEYS ARE PINNED TO `SOURCE_EXTS` — all eight rows, always present, probed below (walk 2) to
// equal `SOURCE_EXTS` exactly. Walker's second pass demonstrated that a six-row version (the
// first repair, which simply omitted `.jsx`/`.cts`) let a probe-suite stay fully green after
// deleting the `.mts` row, the `.cjs` row, or BOTH `.tsx`/`.ts` — an ABSENT row is invisible to
// any check that only asks "does what's here look right", because a smaller table always does.
// Coordinator's ruling, and the reason it stuck on review: this repo's own baseline doctrine is
// that an allowlist/baseline entry means "read and classified", never "exempt" — a `0` floor
// below is a decision ON THE RECORD; an absent row is a hole that looks like one. Pinning the key
// set also means extension nine forces a floor DECISION (even if that decision is `0`) rather
// than silently inheriting no coverage. `.jsx` and `.cts` carry `0` because both have ZERO live
// members at the M-063 grounding pass (2026-08-21) — a positive floor on either would fail the
// CLEAN tree today. `.mjs` (74 live) explicitly getting no floor in the first repair was the
// reasoning error walker caught: the same "near-zero" argument that correctly justifies `.jsx`/
// `.cts` at `0` does NOT generalise to `.mjs`, which has a floor plainly statable.
const EXTENSION_FLOORS = {
  ".tsx": 700,
  ".ts": 700,
  ".jsx": 0, // zero live members at the M-063 grounding pass — see block comment above
  ".js": 1,
  ".mjs": 50,
  ".cjs": 1,
  ".mts": 5,
  ".cts": 0, // zero live members at the M-063 grounding pass — see block comment above
}

/**
 * Pure — takes a file LIST, not a root, so it is testable with a synthetic array and does not
 * require scanning the real repo (unlike the floor logic this replaces, which had no probe in
 * either direction; walker: "setting both floors to 0 previously left the whole selftest green").
 * Returns every `[ext, found, floor]` triple that failed to meet its floor; an empty array means
 * every floored extension met its minimum.
 */
export function extensionFloorViolations(files, floors = EXTENSION_FLOORS) {
  const counts = {}
  for (const f of files) counts[extname(f)] = (counts[extname(f)] || 0) + 1
  const violations = []
  for (const [ext, min] of Object.entries(floors)) {
    const found = counts[ext] || 0
    if (found < min) violations.push([ext, found, min])
  }
  return violations
}

/**
 * Pure. Every `[ext, liveCount]` whose floor is 0 while the tree actually holds files of that
 * extension — see the entry block's comment for why this guard is derived from the TREE and not
 * from a second hand-maintained list (M-063 walk 3, W3-F3).
 */
export function zeroFloorsWithLiveFiles(files, floors = EXTENSION_FLOORS) {
  const counts = {}
  for (const f of files) counts[extname(f)] = (counts[extname(f)] || 0) + 1
  return Object.entries(floors)
    .filter(([ext, min]) => min === 0 && (counts[ext] || 0) > 0)
    .map(([ext]) => [ext, counts[ext]])
}

/**
 * Filters `files` (from `sourceFiles`, a WHOLE-TREE walk bounded only by `SKIP_DIRS`) down to the
 * files git would ever consider tracking — i.e. drops anything `.gitignore` excludes. Without this,
 * the walk and `gitTrackedSourceFiles` compare two sets that do not mean the same thing (M-063
 * re-entry, F3): the walk finds real files inside `out/`, `build/`, `docuseal/`, `.handoff/`
 * and every other gitignored-but-JS-bearing directory this repo has, while `git ls-files
 * --exclude-standard` correctly never returns them — a mismatch on every machine with a build
 * artefact or an agent scratch file on disk, diagnosed by the entry block as "SKIP_DIRS is likely
 * hiding real source" even though SKIP_DIRS is not the defect. Uses `git check-ignore` (the same
 * authority `--exclude-standard` itself defers to) rather than reimplementing `.gitignore` parsing
 * or growing `SKIP_DIRS` — CLAUDE.md ruling: do NOT grow `SKIP_DIRS` to close this, it is the exact
 * regression `GIT_RECONCILE_SKIP_DIRS`'s own comment exists to prevent. Returns `null` (same
 * unavailable-fallback contract as `gitTrackedSourceFiles`) when git itself cannot answer.
 *
 * DELIBERATELY NOT `--no-index` (removed at M-063 re-entry 2, W2-F1, after landing with it first).
 * `--no-index` is check-ignore's DIAGNOSTIC mode — "debug why a path became tracked despite ignore
 * rules" — and reports a pattern match regardless of tracked status. The plain (default) mode is
 * the QUERY mode this code actually needs: it defers to the index, so a path git genuinely tracks
 * is never reported as ignored even if it matches a pattern, which is exactly right for this
 * caller (`gitReconciliationViolations` only ever hands this function the walked-but-NOT-tracked
 * difference — see its own comment). With `--no-index`, correctness silently depended on
 * `SKIP_DIRS` and `GIT_RECONCILE_SKIP_DIRS` staying in agreement, which is the ONE invariant this
 * file's own `GIT_RECONCILE_SKIP_DIRS` comment deliberately refuses to assume (the two lists are
 * kept independent precisely so a divergence between them can be caught, not silently absorbed).
 * Demonstrated live: widen the git-side skip list alone by a segment matching an unanchored
 * ignore pattern (this repo's own `docuseal/`) and, with `--no-index`, a genuinely-tracked file
 * disappears from the comparison at exit 0; without it, the same file still fires. Probed below.
 */
export function filterGitIgnored(root, files) {
  if (!files.length) return files
  const rel = files.map((f) => f.replace(`${root}/`, ""))
  const r = spawnSync("git", ["check-ignore", "-z", "--stdin"], {
    cwd: root,
    input: rel.join("\0") + "\0",
    encoding: "utf8",
  })
  // check-ignore's exit contract is not the usual 0=success: 0 means "at least one path matched an
  // ignore rule" (listed on stdout), 1 means "none matched" (not an error — the normal clean-tree
  // result), anything else means git itself failed and the caller must not trust this filter.
  if (r.error || (r.status !== 0 && r.status !== 1)) return null
  const ignored = new Set(r.status === 0 ? r.stdout.split("\0").filter(Boolean) : [])
  return files.filter((f) => !ignored.has(f.replace(`${root}/`, "")))
}

/**
 * The full git-reconciliation comparison as a pure(ish) function of `(scanRoot, files)` rather
 * than inline in the entry block — pulled out so it is directly testable against a synthetic git
 * repo (M-063 re-entry, F3), the same way `findStemPairs` is tested directly against a synthetic
 * file list rather than only through the entry point. `skipped: true` means git was unavailable in
 * some way and the caller should fall back to the floor only — `reason` distinguishes WHICH way
 * (M-063 re-entry 2, W2-F4): `"ls-files-unavailable"` (git itself, or not a checkout) versus
 * `"check-ignore-unavailable"` (ls-files worked, but the walked-only files' ignore status could
 * not be determined) are different failures needing different responses to read, the same reason
 * this repo's register (M-074) keeps a no-contact deferral distinguishable from a send-failed one
 * — sharing one message for two causes was itself the finding.
 *
 * `filterGitIgnored` is applied ONLY to the walked-but-not-tracked difference, never to the full
 * walked set — discovered live against this repo's own tree: `git check-ignore` evaluates a path
 * against `.gitignore` patterns purely by name match, with no regard for whether the path is
 * already tracked, and this repo's `docuseal/` pattern is unanchored — it matches ANY directory
 * literally named `docuseal` anywhere in the tree, not just the top-level vendored one, which
 * happens to also catch the genuinely tracked `app/api/webhooks/docuseal/route.ts`. Running the
 * ignore-filter over the whole walked set silently dropped that real, tracked file from the
 * comparison. A file already present in `tracked` is by definition accounted for on both sides
 * and can never legitimately be reported as `onlyWalked`, so it is excluded from candidacy before
 * `filterGitIgnored` ever runs on it — the filter now only has to adjudicate the files git does
 * NOT already vouch for. On a clean tree `candidateOnlyWalked` is empty and `filterGitIgnored`
 * never runs at all — a green real run is therefore NOT evidence this dependency works; the
 * synthetic-repo probes below are the only evidence of it (M-063 re-entry 2, W2-F5, informational).
 *
 * `ignoreFilter` is a PROBE SEAM and nothing else — production callers pass three arguments. It
 * exists because the `check-ignore-unavailable` branch is otherwise unreachable in a test: reaching
 * it needs `git ls-files` to succeed and `git check-ignore` to fail in the SAME root, which no
 * fixture can arrange. Without the seam that branch's `reason` label was unprobed, and walk 3
 * (W3-F4) measured the consequence — swapping it to `"ls-files-unavailable"` was invisible to every
 * probe, i.e. the whole distinction W2-F4 introduced was undefended at exactly the point it matters.
 */
export function gitReconciliationViolations(
  scanRoot, files, skipDirs = GIT_RECONCILE_SKIP_DIRS, ignoreFilter = filterGitIgnored,
) {
  const tracked = gitTrackedSourceFiles(scanRoot, skipDirs)
  if (tracked === null) return { skipped: true, reason: "ls-files-unavailable", onlyWalked: [], onlyTracked: [] }
  const trackedSet = new Set(tracked)
  const walkedSet = new Set(files)
  const onlyTracked = tracked.filter((f) => !walkedSet.has(f))
  const candidateOnlyWalked = files.filter((f) => !trackedSet.has(f))
  if (candidateOnlyWalked.length === 0) return { skipped: false, onlyWalked: [], onlyTracked }
  const onlyWalked = ignoreFilter(scanRoot, candidateOnlyWalked)
  if (onlyWalked === null) {
    return {
      skipped: true,
      reason: "check-ignore-unavailable",
      unresolvedCount: candidateOnlyWalked.length,
      onlyWalked: [],
      onlyTracked: [],
    }
  }
  return { skipped: false, onlyWalked, onlyTracked }
}

// Only when RUN — importing this module must never side-effect or process.exit its importer.
const isEntry = process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))

if (isEntry && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (c, l) => { if (!c) failed++; console.log(`  ${c ? "✓" : "✗"} ${l}`) }

  // ── F1 (M-063 re-entry): SOURCE_EXT_RE must never carry a spelling independent of SOURCE_EXTS ──
  // A static invariant, not a discovery test — it guards against a FUTURE regression that
  // reintroduces a hand-written regex literal (the exact shape walker demonstrated: drop `.jsx`
  // from the array alone, leave a stale regex intact, and neither detector reports a real
  // `.js`/`.jsx` collision while every other probe stays green).
  ok(SOURCE_EXTS.every((e) => SOURCE_EXT_RE.test(`x${e}`)),
    "every SOURCE_EXTS member matches SOURCE_EXT_RE — the two must never be able to drift apart")

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

  // ── F7: js-family and multi-extension widening (M-063) ────────────────────────────────────────
  // Same generalised code path as above; these probes prove the widening actually fires for
  // extensions other than .ts/.tsx, rather than trusting the header's claim.
  w("lib/bar.js", "module.exports = {}\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: a lone .js with no source-extension sibling is not a collision")

  w("lib/bar.ts", "export const x = 1\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a .js/.ts sharing a stem fires — the js-family-to-ts migration hazard")
  rmSync(join(tmp, "lib", "bar.js"))
  rmSync(join(tmp, "lib", "bar.ts"))

  w("lib/dual.mjs", "export const x = 1\n")
  w("lib/dual.cjs", "module.exports = { x: 1 }\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a .mjs/.cjs sharing a stem fires — same defect class, js-family module-format spellings")
  rmSync(join(tmp, "lib", "dual.mjs"))
  rmSync(join(tmp, "lib", "dual.cjs"))

  w("lib/multi.mts", "export const x = 1\n")
  w("lib/multi.cts", "export const x = 1\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 1,
    "a .mts/.cts sharing a stem fires — the multi-extension spellings")
  rmSync(join(tmp, "lib", "multi.mts"))
  rmSync(join(tmp, "lib", "multi.cts"))

  // Declaration-suffix exclusion generalised beyond .d.ts.
  w("lib/decl.d.mts", "export type X = {}\n")
  const dmtsPath = join(tmp, "lib", "decl.d.mts").replace(/\\/g, "/")
  ok(!sourceFiles(tmp).includes(dmtsPath),
    "KNOWN-GOOD: a .d.mts file is excluded from the file census, same as .d.ts")
  rmSync(join(tmp, "lib", "decl.d.mts"))

  w("lib/decl.d.cts", "export type X = {}\n")
  const dctsPath = join(tmp, "lib", "decl.d.cts").replace(/\\/g, "/")
  ok(!sourceFiles(tmp).includes(dctsPath),
    "KNOWN-GOOD: a .d.cts file is excluded from the file census, same as .d.ts")
  rmSync(join(tmp, "lib", "decl.d.cts"))

  // Case-insensitive collision among the widened set, and non-double-reporting.
  w("lib/Widget.js", "module.exports = {}\n")
  w("lib/widget.jsx", "export const Widget = () => null\n")
  ok(findStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: Widget.js / widget.jsx is NOT an exact-stem collision — different finding class")
  ok(findCaseInsensitiveStemPairs(sourceFiles(tmp)).length === 1,
    "Widget.js / widget.jsx fires as a case-only collision in the widened set")
  rmSync(join(tmp, "lib", "Widget.js"))
  rmSync(join(tmp, "lib", "widget.jsx"))

  w("lib/exactjs.js", "module.exports = {}\n")
  w("lib/exactjs.mjs", "export const x = 1\n")
  ok(findCaseInsensitiveStemPairs(sourceFiles(tmp)).length === 0,
    "KNOWN-GOOD: an exact-stem js-family pair is NOT double-reported in the case-insensitive list")
  rmSync(join(tmp, "lib", "exactjs.js"))
  rmSync(join(tmp, "lib", "exactjs.mjs"))

  rmSync(tmp, { recursive: true, force: true })

  // ── F4 (M-063 re-entry): the same-extension exclusion boundary is a property of the grouping
  // LOGIC, not of discovery — probed with a synthetic file list rather than real files on disk,
  // because two files of the SAME extension differing only by case cannot coexist on a
  // case-insensitive filesystem (the second write would overwrite the first, so no fixture on this
  // machine could ever exercise it). This is a deliberate, narrower exception to the "fixtures on
  // disk" rule above: that rule protects against DISCOVERY decaying, and this boundary lives
  // entirely inside `findCaseInsensitiveStemPairs`'s own grouping code, downstream of discovery.
  ok(findCaseInsensitiveStemPairs(["/probe/lib/Same.ts", "/probe/lib/same.ts"]).length === 0,
    "KNOWN-GOOD: two files of the SAME extension differing only by case are not reported here — a different defect class (duplicate filename), not an extension-migration hazard")
  ok(findCaseInsensitiveStemPairs(["/probe/lib/Same.ts", "/probe/lib/same.tsx"]).length === 1,
    "the boundary is real, not a no-op: swap one file to a DIFFERENT extension and the same two case-differing stems now fire")

  // ── F2 / W2-F2 (M-063 re-entry, round 2): extensionFloorViolations + EXTENSION_FLOORS's key set.
  // Walker (walk 2) demonstrated all 32 walk-1-repair probes stayed green after deleting the .mts
  // row, the .cjs row, or BOTH .tsx/.ts rows — probe 1 below only ever checked that real-shaped
  // counts pass (true of any table with fewer rows), and the old probe 2 was self-referential
  // (`.length === Object.keys(EXTENSION_FLOORS).length`, which passes for ANY table, including an
  // empty one). Two independent probes now close the two independent failure modes, each checked
  // against a literal that does NOT come from the table under test — the same reason
  // SOURCE_EXT_RE was made to derive FROM SOURCE_EXTS rather than live beside it as a second
  // spelling: the answer a probe checks against must not be read from the thing being probed.
  ok(
    JSON.stringify(Object.keys(EXTENSION_FLOORS).slice().sort()) === JSON.stringify(SOURCE_EXTS.slice().sort()),
    "EXTENSION_FLOORS's key set is EXACTLY SOURCE_EXTS — deleting any row (the .mts/.cjs/.tsx/.ts deletions walker demonstrated) now fails this probe",
  )
  ok(extensionFloorViolations([
    ...Array(966).fill("a.tsx"), ...Array(1006).fill("a.ts"), ...Array(5).fill("a.js"),
    ...Array(74).fill("a.mjs"), ...Array(2).fill("a.cjs"), ...Array(9).fill("a.mts"),
  ]).length === 0,
    "KNOWN-GOOD: real-shaped counts (the M-063 grounding-pass census) meet every floor")
  {
    // Independent literal, on purpose — must match EXTENSION_FLOORS's POSITIVE-floor rows, but is
    // NOT read from the table, so zeroing a real floor (leaving the key present, which the
    // key-set probe above would miss) still changes this probe's expected count away from the
    // actual one.
    // Compared by CONTENTS, not by length (M-063 walk 3, W3-F3). A length comparison passed under a
    // two-site coordinated edit — zeroing `.mts` in the table AND dropping it from this list — which
    // is exactly the drift this independent literal exists to catch. A set comparison costs nothing
    // and removes the only way the two spellings could still agree while both being wrong.
    const FLOORED_NONZERO = [".tsx", ".ts", ".js", ".mjs", ".cjs", ".mts"]
    const violatedExts = extensionFloorViolations([]).map(([ext]) => ext).sort()
    ok(violatedExts.join(",") === [...FLOORED_NONZERO].sort().join(","),
      "a walk that examined NOTHING violates every POSITIVELY-floored extension AND ONLY those — the exact mutant walker demonstrated (js-family missing + git unavailable previously still exited 0), checked against a list hardcoded independently of EXTENSION_FLOORS's own keys")
  }
  // W3-F3: the floors' own guard, probed both directions. The known-good direction matters as much
  // as the firing one here — `.jsx`/`.cts` legitimately sit at 0 files with a 0 floor, and a guard
  // that flagged them would be unusable and would get deleted rather than fixed.
  ok(zeroFloorsWithLiveFiles(["lib/a.ts", "lib/b.mjs"]).length === 0,
    "KNOWN-GOOD: a 0-floored extension with no live files in the tree is not flagged — .jsx/.cts's standing state")
  ok(zeroFloorsWithLiveFiles(["lib/a.ts", "components/Widget.jsx"]).some(([ext]) => ext === ".jsx"),
    "a 0-floored extension that has ACQUIRED live files fires — the tree-derived guard that catches the coordinated two-site floor edit no list comparison can see")

  ok(extensionFloorViolations([...Array(1000).fill("a.ts"), ...Array(1000).fill("a.tsx")])
    .some(([ext]) => ext === ".mjs"),
    "a walk that finds real .ts/.tsx but ZERO .mjs still fires — the reasoning error walker caught (74 live .mjs files is a statable floor, unlike .jsx/.cts at 0)")

  // ── F3 (M-063 re-entry): gitReconciliationViolations against synthetic git repos — reproduces
  // walker's exact demonstration (gitignored JS-bearing directories false-failing the reconciliation
  // and steering the reader to grow SKIP_DIRS) and proves the fix without touching the real repo.
  {
    const gitTmp = mkdtempSync(join(tmpdir(), "stem-pairs-gitrecon-")).replace(/\\/g, "/")
    spawnSync("git", ["init", "-q"], { cwd: gitTmp })
    mkdirSync(join(gitTmp, "lib"), { recursive: true })
    mkdirSync(join(gitTmp, "out"), { recursive: true })
    mkdirSync(join(gitTmp, "docuseal"), { recursive: true })
    writeFileSync(join(gitTmp, ".gitignore"), "out/\ndocuseal/\n")
    writeFileSync(join(gitTmp, "lib", "a.ts"), "export const a = 1\n")
    writeFileSync(join(gitTmp, "lib", "b.tsx"), "export const B = () => null\n")
    writeFileSync(join(gitTmp, "out", "bundle.js"), "// build output\n")
    writeFileSync(join(gitTmp, "docuseal", "app.mjs"), "// vendored\n")
    const cleanFiles = sourceFiles(gitTmp)
    const cleanRecon = gitReconciliationViolations(gitTmp, cleanFiles)
    ok(!cleanRecon.skipped && cleanRecon.onlyWalked.length === 0 && cleanRecon.onlyTracked.length === 0,
      "KNOWN-GOOD: real js-bearing gitignored directories (out/, docuseal/ — this repo's own shape) do NOT false-fail the reconciliation")

    // Regression probe for a bug this fix was found to have against the REAL tree while landing it:
    // this repo's `docuseal/` pattern is unanchored, so it matches any directory literally named
    // `docuseal` anywhere — including `app/api/webhooks/docuseal/`, which is genuinely tracked. An
    // early version of `gitReconciliationViolations` ran `filterGitIgnored` over the WHOLE walked
    // set and silently dropped that real, tracked file. Reproduce the shape here: a tracked file
    // nested inside a directory name that also matches the ignore pattern must survive on both sides.
    mkdirSync(join(gitTmp, "nested", "docuseal"), { recursive: true })
    writeFileSync(join(gitTmp, "nested", "docuseal", "tracked.ts"), "export const t = 1\n")
    spawnSync("git", ["add", "-f", "nested/docuseal/tracked.ts"], { cwd: gitTmp })
    const trackedDespiteIgnoreRecon = gitReconciliationViolations(gitTmp, sourceFiles(gitTmp))
    ok(
      !trackedDespiteIgnoreRecon.skipped &&
        !trackedDespiteIgnoreRecon.onlyWalked.some((f) => f.endsWith("nested/docuseal/tracked.ts")) &&
        !trackedDespiteIgnoreRecon.onlyTracked.some((f) => f.endsWith("nested/docuseal/tracked.ts")),
      "REGRESSION: a file that is genuinely tracked but ALSO matches an unanchored ignore pattern (this repo's own docuseal/ shape) is not dropped from either side of the comparison",
    )

    // W3-F2 (M-063 walk 3): the probe above is a CONJUNCTION detector — it fires only when the input
    // narrowing AND `--no-index` are both restored, so it does not actually guard the defect it is
    // named for. That is not a flaw in the fix; it is what walk 3 established about the fix's real
    // mechanism, against the implementer's own account of it. Plain `check-ignore` DEFERS TO THE
    // INDEX, so a tracked file is never called ignored whatever set you hand it. The narrowing is
    // redundant defence; the ABSENT `--no-index` is the load-bearing part. Probe that directly, at
    // the function, where there is no narrowing to mask it — this fails the moment the flag returns.
    const trackedIgnoreMatch = sourceFiles(gitTmp).filter((f) => f.endsWith("nested/docuseal/tracked.ts"))
    ok(
      trackedIgnoreMatch.length === 1 && filterGitIgnored(gitTmp, trackedIgnoreMatch)?.length === 1,
      "filterGitIgnored does not call a GENUINELY-TRACKED file ignored though it matches an unanchored ignore pattern — the --no-index invariant, probed without the narrowing in the way",
    )

    // Direction 2: the reconciliation must still fire on a GENUINE mismatch — the exact class the
    // two independent skip-lists exist to catch (this file's own comment on GIT_RECONCILE_SKIP_DIRS:
    // a future SKIP_DIRS that grows to over-reach a real source directory). Default SKIP_DIRS and
    // GIT_RECONCILE_SKIP_DIRS are identical today, so simulate the over-reach explicitly: pass a
    // WIDENED skip set to the walk only, leaving the (default, narrower) git-side skip list alone —
    // this is `sourceFiles`'s existing `skipDirs` parameter, not a change to any real constant.
    mkdirSync(join(gitTmp, "hidden"), { recursive: true })
    writeFileSync(join(gitTmp, "hidden", "real.ts"), "export const hiddenFromWalk = 1\n")
    const overReachSkip = new Set([...SKIP_DIRS, "hidden"])
    const hiddenFiles = sourceFiles(gitTmp, overReachSkip)
    const hiddenRecon = gitReconciliationViolations(gitTmp, hiddenFiles)
    ok(!hiddenRecon.skipped && hiddenRecon.onlyTracked.some((f) => f.endsWith("hidden/real.ts")),
      "a real, non-ignored file inside a directory an over-reached SKIP_DIRS hides from the walk still fires as git-tracks/walk-skipped — the fix did not neuter genuine detection")

    // W2-F1: filterGitIgnored must query the INDEX (default check-ignore), never bypass it via
    // --no-index. Reproduces walker's real-tree demonstration: grow the GIT-SIDE skip list alone
    // (mirroring what a future GIT_RECONCILE_SKIP_DIRS edit would do) by a segment matching this
    // fixture's unanchored ignore pattern — that artificially removes the already-tracked
    // nested/docuseal/tracked.ts from `tracked`, forcing it through filterGitIgnored as a
    // candidate. With --no-index (as shipped first), check-ignore calls it ignored purely by
    // pattern match, regardless of tracked status, and the mismatch silently disappears at exit
    // 0. Without it, the genuinely-tracked file still fires — correctness no longer depends on
    // SKIP_DIRS and GIT_RECONCILE_SKIP_DIRS staying in agreement.
    const widenedGitSkip = new Set([...GIT_RECONCILE_SKIP_DIRS, "docuseal"])
    const noIndexRegressionRecon = gitReconciliationViolations(gitTmp, sourceFiles(gitTmp), widenedGitSkip)
    ok(
      !noIndexRegressionRecon.skipped &&
        noIndexRegressionRecon.onlyWalked.some((f) => f.endsWith("nested/docuseal/tracked.ts")),
      "growing the git-side skip list alone by a segment matching an unanchored ignore pattern still surfaces the genuinely-tracked file (the --no-index regression, fixed)",
    )

    // ── Hook-environment hermeticity (2026-08-22). See GIT_CONTEXT_VARS at the top of this file for
    // the incident: every probe here passed standalone while the SAME run under .githooks/pre-commit
    // failed the "real js-bearing gitignored directories" probe, because a pathspec commit exports
    // GIT_INDEX_FILE and every `git` subprocess below silently read the real repo instead of its
    // fixture. Probed in both directions, and the negative direction is the one that can actually
    // fail: without it, this probe would pass against an implementation that scrubs NOTHING.
    {
      // NEGATIVE — the var is load-bearing. An UNSCRUBBED ls-files in the fixture, with
      // GIT_INDEX_FILE pointed at this repo's own index, must return something OTHER than the
      // fixture's own file list. If this ever stops differing, the positive probe below has become
      // vacuous and is no longer evidence of anything.
      const poisoned = { ...process.env, GIT_INDEX_FILE: `${ROOT}/.git/index` }
      const lsArgs = ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "*.ts"]
      const dirty = rawSpawnSync("git", lsArgs, { cwd: gitTmp, encoding: "utf8", env: poisoned })
      const clean = rawSpawnSync("git", lsArgs, { cwd: gitTmp, encoding: "utf8", env: scrubbedGitEnv(poisoned) })
      ok(
        dirty.status === 0 && clean.status === 0 && dirty.stdout !== clean.stdout,
        "NEGATIVE: an inherited GIT_INDEX_FILE really does change what `git ls-files` reports from a fixture cwd — the poison this scrub neutralises is real, so the probe below is not vacuous",
      )

      // POSITIVE — with the same poison present in the ambient environment, the reconciliation this
      // file actually ships resolves the fixture correctly. This is the pre-commit failure itself,
      // reproduced without a hook: it fails against the pre-fix code and passes against the fix.
      const restore = process.env.GIT_INDEX_FILE
      process.env.GIT_INDEX_FILE = `${ROOT}/.git/index`
      try {
        const hookRecon = gitReconciliationViolations(gitTmp, sourceFiles(gitTmp))
        ok(
          !hookRecon.skipped && hookRecon.onlyTracked.length === 0,
          "the reconciliation is hermetic against git's hook environment — an inherited GIT_INDEX_FILE no longer makes a fixture reconcile against the REAL repo (the .githooks/pre-commit false failure)",
        )
      } finally {
        if (restore === undefined) delete process.env.GIT_INDEX_FILE
        else process.env.GIT_INDEX_FILE = restore
      }

      // The scrub removes git's context and NOTHING else — a scrub that emptied the environment
      // would satisfy both probes above while breaking PATH for every spawn on this file's real path.
      const sample = scrubbedGitEnv({ GIT_DIR: "/x", GIT_INDEX_FILE: "/y", PATH: "/usr/bin", HOME: "/h" })
      ok(
        !("GIT_DIR" in sample) && !("GIT_INDEX_FILE" in sample) &&
          sample.PATH === "/usr/bin" && sample.HOME === "/h",
        "KNOWN-GOOD: scrubbedGitEnv drops git's repo-context vars and leaves the rest of the environment intact",
      )
    }

    // W2-F3: gitTrackedSourceFiles is now -z-parsed like filterGitIgnored.
    //
    // W3-F1 (M-063 walk 3) corrected this probe, and the correction is the point. The original
    // asserted a SPACE in the filename and its comment claimed "a space is enough to demonstrate the
    // parse boundary". That was factually wrong: `git ls-files` does not quote or break on spaces, so
    // reverting -z and the NUL split back to a newline split was invisible to all 37 probes — a probe
    // that could not fail, guarding the exact hardening it was added for. What DOES discriminate is a
    // NON-ASCII name: without -z, core.quotepath returns it octal-escaped AND double-quoted; with -z
    // it comes back verbatim. The old justification ("this repo carries no non-ASCII tracked source
    // path") did not apply either, because this probe runs against a synthetic fixture repo where one
    // can simply be created. Keep the spaced file too — it costs nothing and covers the neighbouring
    // shape — but the non-ASCII assertion is the one carrying the guard.
    const nonAscii = "lib/café.ts"
    writeFileSync(join(gitTmp, "lib", "space name.ts"), "export const s = 1\n")
    writeFileSync(join(gitTmp, nonAscii), "export const c = 1\n")
    spawnSync("git", ["add", "-f", "lib/space name.ts", nonAscii], { cwd: gitTmp })
    const spacedTracked = gitTrackedSourceFiles(gitTmp)
    ok(spacedTracked !== null && spacedTracked.some((f) => f.endsWith("lib/space name.ts")),
      "gitTrackedSourceFiles (-z-parsed) correctly finds a tracked file with a space in its name")
    ok(spacedTracked !== null && spacedTracked.some((f) => f.endsWith(nonAscii)),
      "gitTrackedSourceFiles finds a tracked NON-ASCII path verbatim — fails if -z is reverted, which the spaced-name probe alone did not")

    rmSync(gitTmp, { recursive: true, force: true })
  }

  // ── W2-F4: the two `skipped: true` causes must be distinguishable, not share one message ───────
  {
    // Cause 1: git ls-files itself unavailable — a plain directory with no .git at all.
    const noGitTmp = mkdtempSync(join(tmpdir(), "stem-pairs-nogit-")).replace(/\\/g, "/")
    mkdirSync(join(noGitTmp, "lib"), { recursive: true })
    writeFileSync(join(noGitTmp, "lib", "a.ts"), "export const a = 1\n")
    const noGitRecon = gitReconciliationViolations(noGitTmp, sourceFiles(noGitTmp))
    ok(noGitRecon.skipped && noGitRecon.reason === "ls-files-unavailable",
      "not a git checkout at all → skipped with reason ls-files-unavailable, distinct from the check-ignore cause")
    rmSync(noGitTmp, { recursive: true, force: true })

    // Cause 2: filterGitIgnored's own unavailable contract, probed directly — a root git itself
    // cannot run against (nonexistent cwd) makes the underlying spawnSync fail, not merely return
    // a non-matching result. This is the low-level contract gitReconciliationViolations's
    // "check-ignore-unavailable" branch depends on; walker could not reach that branch end-to-end
    // on the real tree (candidateOnlyWalked is empty there, so filterGitIgnored never runs) and
    // named it unverified rather than broken — this probes the contract it rests on directly,
    // which is the honest amount of coverage available without faking a git-binary failure.
    const missingRoot = join(tmpdir(), `stem-pairs-missing-${process.pid}-${Date.now()}`).replace(/\\/g, "/")
    ok(filterGitIgnored(missingRoot, ["a.ts"]) === null,
      "filterGitIgnored returns null (the gitReconciliationViolations check-ignore-unavailable trigger) when git cannot run at all, not an empty/false-clean result")

    // W3-F4 (M-063 walk 3): the two labels above are the whole point of W2-F4, and until now only
    // ONE of them was ever asserted — swapping the check-ignore branch's reason to the ls-files
    // string was invisible to every probe. Reach that branch through the `ignoreFilter` seam (a
    // fixture cannot make ls-files succeed and check-ignore fail in one root) and assert BOTH the
    // label and the unresolvedCount the operator needs to act on it.
    // The candidate set is specifically the files git does NOT know about, and `gitTrackedSourceFiles`
    // counts untracked-but-not-ignored files as known — so a merely-untracked fixture yields ZERO
    // candidates and the branch is never entered. It must be an IGNORED file. Recorded because the
    // first version of this probe used an untracked one and failed for exactly that reason: the seam
    // was right, the fixture was wrong, and the probe said so instead of quietly passing.
    const seamTmp = mkdtempSync(join(tmpdir(), "stem-pairs-seam-")).replace(/\\/g, "/")
    spawnSync("git", ["init", "-q"], { cwd: seamTmp })
    mkdirSync(join(seamTmp, "vendor"), { recursive: true })
    writeFileSync(join(seamTmp, ".gitignore"), "vendor/\n")
    writeFileSync(join(seamTmp, "vendor", "ignored.ts"), "export const i = 1\n")
    const seamRecon = gitReconciliationViolations(seamTmp, sourceFiles(seamTmp), GIT_RECONCILE_SKIP_DIRS, () => null)
    ok(seamRecon.skipped && seamRecon.reason === "check-ignore-unavailable" && seamRecon.unresolvedCount === 1,
      "ls-files OK but check-ignore unavailable → skipped with reason check-ignore-unavailable and a real unresolvedCount, NOT the ls-files label")
    ok(seamRecon.reason !== noGitRecon.reason,
      "the two skip causes carry DIFFERENT labels — the distinction W2-F4 introduced, asserted rather than assumed")
    rmSync(seamTmp, { recursive: true, force: true })
  }

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

    // Same subprocess-level proof, for the widened (M-063) extension set — the real entry point,
    // not just the exported functions, must fire on a js-family pair.
    const exitTmpBadJs = mkdtempSync(join(tmpdir(), "stem-pairs-exit-bad-js-")).replace(/\\/g, "/")
    mkdirSync(join(exitTmpBadJs, "lib"), { recursive: true })
    writeFileSync(join(exitTmpBadJs, "lib", "bar.mjs"), "export const x = 1\n")
    writeFileSync(join(exitTmpBadJs, "lib", "bar.cjs"), "module.exports = { x: 1 }\n")
    const badJs = spawnSync(process.execPath, [fileURLToPath(import.meta.url), exitTmpBadJs], { encoding: "utf8" })
    ok(badJs.status === 1 && badJs.stderr.includes("bar.mjs") && badJs.stderr.includes("bar.cjs"),
      "the real entry point exits 1 on a .mjs/.cjs collision, run as a subprocess against a fixture root")
    rmSync(exitTmpBadJs, { recursive: true, force: true })
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
    // L-10 (per check-import-cycles.mjs): assert the ENUMERATION before trusting a zero result — a
    // walk of nothing reports a clean tree. Floors set well under the live counts found at the
    // M-063 grounding pass, so ordinary tree growth/shrinkage never trips this, but a broken walk
    // (wrong ROOT, an over-eager SKIP_DIRS, a regex that silently stopped matching a family) does.
    // Runs UNCONDITIONALLY for a real-root scan — unlike the git reconciliation below, this cannot
    // be skipped by "git unavailable", which is exactly the gap walker demonstrated (M-063
    // re-entry, F2): with the reconciliation degraded to floor-only and the floor scoped to just
    // `.ts`/`.tsx`, a walk that examined zero js-family files still exited 0. See
    // `EXTENSION_FLOORS`'s own comment for why `.jsx`/`.cts` carry no floor.
    const floorViolations = extensionFloorViolations(files)
    if (floorViolations.length) {
      console.error(`\n❌ extension-stem-pairs: the walk found too few files of extension(s) it should never be this short of\n`)
      for (const [ext, found, min] of floorViolations) console.error(`   ${ext}: ${found} found, floor ${min}`)
      console.error(
        `\n   The walk is broken, the tree moved, or SOURCE_EXT_RE stopped matching this family —\n` +
          `   a scan that misses a whole extension reports a clean tree for it.\n`,
      )
      process.exit(1)
    }

    // ── The floors' OWN guard, and it deliberately comes from the tree rather than from a second
    // list (M-063 walk 3, W3-F3). `FLOORED_NONZERO` in the selftest catches a floor zeroed at ONE
    // site. It cannot catch the coordinated two-site edit — zero the `.mts` row AND drop `.mts`
    // from that list and the two agree again, measured, mutant survived. That is not a fixable
    // probe: ANY two hand-maintained lists agree when both are edited consistently, which is the
    // same F1 lesson this file has now been bitten by twice, arriving a third time in a costume
    // where deriving one from the other is not available — the independence IS the point of the
    // second list. So the guard has to come from somewhere neither list controls. A live extension
    // with a zero floor is a floor that has stopped defending anything, and the tree says which
    // extensions are live. `.jsx`/`.cts` sit at 0 files today and keep their explicit 0 legally.
    const zeroedButLive = zeroFloorsWithLiveFiles(files)
    if (zeroedButLive.length) {
      console.error(`\n❌ extension-stem-pairs: an extension with real files in the tree carries a floor of 0\n`)
      for (const [ext] of zeroedButLive) {
        console.error(`   ${ext}: ${files.filter((f) => extname(f) === ext).length} file(s) present, floor 0`)
      }
      console.error(
        `\n   A 0 floor is an on-record decision that an extension has no live files. Once it does,\n` +
          `   the row defends nothing and the walk could stop finding them silently. Raise the floor\n` +
          `   to a coarse fraction of the real count — do NOT delete the row, the key set is pinned\n` +
          `   to SOURCE_EXTS on purpose.\n`,
      )
      process.exit(1)
    }
  }

  const pairs = findStemPairs(files)
  if (pairs.length) {
    console.error(`\n❌ extension-stem-pairs: ${pairs.length} directory/stem pair(s) share the same stem across more than one extension\n`)
    for (const p of pairs) console.error(p.files.map((f) => `   ${short(f)}`).join("\n") + "\n")
    console.error(
      `   An unextended import resolves to exactly one of these, silently masking the rest.\n` +
        `   Delete the predecessor(s) in the SAME commit that introduces the successor —\n` +
        `   CLAUDE.md, "Do not split an extension migration across commits".\n`,
    )
    process.exit(1)
  }

  const casePairs = findCaseInsensitiveStemPairs(files)
  if (casePairs.length) {
    console.error(`\n❌ extension-stem-pairs: ${casePairs.length} directory/stem pair(s) collide ONLY when case-folded\n`)
    for (const p of casePairs) console.error(p.files.map((f) => `   ${short(f)}`).join("\n") + "\n")
    console.error(
      `   These are two distinct files on a case-sensitive filesystem (Linux CI sees no problem),\n` +
        `   but win32/macOS's default case-insensitive filesystem resolves an unextended import to\n` +
        `   just one of them — silently masking the other. Rename one file so the stems no longer\n` +
        `   collide even when case-folded.\n`,
    )
    process.exit(1)
  }

  // Precise version of the floor check above: the walk's file set (gitignored files filtered out —
  // see `filterGitIgnored`) must equal what git itself tracks or would track. A skip-list that
  // grows to swallow a real source directory (the exact defect class this check's own SKIP_DIRS
  // was found to have during M-041 review — "app"/"generated"/"build" all being live,
  // hand-authored directory names) shrinks `files` without shrinking the floor-tripping threshold,
  // and the floor alone cannot see that; this can. Real-run only (see the `explicitRoot` comment
  // above) — a fixture root has no relationship to this repo's git index and would fail here for an
  // unrelated reason (use `gitReconciliationViolations` directly against a synthetic git repo to
  // test this logic without that constraint — see --selftest).
  if (!explicitRoot) {
    const recon = gitReconciliationViolations(scanRoot, files)
    if (recon.skipped) {
      // Two distinct causes, two distinct messages (M-063 re-entry 2, W2-F4) — "git unavailable"
      // for both was itself the finding: they call for different responses (install/repair git vs.
      // an unresolved subset of files whose ignore-status could not be checked).
      const why =
        recon.reason === "check-ignore-unavailable"
          ? `git check-ignore unavailable — ${recon.unresolvedCount} walked file(s) could not be checked against .gitignore`
          : "git ls-files unavailable"
      console.log(`   ⚠ extension-stem-pairs: ${why} — skipping the git-reconciliation check, relying on the extension floors only.`)
    } else if (recon.onlyWalked.length || recon.onlyTracked.length) {
      console.error(`\n❌ extension-stem-pairs: the filesystem walk and \`git ls-files\` disagree on the source-file set.\n`)
      if (recon.onlyWalked.length) {
        console.error(`   Walk found (and git does not ignore), git does not track/see (${recon.onlyWalked.length}):`)
        for (const f of recon.onlyWalked) console.error(`     ${short(f)}`)
      }
      if (recon.onlyTracked.length) {
        console.error(`   git tracks/sees, the walk skipped (${recon.onlyTracked.length}):`)
        for (const f of recon.onlyTracked) console.error(`     ${short(f)}`)
      }
      console.error(
        `\n   Gitignored files are already filtered out of this comparison (see filterGitIgnored),\n` +
          `   so this is a REAL disagreement: either SKIP_DIRS is hiding a real, git-tracked source\n` +
          `   directory, or the walk/pathspec extension match has drifted from SOURCE_EXTS. Do NOT\n` +
          `   grow SKIP_DIRS to silence this — that is the exact regression GIT_RECONCILE_SKIP_DIRS's\n` +
          `   own comment exists to prevent. A stem pair inside a hidden or drifted directory would\n` +
          `   never be reported.\n`,
      )
      process.exit(1)
    }
  }

  console.log(
    `🔀 extension-stem-pairs: no stem collisions (exact or case-only) across ${files.length} files ` +
      `(${SOURCE_EXTS.join(", ")})`,
  )
}
