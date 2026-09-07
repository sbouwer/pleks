#!/usr/bin/env node
/**
 * scripts/check-deps-installed.mjs — the tree's declared dependencies must actually be on disk
 *
 * Auth:   n/a (local check, no network, no credentials)
 * Data:   package-lock.json (what the tree DECLARES) vs node_modules/.package-lock.json (npm's own
 *         record of what it last PUT on disk). Two file reads, no directory walk, no stat storm.
 * Notes:  THE SCAR (2026-09-07). A branch cut from origin/main after three dependabot merges
 *         carried a package-lock.json requiring `@react-pdf/hyphenate`, `@react-pdf/paginate` and
 *         `pdfkit`. None were on disk — the install record was eleven days old. `tsc` passed,
 *         lint passed, and the test tier collected ZERO tests, which reads exactly like the
 *         flaky-cache signature in LESSONS L-26. Forty minutes went into diagnosing a phantom.
 *         The gate had not failed; the gate could not EXECUTE.
 *
 *         That distinction is the whole point of this file, and it is mechanical rather than a
 *         judgement call: clearing node_modules/.vite discards a derived cache to make a signal go
 *         away — suppression. Running `npm ci` installs packages the tree declares and the disk
 *         lacks — it makes the gate able to run. This check exists so the SECOND one is named for
 *         you at 07:48 instead of inferred at 08:30, so it FAILS WITH THE REMEDY rather than with
 *         a symptom. It is deliberately first in `npm run check` (ahead of even `tsc --noEmit`):
 *         it is the cheapest thing in the chain and every later link depends on it being true.
 *
 *         WHY `npm run check` AND NOT A PUSH GATE. Pre-commit runs `npm run check`, so putting it
 *         here catches the drift at the first commit rather than at the first push — earlier, and
 *         at no extra cost, because two `readFileSync`s are free next to `tsc`.
 *
 *         WHAT IS TOLERATED, AND WHY IT IS EXACTLY ONE FLAG. `optional: true` entries are skipped:
 *         npm legitimately declines to install them when the host's os/cpu does not match, which
 *         is the entire `@esbuild/*`, `@rollup/rollup-*` and `@img/sharp-*` family. Measured
 *         2026-09-07 on a clean `npm ci` (commit c7ed0939, win32/x64): 1672 lock entries, 1458
 *         installed, and ALL 213 of the difference carried `optional: true` — no second class to
 *         accommodate, so no second skip is written.
 *
 *         `devOptional` is deliberately NOT tolerated, and the reason is a live one: the ONLY
 *         entry in this lockfile carrying that flag is `typescript` itself. Tolerating the flag
 *         would put a hole in this check around the single most load-bearing package in the chain
 *         — `tsc --noEmit` is the very next link — so a missing compiler would produce a confusing
 *         downstream failure instead of the one-line remedy above. `link` (workspace symlinks) is
 *         not skipped either: there are zero today, and a skip for a class that does not exist is
 *         an unclassified exemption. If one ever appears, this check fails and whoever hits it
 *         classifies it then. That is the direction allowlists are allowed to move.
 *
 *         E17 INTERACTION, and it is a TRUE positive. `node_modules` is a junction shared by every
 *         worktree of this repo, while `package-lock.json` is per-worktree. Two worktrees on
 *         branches with different lockfiles will therefore trip each other's check. That is not
 *         noise: the checking-out tree genuinely does not have installed what it declares, and
 *         running its gate would prove nothing. `npm ci` is still the answer — it is just also the
 *         reason worktree cells in this repo run strictly sequentially.
 *
 *         BOUNDARY. This compares the lockfile to npm's INSTALL RECORD, not to the directory tree.
 *         A package whose directory was deleted by hand after a successful install still appears
 *         in the record and is not caught here. That was a deliberate scope call, not an oversight
 *         — the alternative is 1433 `existsSync` calls on every commit, to catch a failure mode
 *         nobody has hit, when `npm ci` is the remedy for both.
 *
 *         `main()` runs unconditionally on import, rather than behind the usual
 *         `argv[1] === import.meta.url` guard, even though `diagnose` is exported for probing. The
 *         guard's failure mode on win32 is a path-casing mismatch that makes the check silently
 *         no-op and exit 0 — a false all-clear, which is the one outcome worse than a false alarm.
 *
 * Run: node scripts/check-deps-installed.mjs             (wired FIRST into `npm run check`)
 *      node scripts/check-deps-installed.mjs --selftest  (probes both directions, no I/O)
 */
import { readFileSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const LOCK = join(ROOT, "package-lock.json")
const RECORD = join(ROOT, "node_modules", ".package-lock.json")

/**
 * A lock entry npm may legitimately have declined to install. See the header: exactly one flag,
 * because exactly one class was observed. `devOptional` is NOT here on purpose.
 */
const tolerated = (entry) => entry?.optional === true

/**
 * The whole comparison, as a pure function of two parsed lockfiles — so --selftest can probe it
 * with fixtures and never touch the filesystem or a subprocess.
 *
 * Returns { missing, mismatched, considered }. `considered` is the denominator the degenerate-run
 * guard checks: a parse that silently yields nothing must fail loudly rather than report "clean".
 */
export function diagnose(lock, record) {
  const lockPkgs = lock?.packages ?? {}
  const recordPkgs = record?.packages ?? {}
  const missing = []
  const mismatched = []
  let considered = 0

  for (const [path, entry] of Object.entries(lockPkgs)) {
    if (!path) continue // "" is the project root, not a dependency
    if (tolerated(entry)) continue
    considered++

    const installed = recordPkgs[path]
    if (!installed) {
      missing.push({ path, version: entry.version })
      continue
    }
    // A present-but-wrong version is the same class of defect: the tree declares one thing and the
    // disk holds another, and the gate would run against the wrong code either way.
    if (entry.version && installed.version && entry.version !== installed.version) {
      mismatched.push({ path, want: entry.version, have: installed.version })
    }
  }

  return { missing, mismatched, considered }
}

const short = (p) => p.replace(/^node_modules\//, "").replace(/node_modules\//g, " › ")

const REMEDY =
  "   Remedy: npm ci\n" +
  "   This is not routing around a failure — the gate has not run yet. It cannot: the packages\n" +
  "   it needs are declared by package-lock.json and are not on disk. `npm ci` installs exactly\n" +
  "   what the lockfile pins. Do NOT reach for `rm -rf node_modules/.vite` or `--no-verify`.\n"

function selftest() {
  const fixture = (pkgs) => ({ packages: { "": { name: "pleks" }, ...pkgs } })
  const fails = []
  const probe = (name, ok) => {
    if (!ok) fails.push(name)
  }

  // ── Direction 1: a planted violation must FAIL ────────────────────────────────────────────
  // The exact 2026-09-07 case, by name: present in the lock, absent from the install record.
  {
    const lock = fixture({
      "node_modules/@react-pdf/paginate": { version: "1.0.0" },
      "node_modules/pdfkit": { version: "0.15.0" },
      "node_modules/react": { version: "19.0.0" },
    })
    const record = fixture({ "node_modules/react": { version: "19.0.0" } })
    const r = diagnose(lock, record)
    probe("missing non-optional package is reported", r.missing.length === 2)
    probe(
      "the motivating packages are the ones named",
      r.missing.map((m) => m.path).join() === "node_modules/@react-pdf/paginate,node_modules/pdfkit",
    )
  }

  // A present-but-stale version is the same defect wearing different clothes.
  {
    const lock = fixture({ "node_modules/@react-pdf/renderer": { version: "4.9.0" } })
    const record = fixture({ "node_modules/@react-pdf/renderer": { version: "4.6.0" } })
    const r = diagnose(lock, record)
    probe("version mismatch is reported", r.mismatched.length === 1 && r.mismatched[0].want === "4.9.0")
  }

  // ── Direction 2: known-good cases must PASS ───────────────────────────────────────────────
  // The @img/sharp-* / @esbuild/* family — platform-gated, legitimately absent on this host.
  {
    const lock = fixture({
      "node_modules/@img/sharp-linux-x64": { version: "0.34.0", optional: true, os: ["linux"], cpu: ["x64"] },
      "node_modules/@esbuild/darwin-arm64": { version: "0.25.0", optional: true, os: ["darwin"] },
      "node_modules/react": { version: "19.0.0" },
    })
    const record = fixture({ "node_modules/react": { version: "19.0.0" } })
    const r = diagnose(lock, record)
    probe("optional platform-gated packages are tolerated when absent", r.missing.length === 0)
    probe("optional packages are excluded from the denominator", r.considered === 1)
  }

  // An identical pair is clean — the ordinary post-`npm ci` state.
  {
    const same = () => fixture({ "node_modules/react": { version: "19.0.0" }, "node_modules/next": { version: "16.0.0" } })
    const r = diagnose(same(), same())
    probe("an install record matching the lock is clean", r.missing.length === 0 && r.mismatched.length === 0)
  }

  // devOptional must NOT be tolerated — `typescript` is the live case (see header).
  {
    const lock = fixture({ "node_modules/typescript": { version: "5.9.0", devOptional: true } })
    const r = diagnose(lock, fixture({}))
    probe("devOptional is NOT tolerated (typescript is the live case)", r.missing.length === 1)
  }

  // ── The degenerate run: a parse that yields nothing must not read as "clean" ───────────────
  {
    const r = diagnose({ packages: { "": {} } }, { packages: {} })
    probe("an empty lock yields a zero denominator the caller can trip on", r.considered === 0)
  }

  if (fails.length) {
    console.error(`\n❌ deps-installed --selftest: ${fails.length} probe(s) failed\n`)
    for (const f of fails) console.error(`   ${f}`)
    console.error("")
    process.exit(1)
  }
  console.log("📦 deps-installed --selftest: 8 probes passed (both directions)")
}

function main() {
  if (process.argv.includes("--selftest")) return selftest()

  if (!existsSync(LOCK)) {
    console.error("\n❌ deps-installed: package-lock.json is missing — cannot tell what this tree declares.\n")
    process.exit(1)
  }
  if (!existsSync(RECORD)) {
    console.error(
      "\n❌ deps-installed: node_modules/.package-lock.json is missing — npm has no record of\n" +
        "   having installed anything into this tree.\n\n" +
        REMEDY,
    )
    process.exit(1)
  }

  let lock, record
  try {
    lock = JSON.parse(readFileSync(LOCK, "utf8"))
    record = JSON.parse(readFileSync(RECORD, "utf8"))
  } catch (err) {
    console.error(`\n❌ deps-installed: could not parse a lockfile — ${err.message}\n\n${REMEDY}`)
    process.exit(1)
  }

  const { missing, mismatched, considered } = diagnose(lock, record)

  // False-zero guard. A shape change in npm's lockfile format (or a truncated read) would produce
  // an empty comparison, and an empty comparison reports "clean" — the exact failure this repo has
  // been bitten by before. A real lockfile here has ~1400 non-optional entries; anything under a
  // few hundred means the parse, not the tree, is what changed.
  if (considered < 200) {
    console.error(
      `\n❌ deps-installed: only ${considered} non-optional entries parsed out of package-lock.json.\n` +
        `   That is far below this repo's real dependency count, so the comparison is degenerate and\n` +
        `   a "clean" result here would be meaningless. npm's lockfile shape has probably changed\n` +
        `   (lockfileVersion is ${lock.lockfileVersion}); fix the parse rather than lowering this floor.\n`,
    )
    process.exit(1)
  }

  if (missing.length || mismatched.length) {
    console.error(
      `\n❌ deps-installed: this tree declares ${missing.length + mismatched.length} package(s) that ` +
        `node_modules does not have.\n`,
    )
    if (missing.length) {
      console.error(`   Declared in package-lock.json, never installed (${missing.length}):`)
      for (const m of missing.slice(0, 20)) console.error(`     ${short(m.path)}@${m.version}`)
      if (missing.length > 20) console.error(`     … and ${missing.length - 20} more`)
      console.error("")
    }
    if (mismatched.length) {
      console.error(`   Installed at the wrong version (${mismatched.length}):`)
      for (const m of mismatched.slice(0, 20)) console.error(`     ${short(m.path)}: want ${m.want}, have ${m.have}`)
      if (mismatched.length > 20) console.error(`     … and ${mismatched.length - 20} more`)
      console.error("")
    }
    console.error(
      "   Nothing below this line in `npm run check` can be trusted until this is fixed. A test\n" +
        "   tier that collects zero tests, or a type error in a package you did not touch, is the\n" +
        "   SYMPTOM of this — not a flaky cache.\n\n" +
        REMEDY,
    )
    process.exit(1)
  }

  console.log(`📦 deps-installed: ${considered} non-optional packages declared and installed (lockfileVersion ${lock.lockfileVersion})`)
}

main()
