#!/usr/bin/env node
/**
 * scripts/check-claude-md.mjs — the marker audit for CLAUDE.md and .claude/rules/*.md
 *
 * @kit check-claude-md v17 — tracked OUTSIDE its `KIT:CONFIG` regions. Improve it in
 * dev-standards and re-adopt; a local change here is a fork and `check-kit-drift.mjs` says so.
 * Imports `hookRegistrations` from `check-hook-registration.mjs`, which is a kit item too and
 * must be installed beside it — the `hook:` namespace resolves through registration, not presence,
 * and re-deriving that parser here is how the two would drift apart.
 *
 * PROMOTED 2026-09-08 from pleks, replacing `claude-md-ratio.mjs`, which computed the ratio and
 * nothing else: it had no --selftest at all, passed a marker-less rule (the one thing
 * 0-GREENFIELD §1.2 requires it to fail), counted marker OCCURRENCES so one bullet citing two
 * M-numbers produced a negative `floor`, and resolved `@enforced` by existsSync — a script
 * nobody runs and a hook nothing registers both counted as enforcement.
 *
 * standards/CLAUDE-MD-STANDARD §4.1 — canonical copy at `C:\dev\dev-standards\standards\CLAUDE-MD-STANDARD.md`
 * (v4.4 as at 2026-08-18; this header cited "v4.1" with no path, which resolved to nothing on disk
 * until 2026-08-19 — a fabricated SSOT reference in the very script written to catch them).
 * The spec lives OUTSIDE this repo deliberately: it is cross-project, and the template it carries
 * is the source for several codebases. That makes the path, not the name, the citation.
 * Validates MARKERS ONLY — never prose. The first prose-parsing
 * attempt in the source project scored six findings, six false positives; parsing prose for
 * identifiers inherits every ambiguity of prose.
 *
 * Four exact directions:
 *   1. every `@enforced <ns:id>` names a control that EXISTS
 *   2. every control is claimed by AT MOST ONE tag
 *   3. every `@unenforceable` carries a non-empty reason
 *   4. every bullet inside a RULES SECTION carries a marker (closes the forgotten-tag hole)
 *
 * ⚠ WHY THIS FILE EXISTS AT ALL. Without it the markers are prose with syntax, and
 * `@enforced eslint:pleks/no-cookie-client-from` is exactly the unverified enforcement claim the
 * markers were introduced to make unwritable. The field case: a commit message asserting it had made
 * a missed writer "a build failure instead of a silent divergence" when it had left no guard at all.
 *
 * ⚠ WRITTEN PROBE-FIRST — the fixtures below were written BEFORE the checker, and that ordering is
 * the point, not a style note. On 2026-08-18 a pairing check in this repo was written three times and
 * reported 328 → 29 → 21 violations, each number plausible, one known-good case wrong in all three;
 * root cause a regex in a template literal where `\s` silently degraded to `s`. A never-matching
 * pattern reports 100% violations, so tool failure and catastrophic finding are the same output, and
 * partial fixes shrink the number while INCREASING its believability. The fixture that kills that
 * class is the boring one: A KNOWN-GOOD CASE MUST PASS. Run `--selftest`.
 *
 * Usage:
 *   node scripts/check-claude-md.mjs             # audit the real files
 *   node scripts/check-claude-md.mjs --selftest  # run the fixtures (both directions)
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, mkdirSync, rmSync, copyFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join , dirname} from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { registrations as hookRegistrations } from "./check-hook-registration.mjs"

// ── Rules sections. Listed explicitly, and the list ASSERTS ITS OWN PREMISE (§4.3): a heading that
//    no longer exists FAILS rather than silently un-auditing its section. Renaming a heading to
//    escape the audit is the obvious defeat, so it is the one made loud.
// Moved 2026-08-19 with the v4.5 restructure, in the SAME commit as the headings — a scope change
// is a window change, and the two must never be separated: the vanished-section assertion below is
// the only thing standing between "renamed a heading" and "silently un-audited its bullets".
// Probed on the new scope before being trusted: a marker-less bullet planted under `### Enforced`
// must fail. Passing on the new scope is not evidence the new scope is audited.
/* KIT:CONFIG sections — the headings under which EVERY bullet must carry a marker (check 4).
 * Matched by exact full-line equality, not prefix: a heading that differs by one character reports
 * "rules section vanished", which is loud and correct. These are also the only sections check 4
 * patrols — they are NOT the metric's scope, which is file-wide by measurement (see the metric). */
const RULES_SECTIONS = [
  "### Enforced",
  "## 5 · DOCTRINE THE MACHINE CANNOT HOLD",
]
/* KIT:CONFIG /sections */

/* KIT:CONFIG register — the M-register this project's pointers resolve into.
 * PATH and HEADING GRAMMAR, and the grammar is the whole of the estate's register divergence:
 * pleks writes `### M-NNN`, yoros `## M-NNN`, life-therapy `### M-NN`. The tool's dependency on it
 * is these two lines and nothing else, so a project adopts at its own grammar today and converges
 * separately — the convergence is a document migration, not a precondition for a working checker.
 * `CLAUDE-MD-STANDARD` §12 names the target grammar and holds the deadline.
 *
 * ⚠ THE DEFAULTS BELOW ARE THE STANDARD'S SHARED PARSER VERBATIM, and the `[a-z]?` in them is
 * load-bearing. 2026-09-09: the estate carried FOUR spellings of one grammar — this default and
 * yoros's copy at `M-\d{3}`, canon's carried value at `M-KIT-\d{2}`, the standard's §12.1 table at
 * `M-(?:KIT-)?\d{2,3}`, and `docs/MECHANISABLE.md` at the corrected form. A heading regex without
 * the suffix does not MISS `### M-068b`; it has no right anchor, so it captures `M-068` and the
 * entry is silently filed under its sibling's id — one register's status read for another's, and
 * a distinct-id count one short (measured in pleks: 106 headings, 105 ids). Widen the default
 * before a project meets it, not after. */
const REGISTER_PATH = "docs/MECHANISABLE.md"
const REGISTER_HEADING = /^### (M-(?:KIT-)?\d{2,3}[a-z]?)/gm
const POINTER = /\bM-(?:KIT-)?\d{2,3}[a-z]?(?:@[A-Za-z0-9_.-]+)?\b/g

/**
 * THREE IDS IN THIS PROJECT'S GRAMMAR, for the fixtures — [resolves, duplicated, absent].
 *
 * M-KIT-06: a kit item's fixtures must be built from its CONFIG REGIONS, not from their default
 * values. Before this, the fixtures asserted `M-001` literally, so a project that configured the
 * grammar above — which this region exists to invite — failed two of the file's own probes for
 * doing exactly what it was told. Found in this repo's own configured copy on 2026-09-09, the same
 * day the region was written.
 *
 * They are CHECKED AGAINST THE GRAMMAR rather than trusted: a probe asserts each id matches
 * `POINTER`, and that `### <id>` matches `REGISTER_HEADING`. So the region validates itself, and
 * changing the grammar without the samples fails by name instead of failing three fixtures for
 * reasons that look unrelated to the edit.
 */
const SAMPLE_IDS = ["M-001", "M-002", "M-999"]
/* KIT:CONFIG /register */

/**
 * NAMESPACES THIS PROJECT ADDS (M-KIT-12). Empty in canon, which ships six.
 *
 * `KNOWN_NAMESPACES` sat inside this region, inviting a project to add its namespace, while the
 * `switch` that had to answer for it sat outside every region — so filling the region could not
 * make the namespace resolve, and the only ways out were deleting a true `@enforced` claim or
 * forking a tracked file. Reported by the life-therapy session, 2026-09-09, whose `settings:`
 * namespace resolves against the live `permissions.ask` array — a STRONGER resolution than canon
 * has for any of its six.
 *
 * Each entry is `{ resolve, mustResolve, mustNotResolve }`:
 *
 *   resolve(id, io)  -> boolean. `io` gives { root, read, exists, json } so a resolver reads the
 *                       project's own files without importing anything.
 *   mustResolve      -> an id from THIS project that the resolver must return true for.
 *   mustNotResolve   -> an id it must return false for.
 *
 * THE TWO SAMPLES ARE NOT DOCUMENTATION — they are asserted on every run, and a resolver that
 * fails either is refused with its namespace named. This is the `SAMPLE_IDS` pattern that closed
 * M-KIT-06, applied one layer out: THE REGION VALIDATES ITSELF, so a resolver that blanket-returns
 * true cannot be installed, and one that silently stops reading its subject fails the day it does.
 *
 * It does NOT prove the resolver checks INVOCATION rather than existence — no signature can. What
 * it proves is that the resolver DISCRIMINATES, which is the falsifiable half. The shape rule
 * above still binds and is still on the author: resolve through the thing that invokes the
 * control, never `existsSync`. A resolver that only checks a file exists is the overclaim this
 * grammar exists to prevent, and canon can catch a liar here but not a fool.
 *
 *   settings: {
 *     resolve: (id, io) => JSON.stringify(io.json(".claude/settings.json").permissions?.ask ?? [])
 *                            .includes(id),
 *     mustResolve: "git push", mustNotResolve: "nothing-asks-for-this",
 *   },
 *
 * ⚠ THE DECLARATION LIVES OUTSIDE THE REGION, and the first version put it inside — which broke
 * canon's own adopted copy on the very next re-adopt with `PROJECT_RESOLVERS is not defined`. A
 * config region is BY DEFINITION the bytes an adopter keeps, so a new REQUIRED declaration placed
 * inside one is invisible to every project that already adopted: they carry their old region
 * forward and lose the thing the new code needs. Declarations are canon's; only their CONTENTS are
 * the project's. A project adds its namespace by assigning into the object from inside the region:
 *
 *   PROJECT_RESOLVERS.settings = {
 *     resolve: (id, io) => JSON.stringify(io.json(".claude/settings.json").permissions?.ask ?? [])
 *                            .includes(id),
 *     mustResolve: "git push", mustNotResolve: "nothing-asks-for-this",
 *   }
 */
const PROJECT_RESOLVERS = {}

/**
 * Every namespace the switch answers for. Named in the finding, so an author meeting an
 * unconfigured one is told what IS available rather than left to read the source.
 *
 * ⚠ DECLARED HERE, OUTSIDE THE REGION, AND THAT PLACEMENT IS THE POINT — 2026-09-09, the second
 * incident of this class in one day. It sat INSIDE `KIT:CONFIG resolvers` as a plain array while
 * the switch that had to answer for it sat outside (M-KIT-12, ⑦). v9 changed its SHAPE to a
 * function so a project's own resolvers could extend it; `apply-kit` then carried canon's own
 * pre-v9 region forward verbatim, declaration and all, and the v12 file crashed on its first run
 * with `KNOWN_NAMESPACES is not a function`. Nothing measured it — the drift check saw a tracked
 * file matching canon outside its regions, which it did.
 *
 * THE RULE THE TWO INCIDENTS EARNED: **a KIT:CONFIG region holds VALUES, never DECLARATIONS.** A
 * declaration's shape is an interface between canon's code and the project's, and carrying it
 * forward pins the project to an old one silently. Names and shapes are canon's; only what is
 * assigned to the names inside the region is the project's. → M-KIT-15.
 */
const CANON_NAMESPACES = ["eslint", "check", "hook", "ci", "audit", "test"]
const KNOWN_NAMESPACES = () => [...CANON_NAMESPACES, ...Object.keys(PROJECT_RESOLVERS)]

/* KIT:CONFIG resolvers — where each `@enforced <ns>:<id>` namespace looks.
 * THE SHAPE IS CANON: every namespace resolves through the thing that INVOKES the control, never
 * `existsSync`. A check script unreachable from the gate and a hook absent from settings are FILES,
 * and a tag claiming them is the overclaim this grammar exists to prevent. Only the paths below
 * are yours. A namespace whose paths a project does not have simply never resolves — see the
 * `default` arm, and M-KIT-02 for why that is reported as "no such control" rather than
 * "namespace not configured", which is a false finding wearing a true one's clothes. */
const ESLINT_CONFIG = "eslint.config.mjs"
const ESLINT_CUSTOM_PREFIX = "pleks/"      // "" if this project ships no custom rules
const ESLINT_RULES_DIR = "eslint-rules"
const SCRIPTS_DIR = "scripts"
const GATE_SCRIPTS = ["check", "check:full"]   // package.json scripts a `check:` id must be reachable from
const HOOKS_DIR = ".claude/hooks"
const SETTINGS_PATH = ".claude/settings.json"
const CI_DIR = ".github/workflows"
const AUDIT_ENTRY = "scripts/security/audit.mjs"

/* KIT:CONFIG /resolvers */

// The ratchet region sat beside the ratchet, below the selftest, until v17 — whose exit probes seed
// a fixture's ceiling and met `CEILING_PATH` in its temporal dead zone. Regions graft by NAME, so
// moving one changes no adopter's value; the ratchet itself is explained where it runs.
/* KIT:CONFIG ratchet — where this project's N ceiling and D floor live. Seed it from one measured
 * run: the ratchet fails when N is BELOW maxN as well as above it, so it cannot be seeded high. */
const CEILING_PATH = "scripts/check-claude-md.ceiling.json"
/* KIT:CONFIG /ratchet */

/**
 * ns:id[:qualifier] — `advisory` (the control REPORTS rather than blocking) or `shared`.
 *
 * ⚠ `advisory` DOES NOT EXCUSE A CONTROL THAT DOES NOT RESOLVE, and it was dead code until
 * 2026-09-09 — parsed into `qualifier`, documented here, and read nowhere, so a marker carrying it
 * behaved exactly like one that did not. Reported by the yoros session, which had hoped it was the
 * escape for an unresolvable-but-true marker. It is not, and must not become one: an escape that
 * silences a marker because the control cannot be found is a mute button, and this file exists to
 * stop exactly that. `advisory` is a claim about a control that EXISTS — it runs and reports
 * instead of failing the build — so an unresolved `:advisory` marker still fires. What the
 * qualifier now does is count: the summary says how many resolved controls report rather than
 * block, which is a number a reader can act on.
 *
 * `shared` exists because the no-double-claim rule was too strict for one real case. It was
 * written to catch TWINS — the same rule restated in two files, both tagging one control, which
 * would inflate the enforced count with a single mechanism counted twice. But one script can also
 * enforce several genuinely DIFFERENT rules: check-migration-integrity asserts the migration file
 * set, policy pairing, and org_id-on-new-table, which are three separate doctrine lines that each
 * became mechanised. Counting all three is honest; refusing to is not.
 *
 * So `shared` is an explicit author assertion — "this control legitimately enforces more than one
 * distinct rule" — and it stays visible in the diff. A twin still uses the prose convention
 * ("same control as X, not re-tagged here"), because a twin is one rule, not several.
 */
// The id class MUST include "@" — scoped npm/plugin rule ids like
// `@typescript-eslint/no-explicit-any` are real controls. It did not, until 2026-08-18.
/**
 * `@enforced <ns>:<id>[@<repo>][:<qualifier>]`
 *
 * `@<repo>` — THE CONTROL IS INVOKED BY ANOTHER REPO (M-KIT-13). Reported by the yoros session,
 * 2026-09-09: `audit:spine-drift` reported "no such control" while genuinely being mechanised — by
 * dev-standards' gate, which scans every project. Yoros's gate is simply not what mechanises it.
 * Pointing a resolver at an absolute path in a sibling repo would resolve the marker BY BREAKING
 * EVERY CLONE, and a project's gate must never invoke a script from canon by path. So the project
 * was correct to leave it unresolved and correct not to fork, and had no word for what was true.
 *
 * ⚠ IT DOES NOT RESOLVE, AND THAT IS THE WHOLE DESIGN. Both sessions warned, independently and
 * before it existed, that this must not become an escape hatch that resolves with no invoker — the
 * overclaim the grammar exists to prevent, and the same trap `advisory` was nearly turned into on
 * the same day. So a delegated marker is reported as DELEGATED, counted apart from enforced, and
 * still counts toward the unenforceable ratio: nothing HERE checks it, and the ratio is a claim
 * about what this tree holds. What the qualifier buys is a true sentence where there was a false
 * one — "enforced elsewhere, unverified here" instead of "no such control".
 *
 * The verification is real but lives where it can be done: canon reads every project, so canon can
 * assert that the named repo ships a control by that id and that its gate reaches it. That half is
 * M-KIT-13's second stage and is NOT built — until it is, a delegated marker is a declaration, and
 * the summary line says so in those words rather than implying a check.
 */
const TAG = /@enforced\s+([a-z]+):([A-Za-z0-9/_.@-]+)(?::(advisory|shared))?/g

/**
 * Split a trailing `@repo` off an id, WITHOUT eating a scoped package name.
 *
 * `@typescript-eslint/no-explicit-any` is an id that legitimately begins with `@`, and the first
 * version of the delegation regex removed `@` from the id class to make room for the suffix —
 * which broke that fixture immediately. The distinguisher is position, not the character: a scope
 * leads, a repo trails. So the id must be non-empty BEFORE the `@`, and what follows must carry no
 * `/`, which every scoped name does.
 */
export function splitRepo(id) {
  const m = id.match(/^(.+?)@([A-Za-z0-9_.-]+)$/)
  return m ? { id: m[1], repo: m[2] } : { id, repo: null }
}
const UNENF = /\*\*UNENFORCEABLE\*\*\s*—\s*(.*)/

/** Does a control id resolve to something real? Lookup per namespace, never inference from prose. */
function controlExists(ns, id, root = ".") {
  const rd = (p) => readFileSync(`${root}/${p}`, "utf8")
  try {
    // ⚠ BEFORE THE SWITCH, not in its `default:` arm — an EXTENSION point where an OVERRIDE point
    // was needed. Reported by the life-therapy session, 2026-09-09, with the measurement: canon's
    // `audit:` arm is a literal substring test against one file, and that project's 21 audit ids
    // are SLUGGED check names (`check("date-safety: no hardcoded +02:00 offset")` ->
    // `date-safety-no-hardcoded-02-00-offset`). 1 of 21 resolved, and the 1 was a false positive —
    // it matched a selftest fixture literal. Canon's arm is right for a project that tags with
    // literal rule names and wrong for one whose control names are DERIVED, which is the normal
    // case for a check named after a bug class. Hard-coding that choice above the extension point
    // made it uncorrectable.
    //
    // M-KIT-02's `"unconfigured"` return stays reachable below for a namespace nobody configured,
    // and `auditResolvers` is what stops an override becoming a way to pass a namespace by fiat.
    const custom = PROJECT_RESOLVERS[ns]
    if (custom) {
      return Boolean(custom.resolve(id, {
        root,
        read: (rel) => rd(rel),
        exists: (rel) => existsSync(`${root}/${rel}`),
        json: (rel) => JSON.parse(rd(rel)),
      }))
    }
    switch (ns) {
      case "eslint": {
        // ⚠ TWO KINDS OF ESLINT CONTROL, AND THE FIRST VERSION SAW ONLY ONE.
        // Custom `pleks/*` rules live in eslint-rules/. But BUILT-IN and plugin rules configured in
        // eslint.config.mjs — `no-restricted-imports`, `react/jsx-key`, `@typescript-eslint/*` — are
        // equally real controls with no file of their own. The resolver required a file, so a rule
        // genuinely enforced by config could not be truthfully tagged, and the tagging pass correctly
        // refused to stretch the grammar and marked those rules UNENFORCEABLE instead.
        // That inflated N — the binding metric — with controls that exist. THE TOOL WAS CONSTRAINING
        // THE TRUTH, which is the one thing a measurement instrument must not do.
        const cfg = rd(ESLINT_CONFIG)
        const custom = ESLINT_CUSTOM_PREFIX !== "" && id.startsWith(ESLINT_CUSTOM_PREFIX)
        // `id.slice(ESLINT_CUSTOM_PREFIX.length)`, never a literal — it was `id.slice(6)`, a magic
        // number silently bound to the string "pleks/" six characters away.
        if (custom) return existsSync(`${root}/${ESLINT_RULES_DIR}/${id.slice(ESLINT_CUSTOM_PREFIX.length)}.mjs`) && cfg.includes(`"${id}"`)
        return cfg.includes(`"${id}"`)   // configured built-in / plugin rule
      }
      // ⚠ EXISTENCE IS NOT ENFORCEMENT — the defect this file was written to expose, one layer in.
      // Both of these resolved on `existsSync` alone. A check script nobody runs and a hook file
      // nothing invokes are FILES; the tag claiming them is exactly the overclaim the marker
      // grammar exists to prevent. So each now resolves through the thing that INVOKES it.
      case "check": {
        const pkg = JSON.parse(rd("package.json"))
        // `check:full` counts — it is the pre-push tier and chains `check`. A script reachable from
        // neither is unwired, however green it is when run by hand.
        const chain = GATE_SCRIPTS.map((k) => expandScript(pkg.scripts, k)).join(" ")

        // ⚠ A CONTROL WITH NO FILE IS STILL A CONTROL — the same defect the eslint case above
        // spent a paragraph refusing, committed one branch down. This required
        // `scripts/<id>.mjs` to exist, so `typecheck`, `lint`, `deadcode` and `cycles` — npm
        // scripts running tsc, eslint, knip and madge, which have no script file of their own —
        // could not be truthfully tagged. Reported by the yoros session, 2026-09-09: four TRUE
        // markers read as overclaims, and `SCRIPTS_DIR` was offered as configuration while the
        // FILENAME SHAPE was not. Same sentence as above and it applies here: the tool was
        // constraining the truth.
        //
        // So the control resolves either way, and BOTH ways still require the gate to reach it —
        // existence was never the claim. A named script that nothing runs stays false, which is
        // the overclaim the grammar exists to prevent.
        if (existsSync(`${root}/${SCRIPTS_DIR}/${id}.mjs`) || existsSync(`${root}/${SCRIPTS_DIR}/${id}.mts`)) {
          return chain.includes(id)
        }
        const named = Object.keys(pkg.scripts ?? {}).find((k) => k === id || k === `check:${id}`)
        return Boolean(named) && chain.includes(named)
      }
      case "hook": {
        if (!existsSync(`${root}/${HOOKS_DIR}/${id}.js`)) return false
        // Registration, not presence. Deleting settings' `hooks` block left both gates inert while
        // every tag still resolved (walker, PR #257). Reuses the registration parser rather than
        // re-deriving it, so the two checks cannot drift apart.
        return hookRegistrations(JSON.parse(rd(SETTINGS_PATH))).some((r) => r.file === `${id}.js`)
      }
      case "ci":
        return readdirSync(`${root}/${CI_DIR}`).some((f) =>
          rd(`${CI_DIR}/${f}`).includes(`${id}:`))
      case "audit":
        return rd(AUDIT_ENTRY).includes(id)
      case "test":
        return existsSync(`${root}/${id}`)
      default: {
        // M-KIT-02, closed by building. This arm used to `return false`, so an unknown NAMESPACE
        // and a missing CONTROL printed the same finding — "no such control" — and the two want
        // opposite fixes. A missing control is a rule to mechanise or demote; an unconfigured
        // namespace is a config region to fill, and reporting it as a missing control sends the
        // author to delete a true claim (L-81, the under-resolving direction).
        return "unconfigured"
      }
    }
  } catch { return false }
}

/**
 * THE RATIO, as ONE function, because three call sites agreeing by arithmetic is three chances to
 * disagree — and it took exactly one version to take the first.
 *
 * Found 2026-09-09 by the yoros session against v10, the version that stopped counting a delegated
 * marker as enforced. That fix reached the PRINTED line and stopped there: the ratchet was still
 * called with `N_unenf` and `--emit-ceiling` still emitted `N_unenf`, so a delegated rule left
 * `D_enforced` and never arrived in N. It was on NEITHER side of the invariant the ratchet exists
 * to hold. yoros's run printed `23 of 55` directly above `D at its floor (54)`.
 *
 * The consequence is worse than the mismatch, and it is why this is a function rather than a fixed
 * addition. `minD` is a FLOOR and D may only RISE, so tagging a rule `@enforced ns:id@repo` pushed
 * D below the floor, demanded a reseed — and the reseeded floor was LOWER. **The ratchet ratcheted
 * DOWN, once per delegation, every step green and argued in a commit message.**
 *
 * A delegated rule is unenforceable HERE. It belongs in N, and D is invariant under delegation:
 * moving a marker between `@enforced` and `@enforced ...@repo` may never change the denominator.
 * That is the probe below, and it is the whole claim.
 */
export function ratio({ unenforceable, delegated, enforced }) {
  const n = unenforceable + delegated
  return { n, d: n + enforced }
}

/** The ratchet, as a pure function so it can be probed in every direction. */
function ratchetFindings(n, ceiling, path, d) {
  if (!ceiling || typeof ceiling.maxN !== "number") {
    return [`${path} is missing or has no numeric maxN — the ratchet has no stored ceiling, so "N may only fall" is unenforced`]
  }
  const out = []
  if (n > ceiling.maxN) {
    out.push(`RATCHET: N rose to ${n}, ceiling is ${ceiling.maxN}. Mechanise the new rule, or raise maxN in ${path} in the SAME commit and argue it in the message.`)
  }
  if (n < ceiling.maxN) {
    out.push(`RATCHET: N fell to ${n} but the ceiling is still ${ceiling.maxN}. Lower maxN to ${n} — tightening the ratchet is part of the mechanisation's acceptance, not a follow-up.`)
  }

  // ── THE DENOMINATOR'S FLOOR, and why a ceiling on N alone is gameable ────────────────────────
  // N and D are counted from marker-carrying lines, which check 4 requires only INSIDE `### Enforced`
  // and §5. Everywhere else in CLAUDE.md a bullet needs no marker — correctly, because §1-§3 and
  // §6-§9 are prose, not the rules index.
  //
  // But that makes "N may only fall" satisfiable by MOVING a rule instead of mechanising it: cut an
  // UNENFORCEABLE bullet out of §5, paste it into §8 as ordinary prose, and N falls by one with the
  // rule still in the file, still unenforced, and now invisible to the metric that exists to count
  // it. The ratchet would report the mechanisation it did not get.
  //
  // Pinning D's FLOOR closes it: relocating a rule out of the tagged sections drops D and fails.
  // D may rise freely — a new ENFORCED rule is exactly what should be easy. Deliberately deleting an
  // obsolete rule lowers minD in the same commit, which is the visible, argued act a ratchet is for.
  if (typeof d === "number") {
    if (typeof ceiling.minD !== "number") {
      out.push(`${path} has no numeric minD — without it, N can be lowered by MOVING a rule out of the tagged sections instead of mechanising it`)
    } else if (d < ceiling.minD) {
      out.push(`RATCHET: D fell to ${d}, floor is ${ceiling.minD}. A rule left the tagged sections — mechanised rules RAISE D. If a rule was genuinely deleted, lower minD in ${path} in the SAME commit and say which rule and why.`)
    } else if (d > ceiling.minD) {
      out.push(`RATCHET: D rose to ${d} but the floor is still ${ceiling.minD}. Raise minD to ${d} — the new floor is part of the change, not a follow-up.`)
    }
  }
  return out
}

/**
 * Split on either line ending. This checker compares headings against exact literals, so on a CRLF
 * working tree every heading carried a trailing `\r`, matched nothing, and the checker reported
 * `rules section vanished: "### Enforced"` — a content check with an undeclared dependency on how
 * the tree was MATERIALISED. `.gitattributes` (`* text=auto eol=lf`) means no checkout can produce
 * that state here, so it was latent rather than live; it is still a bug in the check, and a latent
 * one is worth exactly one line. Found in the sibling project, reproduced here before fixing.
 */
const splitLines = (t) => t.split(/\r?\n/)

/**
 * Blank the contents of fenced code blocks, preserving line count so any line-indexed finding
 * downstream still points at the right line.
 *
 * R6 — a tag shown as an EXAMPLE is documentation of the format, not a claim that a control exists.
 * This file is the one most likely to want to document its own tagging syntax, which makes it the
 * one most exposed to the class it audits. Found 2026-08-23 by the mention fixture in FIXTURES, not
 * by review: before this, pasting the tag format into CLAUDE.md inside a fenced block would fail the
 * gate with "no such control", and the fix a reader would reach for is to mangle the example.
 *
 * Only FENCED blocks. Inline backticks are deliberately left alone: `<!-- @enforced … -->` tags are
 * routinely written next to inline-code spans, and blanking those would silence real tags — the
 * opposite failure, and the worse one.
 */
export function blankFences(text) {
  let inFence = false
  return splitLines(text)
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; return "" }
      return inFence ? "" : line
    })
    .join("\n")
}

/**
 * Flatten a gate script into everything it actually runs.
 *
 * A DELIBERATE SECOND COPY of `tools/lib/npm-chain.mjs`, and the duplication is the point: that file
 * is canon's, this file is SHIPPED, and a kit item may not import from the repo it came from — a
 * project's gate must never depend on a sibling repo being checked out at a known path. Two copies
 * of eight lines is the cost of that rule; `check-kit-drift` reconciles this file's bytes, so they
 * cannot drift apart unnoticed.
 *
 * WHY IT IS HERE AT ALL. Found 2026-09-09 writing this repo's own CLAUDE.md: the `check:` resolver
 * read only the gate script's own text, so a two-level gate — `check` → `check:filing` →
 * `node tools/check-filing.mjs` — was invisible to it, and every `@enforced check:` tag in such a
 * project resolved to "no such control". `check-tier0.mjs` has followed chains since it was written,
 * for exactly this reason, and the discipline never reached the tool that decides whether an
 * enforcement CLAIM is true. A resolver that under-resolves does not merely miss a control: it turns
 * a true claim into a reported lie, and the fix an author reaches for is to delete the tag.
 */
function expandScript(scripts, name, seen = new Set()) {
  if (!scripts?.[name] || seen.has(name)) return ""
  seen.add(name)
  const body = scripts[name]
  let out = body
  for (const m of body.matchAll(/npm run ([\w:.-]+)/g)) out += " " + expandScript(scripts, m[1], seen)
  return out
}

/**
 * M-REGISTER DEPTH — how many rules are still owed a mechanism.
 *
 * M-KIT-04, closed by building. `claude-md-ratio` printed `M-register depth — N open` and
 * `check-claude-md` did not, because it reads the register only to resolve pointers — so retiring
 * the old tool retired the estate's only depth measurement, and `0-GREENFIELD` phase 4 has been
 * asking for a number nothing could produce since 2026-09-08.
 *
 * CLOSURE IS POSITIONAL, NOT VOCABULARY. `CLAUDE-MD-STANDARD` §12 settles this and the reason is
 * measured: an estate that marks closure with words grows a set of them, and one project's register
 * reached 102 headings with 34 entries appended BELOW its own closed heading, so its documented
 * count returned 102 against roughly 66 open. Position cannot be appended past by accident — an
 * entry is open if it sits above the closed heading, and that is the whole rule.
 *
 * A REGISTER WITH NO CLOSED HEADING IS NOT AN ERROR. It is a register nothing has left yet, which is
 * every register on its first day. Depth is the total, `closed` is zero, and the caller is told the
 * heading was absent rather than left to infer it — a distinction that matters the first time an
 * entry is closed and the number moves for a reason that is not work.
 */
/**
 * M-KIT-09 · CLOSURE BY ASSERTION — a `**Status:**` field, with the vocabulary closed IN HERE.
 *
 * Two mechanisms were in use across the estate and both failed. Measured 2026-09-09 against the
 * largest register, which runs both:
 *
 *   106 entries / 2474 lines
 *   heading tokens:  BUILT x26 · POINTER x5 · bare BUILT x3 · REJECTED x1 · RULED x1 · FIXED x1
 *                    · PARTIAL x1                                            (7 forms, not 3)
 *   positional:      68 above the closed heading, 38 below; of those 38, FIVE carry any closed
 *                    token  =>  33 entries silently filed as closed that are not
 *
 * VOCABULARY DRIFTS — seven forms, and two of them are neither open nor closed. POSITION IS
 * SILENTLY WRONG — append is the default motion, a section boundary 900 lines up is invisible at
 * the moment of writing, and the end of the file happens to be inside the closed section. Position
 * works at 6 and 11 entries because a person can see the whole file; it stopped working before 106.
 *
 * An assertion cannot drift like vocabulary, because the set is closed in code. It cannot be
 * silently wrong like position, because this reconciles it. And it is visible where it is written,
 * because it is part of the entry being typed.
 *
 * WHY FOUR STATES, AND WHY THE LINE IS DRAWN HERE. Not "how it ended" but WHETHER THE ENTRY NOW
 * ASSERTS SOMETHING THE TREE COULD CONTRADICT:
 *
 *   open              work is owed; carries its own `Satisfied when:`      not falsifiable
 *   built <date>      a control exists                                     YES — the only one
 *   closed <date>     a decision was made, no control added                no; reason mandatory
 *   pointer -> M-NNN  never a work item, an alias kept so the id resolves  structural
 *
 * `ruled`, `rejected`, `won't-build` and `closed by measurement` all collapse into `closed`,
 * because they make the same claim: NO MECHANISM WAS ADDED. Nothing is lost — the mandatory reason
 * carries it better, since "closed by measurement, 2026-08-19" as a TOKEN discards the measurement
 * while as a REASON it can carry the number. The collapse is what makes `built` worth having as
 * its own value.
 *
 * THE FIELD IS SPLIT IN TWO ON PURPOSE. Seven forms happened because one field carried two facts:
 * does this still owe work, and why it stopped owing. STATE is the closed enum below. DISPOSITION
 * is prose this only requires to be NON-EMPTY. Enumerate the union of both and the set grows again
 * the first time someone closes an entry for a novel reason.
 *
 * `PARTIAL` IS REFUSED, on the estate's own doctrine: coverage boundaries split the rule, never
 * qualify the tag. A half-built entry is two entries — the built half naming its control, the
 * unbuilt half carrying its own `Satisfied when:`. Measured: 3 of 132 entries estate-wide are in a
 * partial state, and rarity supports the refusal rather than contradicting it. If it were
 * load-bearing it would be common; it is rare because splitting is usually right.
 *
 * COVERAGE IS A RATCHET, NOT A CLIFF. A register adopting this has every entry unmarked on day one,
 * and a check that fails 106 times on adoption is the wall people learn to ignore (L-70). So a
 * MALFORMED status is always a finding — that costs nothing and catches the defect immediately —
 * while a MISSING one is counted, and the count may only rise. Same shape as the marker ratio one
 * file over.
 *
 * THE SET CARRIES ITS OWN REFUTATION TEST, stated before it ships: over the month after adoption,
 * the first closure that does not fit should be absorbable as a new REASON under an existing state.
 * If someone reaches for a new TOKEN, the split is in the wrong place — and that is a refutation to
 * act on, not a workaround to tolerate.
 */
const STATES = ["open", "built", "closed", "pointer"]
const DATED = new Set(["built", "closed"])
// Matched against the line with its trailing whitespace already gone, so the value can start at
// its first non-space and run to the end with nothing left to backtrack over. v15's `(.+?)\s*$`
// overlapped at every trailing space (sonarjs/super-linear-regex, found through pleks's lint).
// The value is OPTIONAL so an empty status is a finding. v15 flagged `**Status:** ` and skipped
// `**Status:**`, one trailing space apart — an accident of the old pattern, not a rule.
const STATUS_LINE = /^\s*(?:[-*]\s*)?\*\*Status:\*\*\s*(\S.*)?$/

/** Split a register into entries: id, and the lines between its heading and the next. */
export function registerEntries(text, headingSource) {
  const lines = text.split("\n")
  const re = new RegExp(headingSource, "gm")
  const marks = []
  lines.forEach((l, i) => {
    re.lastIndex = 0
    const m = re.exec(l)
    if (m) marks.push({ id: m[1], line: i })
  })
  return marks.map((m, k) => ({
    id: m.id,
    line: m.line + 1,
    body: lines.slice(m.line + 1, k + 1 < marks.length ? marks[k + 1].line : lines.length),
  }))
}

/**
 * Validate every `Status:` present. Missing ones are COUNTED, never failed — see the ratchet note.
 * `ids` is every id in the register, so a pointer's target can be resolved.
 */
export function registerStatus(entries, ids) {
  const findings = []
  const known = new Set(ids)
  let marked = 0
  const state = {}
  for (const e of entries) {
    const hit = e.body.map((l, i) => [l.trimEnd().match(STATUS_LINE), i]).find(([m]) => m)
    if (!hit) continue
    marked++
    const [m, off] = hit
    const at = `${e.id} (line ${e.line + off + 1})`
    const raw = (m[1] ?? "").replace(/\*\*/g, "").trim()
    const word = raw.split(/[\s,.]+/)[0]?.toLowerCase() ?? ""
    if (!STATES.includes(word)) {
      findings.push(
        `${at}: \`${word || raw.slice(0, 24)}\` is not a state. The set is closed in the checker — ` +
          `${STATES.join(" · ")} — and WHY it stopped owing work goes in the reason, not the token.`,
      )
      state[e.id] = null
      continue
    }
    state[e.id] = word
    const rest = raw.slice(word.length).trim()
    if (DATED.has(word)) {
      const date = rest.match(/^\D{0,3}(\d{4}-\d{2}-\d{2})/)
      if (!date) {
        findings.push(`${at}: \`${word}\` must carry the date it became true — \`${word} YYYY-MM-DD\``)
      } else if (word === "closed" && rest.slice(rest.indexOf(date[1]) + 10).replace(/^[\s.,—-]+/, "").length === 0) {
        findings.push(
          `${at}: \`closed\` with no reason. \`closed\` asserts a decision and NO control, so the ` +
            `reason is the only thing carrying why — and it is what the collapsed tokens ` +
            `(ruled, rejected, won't-build, closed by measurement) used to carry badly.`,
        )
      }
    }
    if (word === "pointer") {
      // READ THROUGH THE REGION, never a literal. This line held its own copy of the estate
      // grammar until 2026-09-09 — canon's bytes asserting a spelling the config region exists to
      // own, so a project that configured the grammar had its headings parsed by one form and its
      // pointers by another, inside a single file. Same class as M-KIT-12: an extension point
      // wired somewhere the extended value cannot reach.
      const target = rest.match(POINTER)
      if (!target) findings.push(`${at}: \`pointer\` must name the entry it defers to — \`pointer -> M-NNN\``)
      else if (!known.has(target[0])) findings.push(`${at}: points at ${target[0]}, which is not an entry in this register`)
      else if (target[0] === e.id) findings.push(`${at}: points at itself`)
      if (e.body.some((l) => /\*\*Satisfied when:\*\*/.test(l))) {
        findings.push(
          `${at}: a \`pointer\` carries no \`Satisfied when:\` — it is an alias kept so the id ` +
            `resolves, not a work item. Measured 2026-09-09: all five pointers in the estate's ` +
            `largest register carried one, because the old check called them open and demanded it.`,
        )
      }
    }
  }
  return { findings, marked, total: entries.length, state }
}

/**
 * The two mechanisms, reconciled. This is what retires the closed SECTION: once an entry asserts
 * its own state, the section is a second opinion, and a second opinion that disagrees is the
 * defect — 33 entries in one register sat below a closed heading while asserting nothing.
 *
 * Only entries that ASSERT are reconciled. An unmarked entry has no opinion to disagree with, so
 * the migration can proceed one entry at a time without the check going red in between.
 */
export function reconcileClosure(entries, state, positional) {
  const findings = []
  const closedIds = new Set(positional.closedIds ?? [])
  for (const e of entries) {
    const s = state[e.id]
    if (!s) continue
    const below = closedIds.has(e.id)
    if (s === "open" && below) {
      findings.push(
        `${e.id}: asserts \`open\` and sits BELOW the closed heading. Position and assertion ` +
          `disagree, and the assertion is the one written on purpose — move the entry, or fix it.`,
      )
    } else if ((s === "built" || s === "closed") && !below && positional.hasClosedHeading) {
      findings.push(`${e.id}: asserts \`${s}\` and sits ABOVE the closed heading — it still reads as open work`)
    }
  }
  return findings
}

export function registerDepth(text, headingSource, closedHeading = "## Closed") {
  const lines = text.split("\n")
  const cut = lines.findIndex((l) => l.trim() === closedHeading)
  const re = new RegExp(headingSource, "gm")
  const above = []
  const below = []
  lines.forEach((l, i) => {
    re.lastIndex = 0
    const m = re.exec(l)
    if (!m) return
    const side = cut === -1 || i < cut ? above : below
    side.push(m[1])
  })
  // `closedIds` is what reconcileClosure needs: an entry asserting `open` while sitting below
  // the closed heading is the 33-entry defect, and neither number alone can see it.
  return { open: above.length, closed: below.length, hasClosedHeading: cut !== -1, ids: above, closedIds: below }
}

/**
 * EVERY PROJECT RESOLVER IS ASSERTED BEFORE IT IS TRUSTED (M-KIT-12).
 *
 * A resolver the project supplies is code canon did not write, answering the question canon's
 * whole grammar rests on. So it is not simply called — it is first made to prove it DISCRIMINATES,
 * against two ids the project itself named in the region:
 *
 *   mustResolve     an id this project really does enforce      -> resolver must say true
 *   mustNotResolve  an id nothing enforces                      -> resolver must say false
 *
 * A resolver that blanket-returns true fails the second and cannot be installed. One that silently
 * stops reading its subject — the file renamed, the array emptied — fails the first on the day it
 * happens, rather than quietly waving every marker in that namespace through. That is the failure
 * this matters for: a broken resolver does not error, it AGREES.
 *
 * A resolver that throws is a finding, not a false. `catch { return false }` around the switch
 * would turn a crashing project resolver into "no such control" — sending the author to delete a
 * true claim because someone else's code has a bug (L-81, the under-resolving direction).
 */
export function auditResolvers(resolvers, io) {
  const out = []
  for (const [ns, r] of Object.entries(resolvers ?? {})) {
    if (typeof r?.resolve !== "function") {
      out.push(`resolvers region: \`${ns}\` has no \`resolve\` function — the namespace is named and answers nothing`)
      continue
    }
    if (!r.mustResolve || !r.mustNotResolve) {
      out.push(
        `resolvers region: \`${ns}\` must name \`mustResolve\` and \`mustNotResolve\` — two ids from ` +
          `THIS project, one enforced and one not. Without them nothing can tell a resolver that ` +
          `reads its subject from one that returns true for everything.`,
      )
      continue
    }
    let hit, miss
    try { hit = r.resolve(r.mustResolve, io); miss = r.resolve(r.mustNotResolve, io) }
    catch (e) {
      out.push(`resolvers region: \`${ns}\` threw on its own samples — ${String(e).slice(0, 90)}. A resolver that crashes is a finding, never a false.`)
      continue
    }
    if (!hit) out.push(`resolvers region: \`${ns}\` does not resolve \`${r.mustResolve}\`, which it names as enforced here — the resolver has stopped reading its subject`)
    if (miss) out.push(`resolvers region: \`${ns}\` resolves \`${r.mustNotResolve}\`, which it names as NOT enforced — a resolver that says yes to everything resolves nothing`)
  }
  return out
}

/**
 * M-KIT-14 · DISPROVE AN ENTRY THAT CLAIMS TO BE OPEN.
 *
 * Found 2026-09-09 by asking this register what its own outstanding work was: three of seven
 * entries asserting `open` were already built, and had been for hours, while a checker read the
 * file on every commit. The register was over-reporting its own debt and nothing could see it.
 *
 * `registerStatus` asserts a `Status` is well-formed. `reconcileClosure` asserts it agrees with
 * POSITION. All three entries asserted `open` AND sat above the closed heading — internally
 * consistent, both halves wrong together:
 *
 *   A check that reconciles two claims cannot catch two claims that agree and are both false.
 *
 * M-KIT-09's design named the way out without taking it — `built` is the only state a checker can
 * ever DISPROVE — so this is the other direction: an entry claiming work is owed, beside a
 * mechanism that exists, is debt already paid and still counted. It is the SAFE direction to be
 * wrong in, which is exactly why it survives: nobody chases a number that is too high.
 *
 * ⚠ WHAT IT CAN AND CANNOT REACH, because the gap is the point. It reads the `Satisfied when:`
 * slot and refutes the entry only when that slot names a control THIS resolver can find — through
 * the thing that invokes it, never `existsSync`, the same rule that binds every namespace. So it
 * fires for an entry closed by a script the gate reaches or a hook settings registers, and it is
 * SILENT for one closed by a document migration, a decision, or a change inside an existing file.
 * Canon's own open entries are mostly the second kind; pleks's register uses the slot heavily and
 * is where this earns its keep.
 *
 * An entry with no slot at all is not a finding. The slot is a convention this check rewards, not
 * one it imposes — imposing it would fail every register on the day it adopts, which is the wall
 * (L-70). An entry whose slot names a control that does NOT yet exist is the normal, correct state
 * of open debt and must stay silent.
 *
 * ⚠ WHAT IT CANNOT DISTINGUISH, learned on its FIRST LIVE RUN, minutes after adoption. The slot
 * names a control at NAMESPACE granularity, so this can ask only *does that control resolve* —
 * never *does it do this yet*. Canon's M-KIT-15 named `check:apply`, which resolves because the
 * script exists and the gate reaches it, while the case it had to gain did not exist at all: a
 * finding true in form and false in substance, in the one direction this check was built to be
 * SAFE in. The convention that follows, and it belongs in the register's authoring guidance:
 *
 *   A `Satisfied when:` slot names the control that WOULD NOT EXIST until the work is done.
 *   Where the work is a new case inside a control that already runs, the slot describes the
 *   OUTCOME and names no control.
 *
 * That is a convention and not a mechanism, deliberately: a check on it would have to know which
 * cases a control contains, which is this same problem one rung up.
 */
const SATISFIED = /^\s*(?:[-*]\s*)?\*\*Satisfied when:\*\*\s*(\S.*)$/ // on a trimEnd()ed line, as STATUS_LINE
const CONTROL_REF = /\b([a-z]+):([A-Za-z0-9/_.@-]+)/g

export function refuteOpen(entries, state, resolve, knownNamespaces) {
  const out = []
  const ns = new Set(knownNamespaces)
  for (const e of entries) {
    if (state[e.id] !== "open") continue
    const line = e.body.map((l) => l.trimEnd().match(SATISFIED)).find(Boolean)
    if (!line) continue
    for (const m of line[1].matchAll(CONTROL_REF)) {
      if (!ns.has(m[1])) continue
      let verdict
      try { verdict = resolve(m[1], m[2]) } catch { continue }
      if (verdict && verdict !== "unconfigured") {
        out.push(
          `${e.id} (line ${e.line}): asserts \`open\`, and its \`Satisfied when:\` names ` +
            `\`${m[1]}:${m[2]}\`, which RESOLVES. The work is done and the entry is still counting ` +
            `it as owed — close it, or change what the slot claims would close it.`,
        )
      }
    }
  }
  return out
}

/** Audit one markdown file. Returns findings. */
function auditFile(path, text, claims, root = ".", advisory = new Set(), delegated = new Map(), delegatedPointers = new Map()) {
  const out = []
  // FENCED CONTENT IS BLANKED FOR EVERY SCAN, not just the tag regex.
  //
  // Found 2026-09-09 by walking greenfield into phase 1: the shipped CLAUDE_TEMPLATE.md failed the
  // shipped checker on three of its own example rows, and FENCING them — the escape hatch this file
  // documents in its own header, and applies at the TAG scan on the next line — did not silence
  // them, because every line-based check walked the raw text. Three paths through one file, two of
  // them agreeing about what an example is.
  //
  // blankFences preserves the line count, so the numbers in these findings stay true.
  const lines = splitLines(blankFences(text))

  // 1 + 2 — every @enforced resolves, and no control is claimed twice.
  // Scanned over the fence-blanked text (R6): an example tag is a mention, not a claim.
  for (const m of blankFences(text).matchAll(TAG)) {
    const [, ns, rawId, qualifier] = m
    const { id, repo } = splitRepo(rawId)
    const key = repo ? `${ns}:${id}@${repo}` : `${ns}:${id}`
    if (repo) {
      // Counted, named, and NOT resolved. See the TAG comment: this is a declaration, not a check.
      delegated.set(key, repo)
      if (!claims.has(key)) claims.set(key, path)
      continue
    }
    const verdict = controlExists(ns, id, root)
    if (verdict === "unconfigured") {
      out.push(
        `${path}: @enforced ${key} — namespace \`${ns}\` is not one this project resolves. ` +
          `Known: ${KNOWN_NAMESPACES().join(", ")}. This is a config region to fill or a typo, NOT a missing control.`,
      )
    } else if (!verdict) {
      out.push(`${path}: @enforced ${key} — no such control`)
    }
    // `shared` opts out of the single-claim rule deliberately and visibly; everything else
    // still fails, because the common case for a repeated control is a twin.
    if (qualifier === "advisory" && verdict && verdict !== "unconfigured") advisory.add(key)
    if (qualifier !== "shared" && claims.has(key)) out.push(`${path}: ${key} claimed twice (also ${claims.get(key)})`)
    else if (!claims.has(key)) claims.set(key, path)
  }

  // 2b — a tag the parser CANNOT READ is worse than a missing tag. It satisfies check 4's
  // literal `.includes("@enforced")` string test, so the bullet looks tagged; but it registers
  // no claim, so the rule is counted in NEITHER N nor D_enforced and is never resolution-checked.
  // The rule silently exits the audit while reading as enforced to a human.
  // Found 2026-08-18: the id class excluded "@", so `eslint:@typescript-eslint/no-explicit-any`
  // parsed as nothing and a real, verified control vanished from the metric with no complaint.
  // A tag must parse or fail LOUDLY — silence is the one outcome an instrument may not have.
  // Scoped to HTML comments deliberately: a tag ATTEMPT is by definition inside the comment
  // syntax the format uses. Prose may legitimately discuss `@enforced` — several UNENFORCEABLE
  // reasons explain why they are NOT tagged — and flagging that is a false positive that would
  // buy an allowlist, which is how a check stops meaning anything (see lint-rules.md).
  lines.forEach((l, i) => {
    for (const c of l.matchAll(/<!--([\s\S]*?)-->/g)) {
      if (!c[1].includes("@enforced")) continue
      if (!new RegExp(TAG.source).test(c[1]))
        out.push(`${path}:${i + 1}: unparseable @enforced tag (registers no claim) — ${c[1].trim().slice(0, 70)}`)
    }
  })

  // 2c — every M-0NN pointer resolves to a real register entry.
  // These pointers REPLACED the inline sketches, so they now carry the content's only address —
  // and nothing verified them until 2026-08-19. Seventeen were introduced into the always-loaded
  // file in a single pass, unchecked, pointing at a file that was not even in the repo (brief/ is
  // a symlink to OneDrive). A citation that reads as rigorous and resolves to nothing is the exact
  // failure this script exists to catch; the extraction was reintroducing it while removing it
  // elsewhere. Silent when a file has no pointers, so this cannot fire spuriously.
  const pointers = [...new Set([...text.matchAll(new RegExp(POINTER.source, "g"))].map((m) => m[0]))]
  if (pointers.length) {
    const regPath = `${root}/${REGISTER_PATH}`
    if (!existsSync(regPath)) {
      out.push(`${path}: ${pointers.length} M-pointer(s) but ${REGISTER_PATH} does not exist`)
    } else {
      // A pointer must resolve to EXACTLY ONE entry. Resolving to two is not a milder version of
      // resolving to none — it is worse: the reader follows the first heading, which is whichever
      // was written last, and both look authoritative. Eight ids were duplicated this way, because
      // marking an item BUILT added a second `### M-0NN` above the original instead of folding the
      // original into the `<details>` block the new entry already carried for it. The count is
      // therefore the test, not membership.
      const count = {}
      for (const m of readFileSync(regPath, "utf8").matchAll(new RegExp(REGISTER_HEADING.source, "gm"))) count[m[1]] = (count[m[1]] ?? 0) + 1
      for (const p of pointers) {
        // A POINTER INTO ANOTHER REPO'S REGISTER. Same grammar as a delegated marker, same
        // treatment: parsed, named, and DELIBERATELY NOT RESOLVED, because verifying the far side
        // means reading another repo and canon has already refused that for controls.
        //
        // Reported by the yoros session, 2026-09-09, against v13. `M-KIT-13` is an entry in
        // CANON's kit register; yoros cited it by name in §4 and this check fired on a TRUE
        // citation. It is the gap `@repo` closed for markers, one level up: a control enforced by
        // another repo needed a qualifier before it could be stated truthfully, and a pointer into
        // another repo's register needed the same and had none.
        //
        // Both local answers were worse than the finding, which is why the fix is here and not
        // there. A local copy of canon's register is the drift this estate warns about in five
        // places; suppressing the check disarms a real control for one true citation. yoros worked
        // around it by rewording §4 to DESCRIBE the entry instead of addressing it — and paid for
        // that in the row: a reader gets a description where they used to get an address.
        const at = p.indexOf("@")
        if (at > 0) { delegatedPointers.set(p, p.slice(at + 1)); continue }
        if (!count[p]) out.push(`${path}: ${p} resolves to no entry in ${REGISTER_PATH}`)
        else if (count[p] > 1) out.push(`${path}: ${p} resolves to ${count[p]} entries in ${REGISTER_PATH} — an ambiguous pointer sends the reader to whichever heading came first`)
      }
    }
  }

  // 2d — every marker BINDS to a bullet. The inverse of check 4, and the direction this audit
  // lacked until 2026-08-19: it validated marker-less bullets and never bullet-less markers, so a
  // marker floating after a prose paragraph counted toward N while belonging to no rule. Sixteen
  // of them survived the v4.5 restructure in a file this audit reported GREEN.
  //
  // It counts, it does not bind — the instrument's shape did not match the document's, and the
  // mismatch manufactured a pass.
  //
  // SCOPED TO THE RULES SECTIONS, not file-wide. A first pass ran file-wide and reported 61,
  // which was the check being wrong rather than 61 defects: `.claude/rules/*.md` are prose
  // documents where a marker legitimately annotates a PARAGRAPH — there the paragraph IS the
  // rule. The bullets-only grammar belongs to `### Enforced` and `§5`, and this is the exact
  // inverse of check 4, so it takes exactly check 4's scope. Imposing one file's grammar on
  // another's is how a check earns an allowlist.
  const sectionBounds = []
  for (const heading of RULES_SECTIONS) {
    const s = lines.indexOf(heading)
    if (s === -1) continue
    let e = s + 1
    while (e < lines.length && !lines[e].startsWith("## ")) e++
    sectionBounds.push([s, e])
  }
  const inRulesSection = (i) => sectionBounds.some(([s, e]) => i > s && i < e)

  lines.forEach((l, i) => {
    if (!l.includes("**UNENFORCEABLE**")) return
    if (!inRulesSection(i)) return
    if (/^\s*(-|\d+\.)\s+\S/.test(l)) return // the marker is itself on the bullet line
    // Walk back over the bullet's own continuation lines; a blank, heading, fence or rule ends it.
    for (let j = i - 1; j >= 0; j--) {
      const p = lines[j]
      if (p.trim() === "" || /^#{1,6}\s/.test(p) || p.startsWith("```") || p.startsWith("---")) break
      if (/^\s*(-|\d+\.)\s+\S/.test(p)) return
    }
    out.push(`${path}:${i + 1}: UNENFORCEABLE marker binds to no bullet — it is counted in N but belongs to no rule. Make the rule a bullet, or attach the marker to the bullet it describes.`)
  })

  // 3 — every UNENFORCEABLE carries a reason
  lines.forEach((l, i) => {
    if (!l.includes("**UNENFORCEABLE**")) return
    const m = l.match(UNENF)
    if (!m || m[1].trim().length < 10) out.push(`${path}:${i + 1}: @unenforceable with no usable reason`)
  })

  // 4 — inside a rules section, every bullet carries a marker
  for (const heading of RULES_SECTIONS) {
    const start = lines.indexOf(heading)
    if (start === -1) { out.push(`${path}: rules section vanished: "${heading}" — renamed? Its bullets are now unaudited.`); continue }
    for (let i = start + 1; i < lines.length; i++) {
      const l = lines[i]
      if (l.startsWith("## ")) break
      if (!/^\s*(-|\d+\.)\s+\S/.test(l)) continue
      // Extend to the END of the bullet, not a fixed 3-line window. The fixed window silently
      // required a marker within 2 lines of the bullet's first line, which pressured annotators to
      // jam markers INTO the middle of multi-line rule statements. That is exactly how SECURITY
      // RULE 1's exception clause ("a row describing a HUMAN…") got orphaned mid-sentence — the
      // tool's arbitrary limit deformed the document it was measuring. Found and fixed 2026-08-18.
      let block = l
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s*(-|\d+\.)\s+\S/.test(lines[j]) || lines[j].startsWith("## ") || lines[j].startsWith("---")) break
        block += "\n" + lines[j]
      }
      if (!block.includes("@enforced") && !block.includes("**UNENFORCEABLE**"))
        out.push(`${path}:${i + 1}: rule bullet carries no marker — ${l.trim().slice(0, 62)}`)
    }
  }
  return out
}

// ── FIXTURES — written BEFORE the checker. Both directions, per §4.5. ───────────────────────────
const SEC = RULES_SECTIONS[1]
const FIXTURES = [
  // must FAIL
  ["nonexistent control", `${SEC}\n- A rule. <!-- @enforced eslint:pleks/does-not-exist -->\n`, true],
  ["control claimed twice", `${SEC}\n- One. <!-- @enforced hook:bash-gate -->\n- Two. <!-- @enforced hook:bash-gate -->\n`, true],
  // `shared` is the deliberate opt-out — one script enforcing several genuinely different rules.
  ["KNOWN-GOOD: a shared control claimed by two distinct rules", `${SEC}\n- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`, false],
  // …but shared must not become a way to name a control that does not exist.
  ["shared does not excuse a nonexistent control", `${SEC}\n- One. <!-- @enforced check:does-not-exist:shared -->\n`, true],
  ["KNOWN-GOOD: two shared tags on distinct rules", `${SEC}\n- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`, false],
  // R6 mention-fixture — see scripts/check-mention-fixtures.mjs. A tag shown as an EXAMPLE, inside a
  // fenced block, is documentation of the format — not a claim that a control exists. This file is
  // the one most likely to want to document its own syntax, so it is the one most exposed to the
  // class. It fires today; the fixture is what makes that a decision instead of a surprise.
  ["mention-fixture: an example tag in a fenced block is not a claim",
    `${SEC}\n- A real rule. <!-- @enforced hook:bash-gate -->\n\nTo tag a rule, write:\n\n\`\`\`md\n- Your rule. <!-- @enforced check:check-example-only -->\n\`\`\`\n`, false],
  ["unenforceable with no reason", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — \n`, true],
  ["untagged bullet in a rules section", `${SEC}\n- A rule nobody tagged.\n`, true],
  ["near-miss by normalisation", `${SEC}\n- A rule. <!-- @enforced hook:bash_gate -->\n`, true],
  // The bug this pair locks down: the tag is PRESENT (so check 4 is satisfied and the bullet
  // reads as enforced) but UNPARSEABLE (so it registers no claim and vanishes from the metric).
  ["unparseable @enforced tag registers no claim", `${SEC}\n- A rule. <!-- @enforced eslint -->\n`, true],
  ["KNOWN-GOOD: scoped plugin id containing @ parses", `${SEC}\n- A rule. <!-- @enforced eslint:@typescript-eslint/no-explicit-any -->\n`, false],
  ["KNOWN-GOOD: prose discussing @enforced outside a comment", `${SEC}\n- A rule. <!-- @enforced hook:bash-gate -->\n- Loose one.\n  **UNENFORCEABLE** — tagging it \`@enforced\` here would overclaim, so it is not tagged.\n`, false],
  // Regression: a marker BELOW the old 3-line window must still count, so a multi-line rule
  // statement never has to be broken apart to satisfy the checker.
  ["KNOWN-GOOD: marker below the old 3-line window", `${SEC}\n- A rule that runs on\n  several continuation\n  lines before its\n  marker appears.\n  **UNENFORCEABLE** — nothing scans for this; it is a human judgement call.\n`, false],
  ["M-pointer resolving to no register entry", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **${SAMPLE_IDS[2]}**, which does not exist.\n`, true],
  // yoros, 2026-09-09: the SAME id, the SAME absent register entry, and the only difference is the
  // repo qualifier. The pair is the whole claim — without the first line the second proves nothing,
  // because a check that never fires on the unqualified form is not being silenced by the qualifier.
  ["KNOWN-GOOD: the same absent id, QUALIFIED with the repo whose register holds it, is silent",
    `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **${SAMPLE_IDS[2]}@dev-standards**, which lives in canon's register.\n`, false],
  ["KNOWN-GOOD: M-pointer that resolves", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **${SAMPLE_IDS[0]}**, which exists in the register.\n`, false],
  // AMBIGUOUS is a distinct failure from ABSENT, and the one the register actually had: marking an
  // item BUILT added a second `### M-0NN` heading instead of folding the original into the
  // `<details>` block the new entry already carried for it. Eight ids resolved to two entries each.
  ["M-pointer resolving to TWO register entries", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — MECHANISABLE → **${SAMPLE_IDS[1]}**, which appears twice.\n`, true],
  // The inverse of "marker-less bullet": a BULLET-LESS MARKER. The plant is the exact shape that
  // survived the v4.5 restructure sixteen times in a file this audit reported green — a prose
  // paragraph, a blank line, then a marker belonging to nothing.
  ["marker floating after a prose paragraph", `${SEC}\n\nA prose paragraph stating a rule.\n\n**UNENFORCEABLE** — nothing binds this to a bullet.\n`, true],
  ["marker separated from its bullet by a blank line", `${SEC}\n- A rule.\n\n**UNENFORCEABLE** — separated from the bullet above.\n`, true],
  ["KNOWN-GOOD: marker directly under its bullet", `${SEC}\n- A rule.\n  **UNENFORCEABLE** — bound to the bullet above it.\n`, false],
  ["KNOWN-GOOD: marker on the bullet line itself", `${SEC}\n- A rule. **UNENFORCEABLE** — stated inline on the bullet.\n`, false],
  ["renamed rules section", `## SECURITY RULES (unchanged — still apply to any new code)\n- x <!-- @enforced hook:bash-gate -->\n`, true],
  // must PASS — the negative-space half, and the one that catches a never-matching pattern
  ["KNOWN-GOOD: tagged + unenforceable together", `${SEC}\n- Enforced one. <!-- @enforced hook:bash-gate -->\n- Loose one.\n  **UNENFORCEABLE** — nothing scans for this; it is a human judgement call.\n`, false],
  ["KNOWN-GOOD: prose that merely mentions a control id", `${SEC}\n- A rule. <!-- @enforced hook:bash-gate -->\n\nSome prose about eslint:pleks/no-cookie-client-from that is not a tag.\n`, false],
  // A CONFIGURED BUILT-IN is a real control. The first resolver could not see one, so rules genuinely
  // enforced by eslint.config.mjs were forced into the UNENFORCEABLE count — the instrument inflating
  // its own metric. Both directions fixtured, because "resolves anything" is the opposite failure.
  ["KNOWN-GOOD: configured built-in eslint rule resolves", `${SEC}\n- A rule. <!-- @enforced eslint:no-restricted-imports -->\n`, false],
  ["built-in that is NOT configured must still fail", `${SEC}\n- A rule. <!-- @enforced eslint:no-invented-rule-xyz -->\n`, true],
]

if (process.argv.includes("--selftest")) {
  let failed = 0
  // ⚠ FIXTURES ON DISK, RUN THROUGH runAudit() — not strings handed to auditFile().
  // v4.3: "probes cannot travel through the channel the control inspects." The first version of this
  // selftest passed strings straight in, bypassing discovery entirely — so a renamed .claude/rules, a
  // decayed glob, or a loop finding zero files would have left all eight fixtures green. Green and
  // unfailable, in the tool written to prevent exactly that.
  const tmp = mkdtempSync(join(tmpdir(), "claude-md-fixture-"))
  mkdirSync(join(tmp, ".claude", "rules"), { recursive: true })
  // A register with exactly ONE entry, so pointer resolution can be probed in both directions:
  // M-001 must resolve, M-999 must not.
  mkdirSync(join(tmp, "docs"), { recursive: true })
  // M-002 appears TWICE on purpose: the ambiguous-pointer fixture below needs a register that
  // actually holds a duplicate, the way the real one held eight.
  writeFileSync(join(tmp, "docs", "MECHANISABLE.md"),
    `# register\n\n### ${SAMPLE_IDS[0]} — probe entry\n\n### ${SAMPLE_IDS[1]} — ✅ BUILT\n\n### ${SAMPLE_IDS[1]} — the original, never folded in\n`)

  // The CONTROLS the fixtures tag, built in the fixture root rather than borrowed from the real one.
  // Until `root` reached auditFile these resolved against the live repo, so the fixture root did not
  // need them — and the fixtures were measuring the real tree while claiming to measure themselves.
  mkdirSync(join(tmp, ".claude", "hooks"), { recursive: true })
  mkdirSync(join(tmp, "eslint-rules"), { recursive: true })
  mkdirSync(join(tmp, "scripts"), { recursive: true })
  writeFileSync(join(tmp, ".claude", "hooks", "bash-gate.js"), "// fixture hook\n")
  writeFileSync(join(tmp, ".claude", "settings.json"), JSON.stringify({
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$D/.claude/hooks/bash-gate.js"' }] }] },
  }))
  writeFileSync(join(tmp, "eslint-rules", "no-cookie-client-from.mjs"), "export default {}\n")
  writeFileSync(join(tmp, "eslint.config.mjs"),
    'export default [{ rules: { "no-restricted-imports": "error", "@typescript-eslint/no-explicit-any": "error", "pleks/no-cookie-client-from": "error" } }]\n')
  writeFileSync(join(tmp, "package.json"), JSON.stringify({ scripts: { check: "node scripts/check-nothing.mjs" } }))

  for (const [name, body, shouldFire] of FIXTURES) {
    // Every fixture carries BOTH rules sections so the premise-assertion doesn't fire spuriously,
    // except the one fixture specifically testing a vanished section.
    const text = name === "renamed rules section" ? body : `${RULES_SECTIONS[0]}\n\n${body}`
    writeFileSync(join(tmp, "CLAUDE.md"), text)
    writeFileSync(join(tmp, ".claude", "rules", "probe.md"),
      '---\npaths:\n  - "x/**"\n---\n\nNo rules here.\n')
    const found = runAudit(tmp).findings.filter((f) =>
      name === "renamed rules section" ? f.includes("vanished") : !f.includes("vanished"))
    const fired = found.length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} ${shouldFire ? "must fire " : "must pass "} — ${name}${ok ? "" : `\n      got: ${found.join(" | ") || "(nothing)"}`}`)
  }

  // ── LINE ENDINGS: the same bytes, materialised differently ────────────────
  // A CRLF working tree left a trailing `\r` on every heading, so `### Enforced` matched no literal
  // and the checker reported `rules section vanished` twice — a CONTENT check with an undeclared
  // dependency on CHECKOUT. `.gitattributes` (`* text=auto eol=lf`) means no checkout here can
  // produce that state, which made it latent rather than live; latent is still wrong, and the sibling
  // project hit the identical class. The property is equality, not absence: identical content must
  // produce identical findings whichever way the lines end.
  const crlfBody = `${RULES_SECTIONS[0]}\n\n- A rule. <!-- @enforced eslint:pleks/no-cookie-client-from -->\n`
  writeFileSync(join(tmp, "CLAUDE.md"), crlfBody)
  const lfFindings = runAudit(tmp).findings.join("\n")
  writeFileSync(join(tmp, "CLAUDE.md"), crlfBody.replace(/\n/g, "\r\n"))
  const crlfFindings = runAudit(tmp).findings.join("\n")
  const eolOk = lfFindings === crlfFindings
  if (!eolOk) failed++
  console.log(`  ${eolOk ? "✓" : "✗"} EOL        — a CRLF file yields the SAME findings as the LF original`)
  // Assert the fixture is load-bearing: if this body stopped exercising a heading match, the probe
  // above would pass on two empty strings and prove nothing.
  const eolMeaningful = crlfBody.includes(RULES_SECTIONS[0]) && RULES_SECTIONS[0].startsWith("#")
  if (!eolMeaningful) failed++
  console.log(`  ${eolMeaningful ? "✓" : "✗"} EOL        — …and that fixture actually contains a heading to match`)

  // The discovery fixture — the one the old string-based design could not express at all.
  for (const f of readdirSync(join(tmp, ".claude", "rules"))) rmSync(join(tmp, ".claude", "rules", f))
  const globFired = runAudit(tmp).findings.some((f) => f.includes("glob decayed"))
  if (!globFired) failed++
  console.log(`  ${globFired ? "✓" : "✗"} must fire  — rule-file glob decays to zero`)

  // ── the RATIO's own arithmetic ────────────────────────────────────────────
  // D_enforced counted DISTINCT CONTROLS until 2026-08-19 — correct while one control meant one
  // rule, wrong the moment `shared` existed. Tagging three mechanised rules moved 3 OUT of N and
  // added only 1 to D, so two rules vanished from BOTH sides and the binding metric silently
  // under-reported work that had been done. Counting is where this file has now been wrong twice
  // (occurrences-not-bullets, then controls-not-rules), so it is fixtured rather than trusted.
  const countEnfProbe = (t) => splitLines(t).filter((l) => new RegExp(TAG.source).test(l)).length
  const twoShared = `- One. <!-- @enforced hook:bash-gate:shared -->\n- Two. <!-- @enforced hook:bash-gate:shared -->\n`
  const okCount = countEnfProbe(twoShared) === 2
  if (!okCount) failed++
  console.log(`  ${okCount ? "✓" : "✗"} METRIC     — two rules sharing one control count as TWO enforced (got ${countEnfProbe(twoShared)})`)

  const okProse = countEnfProbe("Prose that merely mentions the @enforced convention.\n") === 0
  if (!okProse) failed++
  console.log(`  ${okProse ? "✓" : "✗"} METRIC     — prose mentioning @enforced does not inflate the count`)

  // FENCED EXAMPLES ARE DOCUMENTATION, NOT CLAIMS — and the metric did not know it until
  // 2026-09-08, though the audit had since 2026-08-23 (`blankFences`, R6). Two paths disagreeing
  // about what a rule is IS the defect: measured on a fixture whose true value is `1 of 2`, the
  // raw metric reported `2 of 3` on a fenced example alone. Both directions, because blanking too
  // much is the worse failure — a real tag beside inline backticks must still count.
  const fencedEg = "- **Real.** <!-- @enforced hook:bash-gate -->\n\n```md\n- **Example.** <!-- @enforced hook:bash-gate -->\n- **Doc.** **UNENFORCEABLE** — shown as a format example.\n```\n"
  const okFenceEnf = countEnfProbe(blankFences(fencedEg)) === 1
  if (!okFenceEnf) failed++
  console.log(`  ${okFenceEnf ? "✓" : "✗"} METRIC     — a fenced @enforced EXAMPLE does not inflate D (got ${countEnfProbe(blankFences(fencedEg))}, want 1)`)

  const countUnenfProbe = (t) => splitLines(t).filter((l) => l.includes("**UNENFORCEABLE**")).length
  const okFenceUnenf = countUnenfProbe(blankFences(fencedEg)) === 0
  if (!okFenceUnenf) failed++
  console.log(`  ${okFenceUnenf ? "✓" : "✗"} METRIC     — a fenced UNENFORCEABLE example does not inflate N (got ${countUnenfProbe(blankFences(fencedEg))}, want 0)`)

  // KNOWN-GOOD, and the reason blankFences touches FENCED blocks only: tags are routinely written
  // beside inline-code spans, and blanking those would silence real claims — the opposite failure.
  const inlineTick = "- **Real.** Uses `npm run check`. <!-- @enforced check:check-claude-md -->\n"
  const okInline = countEnfProbe(blankFences(inlineTick)) === 1
  if (!okInline) failed++
  console.log(`  ${okInline ? "✓" : "✗"} METRIC     — KNOWN-GOOD: a tag beside an inline-code span still counts`)

  // FILE-WIDE, NOT SECTION-SCOPED — a section-scoped metric was written and REFUTED before it
  // shipped (2026-09-08). Against pleks it dropped D from 38 to 34 by discarding four tags that
  // resolve to real controls, stated in `## 3 · THE GATES` and `## 8 · SESSION HYGIENE`. This
  // probe is the tombstone: a rule tagged outside RULES_SECTIONS is still an enforced rule.
  const outsideSections = "## 3 · THE GATES\n\nThe pre-push gate runs the suite. <!-- @enforced check:check-claude-md -->\n"
  const okWide = countEnfProbe(blankFences(outsideSections)) === 1
  if (!okWide) failed++
  console.log(`  ${okWide ? "✓" : "✗"} METRIC     — an @enforced rule OUTSIDE the rules sections still counts toward D`)

  // ── the RESOLVER: existence is not enforcement ────────────────────────────
  // `check:` and `hook:` both resolved on existsSync alone, so a script nobody runs and a hook file
  // nothing invokes each resolved as a real control. Fixtures on disk, in a temp root, so the
  // resolver travels its real lookup path rather than being handed a mock.
  {
    const r = mkdtempSync(join(tmpdir(), "resolver-"))
    // BUILT FROM THE CONFIG REGIONS, not from their defaults (M-KIT-06). Hard-coded "scripts" and
    // ".claude/hooks" here meant a project that pointed SCRIPTS_DIR or HOOKS_DIR elsewhere — which
    // the resolvers region exists to invite — failed this known-good for doing what it was told,
    // and the finding named the resolver rather than the fixture.
    mkdirSync(join(r, SCRIPTS_DIR), { recursive: true })
    mkdirSync(join(r, HOOKS_DIR), { recursive: true })
    writeFileSync(join(r, SCRIPTS_DIR, "check-wired.mjs"), "")
    writeFileSync(join(r, SCRIPTS_DIR, "check-orphan.mjs"), "")
    writeFileSync(join(r, HOOKS_DIR, "wired.js"), "")
    writeFileSync(join(r, HOOKS_DIR, "orphan.js"), "")
    writeFileSync(join(r, "package.json"), JSON.stringify({ scripts: { check: `node ${SCRIPTS_DIR}/check-wired.mjs` } }))
    mkdirSync(join(r, dirname(SETTINGS_PATH)), { recursive: true })
    writeFileSync(join(r, SETTINGS_PATH), JSON.stringify({
      hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: 'node "$D/.claude/hooks/wired.js"' }] }] },
    }))
    const RES = [
      ["KNOWN-GOOD: a check script reachable from `npm run check` resolves", "check", "check-wired", true],
      ["a check script that EXISTS but nothing runs does NOT resolve", "check", "check-orphan", false],
      ["a check script that does not exist at all does not resolve", "check", "check-absent", false],
      ["KNOWN-GOOD: a hook registered in settings resolves", "hook", "wired", true],
      ["a hook file that EXISTS but settings never invokes does NOT resolve", "hook", "orphan", false],
      ["a hook id with no file does not resolve", "hook", "absent", false],
    ]
    for (const [name, ns, id, want] of RES) {
      const got = controlExists(ns, id, r)
      const ok = got === want
      if (!ok) failed++
      console.log(`  ${ok ? "✓" : "✗"} RESOLVER   — ${name}${ok ? "" : `\n      got: ${got}`}`)
    }
    rmSync(r, { recursive: true, force: true })
  }

  // ── the RATCHET, in every direction ───────────────────────────────────────
  // It did not exist until 2026-08-19: "N may only fall" was printed, asserted in CLAUDE.md as
  // BINDING, and cited in lint-rules.md as the working example — while nothing keyed on it.
  // A ratchet that cannot fail is the thing this fixture set exists to make impossible.
  const RCASES = [
    ["N above the ceiling is a REGRESSION", 92, { maxN: 91 }, true],
    ["N below the ceiling means the ratchet was not tightened", 90, { maxN: 91 }, true],
    ["KNOWN-GOOD: N exactly at the ceiling", 91, { maxN: 91 }, false],
    ["a missing ceiling file fails rather than passing silently", 91, null, true],
    ["a ceiling with no numeric maxN fails", 91, { maxN: "91" }, true],
  ]
  for (const [name, n, c, shouldFire] of RCASES) {
    const fired = ratchetFindings(n, c, "x.json").length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} RATCHET    — ${name}`)
  }

  // The DENOMINATOR floor. The case that matters is the last one: N falling while D falls with it
  // is a rule being MOVED out of the tagged sections, not mechanised, and the N ceiling alone reads
  // that as progress.
  const DCASES = [
    ["KNOWN-GOOD: N at its ceiling and D at its floor", 91, 120, { maxN: 91, minD: 120 }, false],
    ["D below its floor fires — a rule left the tagged sections", 91, 119, { maxN: 91, minD: 120 }, true],
    ["D above its floor fires — the floor was not raised with the rule", 91, 121, { maxN: 91, minD: 120 }, true],
    ["a ceiling with no minD fires — D is unpinned and N is gameable by relocation", 91, 120, { maxN: 91 }, true],
    // The full defeat, spelled out: cut an UNENFORCEABLE bullet from §5, paste it into §8.
    ["MOVING a rule out (N-1 AND D-1) fires, where the N ceiling alone would have applauded", 90, 119, { maxN: 90, minD: 120 }, true],
  ]
  for (const [name, n, d, c, shouldFire] of DCASES) {
    const fired = ratchetFindings(n, c, "x.json", d).length > 0
    const ok = fired === shouldFire
    if (!ok) failed++
    console.log(`  ${ok ? "✓" : "✗"} RATCHET-D  — ${name}`)
  }

  // ── M-KIT-09 · closure by assertion, both directions ───────────────────────────────────────
  // Built from SAMPLE_IDS, not from literals (M-KIT-06): a project that configures its register
  // grammar must not fail the probes that verify the file the region belongs to.
  {
    const H = REGISTER_HEADING.source
    const [S0, S1, S2] = SAMPLE_IDS
    const reg = (...bodies) =>
      "# Reg\n\n" + bodies.map((b, i) => `### ${[S0, S1, S2][i]} \u00b7 e${i}\n\n${b}\n`).join("\n")
    const st = (...bodies) => {
      const e = registerEntries(reg(...bodies), H)
      return registerStatus(e, e.map((x) => x.id))
    }

    const statusCases = [
      ["KNOWN-GOOD: an unmarked register is counted, never failed — day one of every adoption",
        st("prose", "prose"), { findings: 0, marked: 0 }],
      ["KNOWN-GOOD: all four states, well-formed, are silent",
        st("- **Status:** open", "- **Status:** built 2026-09-09", "- **Status:** closed 2026-09-09 — measured, no code shape"),
        { findings: 0, marked: 3 }],
      ["a state outside the closed set fires — this is the seven-token drift, caught at the source",
        st("- **Status:** RULED"), { findings: 1, marked: 1 }],
      ["`partial` is refused like any other invented token — split the entry instead",
        st("- **Status:** partial"), { findings: 1, marked: 1 }],
      ["an EMPTY status fires, bare or with trailing space — v15 caught only the second (v16)",
        st("- **Status:**", "- **Status:**   "), { findings: 2, marked: 2 }],
      ["KNOWN-GOOD: a CRLF line reads its state — the value stops before the carriage return",
        st("- **Status:** open\r"), { findings: 0, marked: 1 }],
      ["`built` with no date fires — the date is when the claim became true",
        st("- **Status:** built"), { findings: 1, marked: 1 }],
      ["`closed` with a date and NO REASON fires — the reason is the whole disposition half",
        st("- **Status:** closed 2026-09-09"), { findings: 1, marked: 1 }],
      ["KNOWN-GOOD: `open` needs neither date nor reason",
        st("- **Status:** open"), { findings: 0, marked: 1 }],
      ["a pointer naming nothing fires",
        st("- **Status:** pointer"), { findings: 1, marked: 1 }],
      ["a pointer at an id this register does not carry fires",
        st(`- **Status:** pointer -> ${S2.replace(/\d(?=\D*$)/, "9")}`, "prose"), { findings: 1, marked: 1 }],
      ["a pointer at ITSELF fires",
        st(`- **Status:** pointer -> ${S0}`), { findings: 1, marked: 1 }],
      ["KNOWN-GOOD: a pointer at a real sibling is silent",
        st(`- **Status:** pointer -> ${S1}`, "prose"), { findings: 0, marked: 1 }],
      ["a pointer carrying `Satisfied when:` fires — measured: all five in the estate did",
        st(`- **Status:** pointer -> ${S1}\n- **Satisfied when:** something`, "prose"), { findings: 1, marked: 1 }],
      ["bold or bulleted, the line is the same field",
        st("**Status:** built 2026-09-09"), { findings: 0, marked: 1 }],
    ]
    for (const [why, got, want] of statusCases) {
      const okc = got.findings.length === want.findings && got.marked === want.marked
      if (!okc) failed++
      console.log(`  ${okc ? "\u2713" : "\u2717"} ${okc ? "" : "STATUS "}${why}${okc ? "" : ` \u2014 got ${got.findings.length} finding(s), ${got.marked} marked: ${got.findings[0] ?? ""}`}`)
    }

    // Reconciliation: the 33-entry defect, and the migration state that must NOT fire.
    const mixed = `# Reg\n\n### ${S0} \u00b7 a\n\n- **Status:** open\n\n## Closed\n\n### ${S1} \u00b7 b\n\n- **Status:** open\n`
    const me = registerEntries(mixed, H)
    const ms = registerStatus(me, me.map((x) => x.id))
    const rc = reconcileClosure(me, ms.state, registerDepth(mixed, H))
    const rcOk = rc.length === 1
    if (!rcOk) failed++
    console.log(`  ${rcOk ? "\u2713" : "\u2717"} an entry asserting \`open\` BELOW the closed heading fires \u2014 33 of these were live in one register${rcOk ? "" : ` \u2014 got ${rc.length}`}`)

    const partial = `# Reg\n\n### ${S0} \u00b7 a\n\nunmarked prose\n\n## Closed\n\n### ${S1} \u00b7 b\n\nunmarked prose\n`
    const pe = registerEntries(partial, H)
    const ps = registerStatus(pe, pe.map((x) => x.id))
    const pOk = reconcileClosure(pe, ps.state, registerDepth(partial, H)).length === 0
    if (!pOk) failed++
    console.log(`  ${pOk ? "\u2713" : "\u2717"} KNOWN-GOOD: an UNMARKED entry has no opinion to disagree with \u2014 the migration proceeds one entry at a time`)
  
    // ── the suffixed id, which is a MERGE and not a miss ──────────────────────────────────────
    //
    // 2026-09-09, found from two directions on the same day: the estate's heading grammar was
    // published in four spellings and the normative one lacked `[a-z]?`. `/^### (M-\d{3})/` has no
    // right anchor, so it does not skip `### M-068b` — it captures `M-068`, and the entry is filed
    // under its sibling's id. The register then reports one fewer distinct id than it holds (pleks:
    // 106 headings, 105 ids) and one entry's Status is read as the other's, which is the failure
    // that matters. Probed here rather than in the standard because a document cannot fail.
    //
    // Built from the REGION (M-KIT-06): a project whose grammar does not admit suffixes is SKIPPED
    // by name, never passed — this file's own rule about a check whose subject is absent.
    {
      const base = SAMPLE_IDS[0]
      const sfx = `${base}b`
      const admits = new RegExp(REGISTER_HEADING.source, "m").test(`### ${sfx} · x`)
      if (!admits) {
        console.log(`  ⊘ SKIPPED: this project's configured grammar does not admit a suffixed id (\`${sfx}\`) — the merge cannot occur here`)
      } else {
        const both = `# Reg\n\n### ${base} · a\n\n- **Status:** open\n\n### ${sfx} · b\n\n- **Status:** built 2026-09-09\n`
        const ids = registerEntries(both, REGISTER_HEADING.source).map((x) => x.id)
        const mOk = ids.length === 2 && new Set(ids).size === 2 && ids.includes(sfx)
        if (!mOk) failed++
        console.log(`  ${mOk ? "✓" : "✗"} a suffixed id stays DISTINCT from its sibling — the capture is right-anchored${mOk ? "" : ` — got [${ids.join(", ")}]`}`)
      }
    }
  }



  /* ── M-KIT-13, one level up: a POINTER into another repo's register ───────────────────
   * yoros, 2026-09-09, against v13: `M-KIT-13` is an entry in CANON's kit register. yoros cited
   * it by name in §4 and this check fired on a TRUE citation — `M-KIT-13 resolves to no entry in
   * docs/MECHANISABLE.md`, correctly, because it is not in yoros's register and never will be.
   * Both local answers were worse than the finding: a local copy of canon's register is the drift
   * this estate warns about in five places, and suppressing the check disarms a real control for
   * one true citation. So the pointer takes the same qualifier a delegated MARKER takes, and gets
   * the same treatment — parsed, named, deliberately not resolved. */
  {
    const P = () => new RegExp(POINTER.source, "g")
    const hits = (t) => [...t.matchAll(P())].map((m) => m[0])
    const cases = [
      ["a bare pointer still parses as one — the grammar was widened, not replaced",
        hits("see M-KIT-13 for why"), ["M-KIT-13"]],
      ["a QUALIFIED pointer parses as ONE token, repo included — not as a bare id with trailing text",
        hits("see M-KIT-13@dev-standards for why"), ["M-KIT-13@dev-standards"]],
      ["a 3-digit id qualifies too — the estate's other grammar is not a special case",
        hits("M-068@pleks"), ["M-068@pleks"]],
      ["a suffixed id qualifies — the two extensions compose",
        hits("M-068b@pleks"), ["M-068b@pleks"]],
      ["KNOWN-GOOD: an @ that is not a repo qualifier does not swallow the next word",
        hits("M-KIT-13 @ dev-standards"), ["M-KIT-13"]],
    ]
    for (const [why, got, want] of cases) {
      const okc = got.length === want.length && got.every((g, i) => g === want[i])
      if (!okc) failed++
      console.log(`  ${okc ? "✓" : "✗"} ${okc ? "" : "XREPO "}${why}${okc ? "" : ` — got [${got.join(", ")}], want [${want.join(", ")}]`}`)
    }
    // AND THE SPLIT THE RESOLVER MAKES, which is the half that decides a finding.
    const split = (p) => { const at = p.indexOf("@"); return at > 0 ? { id: p.slice(0, at), repo: p.slice(at + 1) } : { id: p, repo: null } }
    const s1 = split("M-KIT-13@dev-standards"), s2 = split("M-KIT-13")
    const sOk = s1.repo === "dev-standards" && s1.id === "M-KIT-13" && s2.repo === null
    if (!sOk) failed++
    console.log(`  ${sOk ? "✓" : "✗"} a qualified pointer yields its repo and an unqualified one yields null — the finding turns on exactly this${sOk ? "" : ` — got ${JSON.stringify([s1, s2])}`}`)
  }

  // ── the ratio, and the one invariant that makes it a ratchet ─────────────────────────────────
  //
  // yoros, 2026-09-09, against v10. The delegated fix reached the printed line and not the ratchet,
  // so D fell by one per delegation, below its own floor, forcing a reseed to a LOWER floor. These
  // three cases are the arithmetic; the second is the whole claim.
  {
    const cases = [
      ["no delegation — N is the unenforceable count and D the total",
        ratio({ unenforceable: 9, delegated: 0, enforced: 8 }), { n: 9, d: 17 }],
      ["D IS INVARIANT UNDER DELEGATION — moving one marker from @enforced to @enforced ...@repo\n              leaves the denominator alone. This is what stops the ratchet ratcheting DOWN.",
        ratio({ unenforceable: 9, delegated: 1, enforced: 7 }), { n: 10, d: 17 }],
      ["a delegated rule is unenforceable HERE, so it raises N",
        ratio({ unenforceable: 9, delegated: 3, enforced: 5 }), { n: 12, d: 17 }],
    ]
    for (const [why, got, want] of cases) {
      const okc = got.n === want.n && got.d === want.d
      if (!okc) failed++
      console.log(`  ${okc ? "✓" : "✗"} ${okc ? "" : "RATIO "}${why}${okc ? "" : ` — got n=${got.n} d=${got.d}, want n=${want.n} d=${want.d}`}`)
    }
    // THE KNOWN-BAD, run as code rather than described: v10's arithmetic, on the same input.
    const v10 = ({ unenforceable, enforced }) => ({ n: unenforceable, d: unenforceable + enforced })
    const before = v10({ unenforceable: 9, delegated: 1, enforced: 7 })
    const bad = before.d === 16 && before.n === 9
    if (!bad) failed++
    console.log(`  ${bad ? "✓" : "✗"} KNOWN-BAD reproduced: v10's arithmetic gives n=${before.n} d=${before.d} on the same input — D down one, and minD is a FLOOR`)
  }

  // ── M-KIT-14 · refuteOpen, both directions ───────────────────────────────────────────────────
  //
  // The KNOWN-GOODs carry the weight here, because this check's failure mode is the LOUD one:
  // every open entry names controls in its prose, and a version that fires on "closed by
  // check-foo" BEFORE check-foo exists fails the whole register on the day it adopts (L-70).
  // Six of the nine cases below are states that must stay silent.
  {
    const H = REGISTER_HEADING.source
    const [S0, S1] = SAMPLE_IDS
    const reg = (body, second) =>
      `# Reg\n\n### ${S0} · e0\n\n${body}\n` + (second ? `\n### ${S1} · e1\n\n${second}\n` : "")
    // A resolver stub standing in for the live one: `wired` is a control this project has,
    // `absent` one it does not, `half` a namespace configured but resolving nothing.
    const R = (ns, id) =>
      ns === "check" && id === "wired" ? true : ns === "check" && id === "half" ? "unconfigured" : false
    const NS = ["check", "hook"]
    const run = (body, second, resolve = R) => {
      const e = registerEntries(reg(body, second), H)
      const s = registerStatus(e, e.map((x) => x.id))
      return refuteOpen(e, s.state, resolve, NS)
    }

    const openCases = [
      ["debt already paid FIRES — asserts `open`, and its slot names a control that resolves",
        run("- **Status:** open\n- **Satisfied when:** `check:wired` runs in the gate."), 1],
      ["KNOWN-GOOD: `open` whose slot names a control that does NOT resolve — the normal state of debt",
        run("- **Status:** open\n- **Satisfied when:** `check:absent` runs in the gate."), 0],
      ["KNOWN-GOOD: `open` with no `Satisfied when:` line — the slot is rewarded, never imposed",
        run("- **Status:** open\n\nProse mentioning check:wired that is not a slot."), 0],
      ["KNOWN-GOOD: a `built` entry is never refuted — only a claim of work OWED can be disproved here",
        run("- **Status:** built 2026-09-09\n- **Satisfied when:** `check:wired` runs in the gate."), 0],
      ["KNOWN-GOOD: a slot naming an UNCONFIGURED namespace is silent — `unconfigured` is not a yes",
        run("- **Status:** open\n- **Satisfied when:** `check:half` runs in the gate."), 0],
      ["KNOWN-GOOD: a slot in a namespace this project does not know is silent — nothing vouched for it",
        run("- **Status:** open\n- **Satisfied when:** `lint:wired` runs in the gate."), 0],
      ["a resolver that THROWS is skipped, never scored as a refutation",
        run("- **Status:** open\n- **Satisfied when:** `check:wired` runs.", null, () => { throw new Error("boom") }), 0],
      ["two controls in one slot, one resolving — one finding, for the one that resolved",
        run("- **Status:** open\n- **Satisfied when:** `check:wired` and `check:absent` both run."), 1],
      ["KNOWN-GOOD: a second entry's open slot is judged on its own control, not its neighbour's",
        run("- **Status:** built 2026-09-09\n- **Satisfied when:** `check:wired` runs.", "- **Status:** open\n- **Satisfied when:** `check:absent` runs."), 0],
    ]
    for (const [why, got, want] of openCases) {
      const okc = got.length === want
      if (!okc) failed++
      console.log(`  ${okc ? "✓" : "✗"} ${okc ? "" : "REFUTE-OPEN "}${why}${okc ? "" : ` — got ${got.length}, want ${want}: ${got[0] ?? ""}`}`)
    }

    // A finding that cannot be traced to a heading sends the reader to grep a 40-entry register,
    // which is how a true finding gets ignored. It must name the entry AND what refuted it.
    const named = run("- **Status:** open\n- **Satisfied when:** `check:wired` runs.")[0] ?? ""
    const nOk = named.includes(S0) && named.includes("check:wired")
    if (!nOk) failed++
    console.log(`  ${nOk ? "✓" : "✗"} the finding names BOTH the entry and the control that refuted it${nOk ? "" : ` — got: ${named}`}`)
  }

  // ── M-register depth, both directions (M-KIT-04) ───────────────────────────────────────────
  // Positional, per CLAUDE-MD-STANDARD §12, and the KNOWN-GOODs are the ones that matter: a
  // register with nothing closed must read as "all open, nothing has left", not as an error, and a
  // register with no closed heading at all is every register on its first day.
  {
    const H = REGISTER_HEADING.source
    const R = (body) => registerDepth(body, H)
    const [S0, S1, S2] = SAMPLE_IDS
    const three = `# Reg\n\n### ${S0} · a\n\nx\n\n### ${S1} · b\n\ny\n\n### ${S2} · c\n\nz\n`
    const depthCases = [
      ["KNOWN-GOOD: no `## Closed` heading — everything is open and the caller is told why",
        R(three), { open: 3, closed: 0, hasClosedHeading: false }],
      ["KNOWN-GOOD: a closed heading with nothing under it is still 3 open",
        R(`${three}\n## Closed\n`), { open: 3, closed: 0, hasClosedHeading: true }],
      ["an entry BELOW the closed heading is closed, and depth falls",
        R(`# Reg\n\n### ${S0} · a\n\n## Closed\n\n### ${S1} · b\n`), { open: 1, closed: 1, hasClosedHeading: true }],
      ["an entry appended below the heading does NOT come back as open — the pleks failure, where a documented count returned 102 against ~66",
        R(`# Reg\n\n### ${S0} · a\n\n## Closed\n\n### ${S1} · b\n\n### ${S2} · c\n`), { open: 1, closed: 2, hasClosedHeading: true }],
      ["a tombstone at a closed entry's slot is not counted — it is prose, not a heading",
        R(`# Reg\n\n### ${S0} · a\n\n**${S1} is not missing — it is CLOSED.**\n\n## Closed\n\n### ${S1} · b\n`), { open: 1, closed: 1, hasClosedHeading: true }],
      ["an empty register is 0 open, not an error", R("# Reg\n"), { open: 0, closed: 0, hasClosedHeading: false }],
      ["the ids of the open entries come back, so a caller can name them rather than only count",
        { open: R(three).ids.join(","), closed: 0, hasClosedHeading: false }, { open: SAMPLE_IDS.join(","), closed: 0, hasClosedHeading: false }],
    ]
    for (const [label, got, want] of depthCases) {
      const okd = got.open === want.open && got.closed === want.closed && got.hasClosedHeading === want.hasClosedHeading
      if (!okd) failed++
      console.log(`  ${okd ? "✓" : "✗"} ${label}${okd ? "" : ` — got ${JSON.stringify({ open: got.open, closed: got.closed, h: got.hasClosedHeading })}`}`)
    }
  }

  // ── M-KIT-02: an unconfigured namespace is not a missing control ───────────────────────────
  // The two want opposite fixes, so printing the same finding for both sends half the readers to
  // delete a true claim. Probed as a pair, because the distinction is the whole point.
  {
    const mkTmp = () => {
      const d = mkdtempSync(join(tmpdir(), "ns-probe-"))
      // Built from SCRIPTS_DIR rather than a literal: the two copies of this file configure it
      // differently (canon resolves into tools/, a project into scripts/), and a hard-coded fixture
      // passes in one and fails in the other while asserting nothing about either.
      mkdirSync(join(d, SCRIPTS_DIR), { recursive: true })
      writeFileSync(join(d, "package.json"), JSON.stringify({ scripts: { check: "npm run check:x", "check:x": `node ${SCRIPTS_DIR}/real.mjs` } }))
      writeFileSync(join(d, SCRIPTS_DIR, "real.mjs"), "//\n")
      return d
    }
    const d = mkTmp()
    const nsCases = [
      ["KNOWN-GOOD: a configured namespace with a real control resolves", controlExists("check", "real", d), true],
      ["a configured namespace with NO such control is false — a rule to mechanise or demote", controlExists("check", "ghost", d), false],
      ["an UNCONFIGURED namespace is `unconfigured` — a config region to fill, not a missing control", controlExists("npm", "check", d), "unconfigured"],
      ["…and a typo'd namespace lands there too, which is the other half of what it catches", controlExists("hoook", "x", d), "unconfigured"],
    ]
    for (const [label, got, want] of nsCases) {
      const okn = got === want
      if (!okn) failed++
      console.log(`  ${okn ? "✓" : "✗"} ${label}${okn ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
    }
    rmSync(d, { recursive: true, force: true })
  }

  // ── the register region validates itself (M-KIT-06) ────────────────────────────────────────
  // A project configures the grammar and forgets the samples, or the reverse. Before this, that
  // failed two unrelated-looking fixtures; now it fails by name, next to the region that caused it.
  {
    const svCases = [
      ["every SAMPLE_ID is recognised as a pointer by this project's POINTER grammar",
        SAMPLE_IDS.every((id) => new RegExp(POINTER.source).test(id))],
      ["…and `### <id>` is recognised as a heading by this project's REGISTER_HEADING grammar",
        SAMPLE_IDS.every((id) => new RegExp(REGISTER_HEADING.source, "m").test(`### ${id} · x`))],
      ["there are exactly three, in the order the fixtures read them: resolves, duplicated, absent",
        SAMPLE_IDS.length === 3 && new Set(SAMPLE_IDS).size === 3],
    ]
    for (const [label, okv] of svCases) {
      if (!okv) failed++
      console.log(`  ${okv ? "✓" : "✗"} CONFIG     — ${label}`)
    }
  }

  // ── THE EXIT CODE THE GATE READS, one spawn per exit path (L-51; life-therapy CF-2, yoros CF-7) ──
  // Every probe above calls a function in-process, and the main path below — the `process.exit`s
  // the gate actually reads — was on none of their paths: `exit(1)` turned to `exit(0)` on the
  // findings arm left every fixture green. Each spawn runs THIS file with a fixture tree as its cwd,
  // never the real tree, and asserts the line as well as the status, so a crash cannot pass as a
  // verdict. The known-good tree is seeded the way an adopter seeds one, with `--emit-ceiling`.
  //
  // ⚠ THE PROJECT'S OWN RESOLVERS ARE VALIDATED AGAINST THE CWD (see `auditResolvers` at the entry
  // point), so a fixture cwd holding none of their inputs would fail the known-good case in every
  // project that has filled `PROJECT_RESOLVERS` — canon's probe contradicting the region it ships
  // (M-KIT-07). The files those resolvers read from the live tree are recorded and copied in.
  {
    const fx = mkdtempSync(join(tmpdir(), "claude-md-exit-"))
    const reads = new Set()
    const rec = (rel) => { reads.add(rel); return rel }
    auditResolvers(PROJECT_RESOLVERS, {
      root: ".",
      read: (rel) => readFileSync(`./${rec(rel)}`, "utf8"),
      exists: (rel) => existsSync(`./${rec(rel)}`),
      json: (rel) => JSON.parse(readFileSync(`./${rec(rel)}`, "utf8")),
    })
    for (const rel of reads) {
      if (!existsSync(rel)) continue
      mkdirSync(dirname(join(fx, rel)), { recursive: true })
      copyFileSync(rel, join(fx, rel))
    }
    const run = (...args) => {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: fx, encoding: "utf8" })
      return { status: r.status, out: `${r.stdout}${r.stderr}` }
    }
    const say = (okx, label, r) => {
      if (!okx) failed++
      console.log(`  ${okx ? "✓" : "✗"} EXIT       — ${label}${okx ? "" : ` (exited ${r.status}: ${r.out.trim().split("\n").slice(-1)[0]})`}`)
    }

    let r = run()
    say(r.status === 1 && r.out.includes("CLAUDE.md does not exist"), "1 — a tree with no CLAUDE.md fails and says nothing was measured", r)

    const clean = RULES_SECTIONS.map((s) =>
      `${s}\n\n- A rule nothing scans for.\n  **UNENFORCEABLE** — a human judgement call; nothing can see it.\n`).join("\n")
    writeFileSync(join(fx, "CLAUDE.md"), clean)
    r = run("--emit-ceiling")
    let seed = null
    try { seed = JSON.parse(r.out) } catch { /* the probe below reports it */ }
    say(r.status === 0 && typeof seed?.maxN === "number", "0 — `--emit-ceiling` prints the seed and nothing else", r)
    mkdirSync(dirname(join(fx, CEILING_PATH)), { recursive: true })
    writeFileSync(join(fx, CEILING_PATH), JSON.stringify(seed ?? {}))

    r = run()
    say(r.status === 0 && r.out.includes("✅ every marker resolves"), "0 — KNOWN-GOOD: a tagged tree at its seeded ceiling passes", r)

    writeFileSync(join(fx, "CLAUDE.md"), `${clean}\n- An untagged rule under the last section.\n`)
    r = run()
    say(r.status === 1 && r.out.includes("finding(s)"), "1 — the same tree with one untagged bullet fails", r)

    rmSync(fx, { recursive: true, force: true })
  }

  console.log(failed === 0
    ? "\n✅ fixtures green — fires, stays quiet, AND notices its own subject going missing"
    : `\n❌ ${failed} fixture(s) wrong`)
  process.exit(failed === 0 ? 0 : 1)
}

// ── Discovery. ⚠ THE SELFTEST RUNS THROUGH THIS TOO, and that is the whole point.
// v4.3: "probes cannot travel through the channel the control inspects — fixtures on disk."
// The first version of this file passed fixture STRINGS straight to auditFile(), bypassing discovery
// entirely — so a renamed .claude/rules, a decayed glob, or a loop finding zero files would have left
// all eight fixtures green. Green and unfailable, in the tool written to prevent exactly that.
// ⚠ AND `root` MUST REACH auditFile(). It did not: both calls below took the default `"."`, so
// every fixture's control resolution and M-pointer lookup ran against the REAL repo instead of the
// fixture root. The fixtures passed for the wrong reason — "M-001 resolves, M-999 does not" was
// true of the live register whatever the fixture wrote — and the first fixture that needed the
// fixture register to DIFFER from the real one (an id appearing twice) silently reported nothing.
// Fixtures on disk, travelling the real discovery path, and STILL blind, because the path was
// travelled against the wrong tree.
function runAudit(root) {
  const skipped = []
  const claims = new Map()
  // A PROJECT WITHOUT A CLAUDE.md IS A FINDING, NOT A CRASH. Found 2026-09-09 by the first
  // end-to-end greenfield walk: this file is installed at phase 1.2 and CLAUDE.md is written in
  // phase 1, so between the two it threw ENOENT with a node stack trace. A checker that dies on the
  // ordinary early state of the thing it checks is one a project removes from its gate on day one,
  // and it takes the check with it.
  if (!existsSync(`${root}/CLAUDE.md`)) {
    return { findings: [`${root}/CLAUDE.md does not exist — every rule this audits lives there, so NOTHING was measured. Write it (kit/CLAUDE_TEMPLATE.md) before wiring this into the gate.`], claims, absent: true }
  }
  const advisory = new Set()
  const delegated = new Map()
  const delegatedPointers = new Map()
  // ⚠ auditResolvers IS NOT CALLED HERE. It validates the project's resolvers against the LIVE
  // tree, once, at the entry point below — see the note there. Calling it with `root` bound to a
  // fixture made every resolver worth writing fail 12 known-good fixtures.
  const findings = []
  findings.push(...auditFile("CLAUDE.md", readFileSync(`${root}/CLAUDE.md`, "utf8"), claims, root, advisory, delegated, delegatedPointers))
  const dir = `${root}/.claude/rules`
  // ABSENT and EMPTY are different states and were the same crash. A project with no path-scoped
  // rules at all is a SKIP; a directory that exists and yields nothing is a decayed glob and must
  // FAIL. `readdirSync` on a missing dir threw ENOENT, and a checker that dies on a legitimate
  // project shape is not adoptable — the stack trace reads as a tool bug, not a project state.
  const hasRulesDir = existsSync(dir)
  const files = hasRulesDir ? readdirSync(dir).filter((x) => x.endsWith(".md")) : []
  if (!hasRulesDir) skipped.push(`${dir} is absent — no path-scoped rules to audit`)
  // Non-empty assertion on the enumeration itself — a glob that decays to nothing must FAIL, not pass.
  else if (files.length === 0) findings.push(`${dir}: no rule files found — glob decayed?`)
  for (const f of files) {
    // Rule files have no RULES_SECTIONS headings; only directions 1-3 apply to them.
    findings.push(...auditFile(`.claude/rules/${f}`, readFileSync(`${dir}/${f}`, "utf8"), claims, root, advisory, delegated, delegatedPointers)
      .filter((x) => !x.includes("rules section vanished")))
  }
  return { findings, claims, skipped, advisory, delegated, delegatedPointers }
}

// ── The real audit ───────────────────────────────────────────────────────────────────────────────
/**
 * THE PROJECT'S RESOLVERS ARE VALIDATED AGAINST THE LIVE TREE, ONCE — never against a fixture.
 *
 * v10 called this from inside `runAudit(root)`, with `read`/`json`/`exists` bound to `${root}/…`.
 * Under `--selftest`, `root` is a mkdtemp fixture, and the fixture's `.claude/settings.json` holds
 * only a `hooks` block — so `io.json` returns a real object whose `permissions.ask` is absent, and
 * `mustResolve` cannot be satisfied. Reported by the life-therapy session with the reproduction:
 * add canon's OWN documented example resolver and 12 known-good fixtures go red.
 *
 * Which is M-KIT-06 again, in the file that closed it: canon's own example could not pass canon's
 * own fixtures. A resolver reads a PROJECT file by definition — the grammar demands it resolve
 * through the thing that invokes the control — so every resolver worth writing failed.
 *
 * A `root === "."` guard was the alternative and is worse: it weakens the assertion to "runs
 * sometimes", which is the thing the assertion was built to avoid.
 */
const resolverFindings = auditResolvers(PROJECT_RESOLVERS, {
  root: ".",
  read: (rel) => readFileSync(`./${rel}`, "utf8"),
  exists: (rel) => existsSync(`./${rel}`),
  json: (rel) => JSON.parse(readFileSync(`./${rel}`, "utf8")),
})

const { findings: auditFindings, absent, skipped, advisory, delegated, delegatedPointers } = runAudit(".")
const findings = [...resolverFindings, ...auditFindings]

// The metric reads CLAUDE.md a SECOND time, at module top level, and the guard inside runAudit
// cannot cover it. Exiting here rather than guarding each read is deliberate: with no CLAUDE.md
// there is no ratio to compute, and a ratio printed over an absent document is the false zero this
// repo keeps finding. Exit 1 — a project that wired this check has claimed to have the file.
if (absent) {
  console.error(`
❌ ${findings.length} finding(s):
`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}

// ⚠ THE METRIC IS A RATIO, NOT A COUNT (v4.4 §1). N = rules whose only control is model attention;
// D = all marker-carrying rules. The denominator is an integrity check on the numerator, because a
// bare N falls for three different reasons and only one is progress:
//   D rising, N flat    → the tagging pass working (untagged prose becoming counted rules)
//   N falling, D stable → mechanisation, which is what the ratchet is for
//   N and D falling     → DELETION — may be right, but a different act deserving different attention
// A field migration went D 18 → 21 with N steady at 9; a bare count reads that as noise or regression.
// ⚠ COUNT BULLETS, NOT OCCURRENCES. The first version matched every `**UNENFORCEABLE**` in the text,
// so a reason line that MENTIONS the marker — as lint-rules.md did, discussing the metric by name —
// counted twice and inflated N by one. The binding metric was measuring its own vocabulary.
// Found by the triage pass reconciling 116 reported against 115 real bullets. One line at a time
// is the fix: a line either carries the marker or it does not.
/** The project's rule files, or none. A missing directory is a skip; runAudit reports it. */
const ruleMdFiles = () =>
  existsSync(".claude/rules") ? readdirSync(".claude/rules").filter((x) => x.endsWith(".md")) : []

const countUnenf = (t) => splitLines(t).filter((l) => l.includes("**UNENFORCEABLE**")).length
/**
 * FENCE-BLANKED, FILE-WIDE. Both halves of that are load-bearing and were established by probe.
 *
 * FENCED: a tag or marker shown as an EXAMPLE is documentation of the format, not a claim. The
 * audit has known this since 2026-08-23 (`blankFences`, R6) and the metric did not, so the two
 * disagreed about what a rule is. Fixture with a true value of `1 of 2`: the raw metric reported
 * `2 of 3` on a fenced example alone. Under a falling-only ratchet an inflated N is absorbed into
 * the ceiling and never recovered.
 *
 * FILE-WIDE, and NOT scoped to RULES_SECTIONS — a section-scoped metric was written first and
 * REFUTED before it shipped. Measured against pleks: it dropped D from 38 to 34 by discarding four
 * tags that resolve to real controls, stated in `## 3 · THE GATES` and `## 8 · SESSION HYGIENE`
 * rather than in the two sections check 4 patrols. Those are mechanised rules; hiding them from D
 * would punish the project for enforcement it actually has. The audit's scope answers "where must
 * every bullet carry a marker" and the metric's answers "how much of this document is enforced" —
 * different questions, and only the first is section-shaped.
 */
const N_unenf = countUnenf(blankFences(readFileSync("CLAUDE.md", "utf8")))
  + ruleMdFiles().reduce((n, f) => n + countUnenf(blankFences(readFileSync(`.claude/rules/${f}`, "utf8"))), 0)
/**
 * Count enforced RULES, not distinct controls.
 *
 * This was `claims.size` — correct while one control meant one rule, and WRONG the moment
 * `shared` allowed one script to enforce several. Tagging three genuinely mechanised rules moved
 * three out of N and added one to D_enforced: two rules disappeared from BOTH sides of the ratio,
 * so the binding metric silently stopped counting work that had actually been done.
 *
 * Same class as the earlier bug where this file counted marker OCCURRENCES and a rules file
 * discussing the marker inflated N — count the entity you claim to count (LESSONS L-05).
 */
/**
 * A DELEGATED MARKER IS NOT ENFORCED HERE (M-KIT-13, corrected 2026-09-09).
 *
 * v9's header said a delegated marker "still counts toward the unenforceable ratio". It did not —
 * `TAG` matches the qualified id, so `countEnf` counted it as ENFORCED, while `countUnenf` matches
 * only the literal `**UNENFORCEABLE**`, which such a bullet does not carry. Reported by the yoros
 * session with the measurement: the same file printed `22 of 55 (33 @enforced)` before and after
 * adding `@dev-standards`, where the stated design gives 23 of 55 and 32.
 *
 * It erred toward OVERCLAIMING — `33 @enforced` included a control this tree does not run — which
 * is the one direction this whole grammar exists to prevent. The design was right and the code
 * disagreed with its own comment, which is the failure this repo names most often.
 *
 * The bullet is counted ONCE. A line carrying both a delegated tag and the literal is already
 * counted by `countUnenf`, so it is excluded here to avoid landing on both sides at the same time —
 * the workaround yoros explicitly declined to apply locally, and was right to.
 *
 * ⚠ THIS MOVES THE RATCHET. Every project with delegated markers sees N rise and D fall by that
 * count. It is a reseed, not a regression: run `--emit-ceiling` once and commit the new numbers
 * with this adoption, in the same commit, so the ceiling never disagrees with its own seeding run.
 */
const delegatedOn = (l) => {
  const m = new RegExp(TAG.source).exec(l)
  return Boolean(m && splitRepo(m[2]).repo)
}
const countEnf = (t) => splitLines(t).filter((l) => new RegExp(TAG.source).test(l) && !delegatedOn(l)).length
const countDelegated = (t) =>
  splitLines(t).filter((l) => delegatedOn(l) && !l.includes("**UNENFORCEABLE**")).length
const D_enforced = countEnf(blankFences(readFileSync("CLAUDE.md", "utf8")))
  + ruleMdFiles().reduce((n, f) => n + countEnf(blankFences(readFileSync(`.claude/rules/${f}`, "utf8"))), 0)
const N_delegated = countDelegated(blankFences(readFileSync("CLAUDE.md", "utf8")))
  + ruleMdFiles().reduce((n, f) => n + countDelegated(blankFences(readFileSync(`.claude/rules/${f}`, "utf8"))), 0)
// An --emit run prints ONLY its artefact: a caller redirecting to a file must not find a status
// line above the JSON. The same rule was written into check-lessons and did not travel here — the
// mechanism propagated, the discipline did not (L-63).

/**
 * N IS ONE NUMBER, AND EVERY CONSUMER READS THE SAME ONE.
 *
 * Found 2026-09-09 by the yoros session, against v10 — the version that stopped counting a
 * delegated marker as enforced. That fix reached the PRINTED line and stopped there. The ratchet
 * was still called with `N_unenf`, and `--emit-ceiling` still emitted `N_unenf`, so a delegated
 * rule left `D_enforced` and never arrived in N: it was on NEITHER side of the invariant the
 * ratchet exists to hold. yoros's run printed `23 of 55` directly above `D at its floor (54)`.
 *
 * The consequence is worse than the mismatch. `minD` is a FLOOR and D may only rise, so tagging a
 * rule `@enforced ns:id@repo` dropped D below the floor and demanded a reseed — and the reseeded
 * floor was LOWER. The ratchet ratcheted DOWN, once per delegation, each step green and argued.
 *
 * So the ratio is bound to a single name HERE, above every consumer, rather than being re-derived
 * at each call site. Three call sites agreeing by arithmetic is three chances to disagree, and it
 * took one version to take the first.
 *
 * ⚠ THIS MOVES THE RATCHET in any project holding delegated markers: `maxN` rises by the delegated
 * count and `minD` returns to what it was BEFORE v10 — the pre-v10 floor is restored, not lowered.
 * Reseed with `--emit-ceiling` in the SAME commit as the adoption, and expect minD to go back UP.
 */
const { n: N, d: D } = ratio({ unenforceable: N_unenf, delegated: N_delegated, enforced: D_enforced })

if (!process.argv.some((a) => a.startsWith("--emit")))
console.log(`📑 marker ratio — ${N} of ${D} rules UNENFORCEABLE ` +
            `(${D_enforced} @enforced${N_delegated ? `, ${N_delegated} delegated elsewhere and counted as unenforceable HERE` : ""}).`)

/**
 * THE RATCHET — which until 2026-08-19 did not exist.
 *
 * "N may only fall" was printed on this line and asserted in CLAUDE.md's header as the BINDING
 * metric, and `.claude/rules/lint-rules.md` cited this script as the working example of a
 * shrink-only ratchet. Nothing keyed on it: N was computed, logged, and discarded. Ten new
 * UNENFORCEABLE bullets took N from 91 to 101 with a green build — the enforcement-overclaim
 * class, inside the audit written to make that class unwritable, and cited elsewhere as proof it
 * worked. Found by adversarial review of PR #257.
 *
 * A ceiling in a tracked file is the mechanism. It cannot rot the way a count in a doctrine file
 * does (L-29) because this check compares it against reality on every run — a stale ceiling is a
 * failure, not a silent falsehood.
 *
 * BOTH directions fail, deliberately:
 *   N above the ceiling → a regression. Mechanise it, or raise the ceiling in the SAME commit
 *     with the new rule, which is what "except when a new genuinely-un-mechanisable rule is added,
 *     VISIBLY" means — visible in the diff, argued in the message.
 *   N below the ceiling → the ratchet has not been tightened. Lowering it is part of the
 *     mechanisation's acceptance, exactly as removing a baseline entry is part of a fix's.
 */
// `CEILING_PATH` is declared with the other KIT:CONFIG regions near the top — see the ratchet region.
// SEEDING THE RATCHET, and why the tool does it rather than a human.
//
// Found 2026-09-09 walking greenfield into phase 1: the ratchet refuses to run without a stored
// ceiling, nothing produced one, and no playbook step seeded it — so a project that followed phase 1
// exactly had a red gate on day one with no stated way out. Hand-writing the JSON is the obvious
// fix and the wrong one: the ceiling and the check would then disagree about what N is, which is the
// reconciliation failure this repo names. `check-lessons --emit-baseline` already solved it the
// right way one directory away.
//
// It PRINTS rather than writes. Seeding a ratchet is a deliberate act with a diff, not a side effect
// of running a check:
//
//   node scripts/check-claude-md.mjs --emit-ceiling > scripts/check-claude-md.ceiling.json
if (process.argv.includes("--emit-ceiling")) {
  console.log(JSON.stringify({
    maxN: N,
    minD: D,
    seeded: new Date().toISOString().slice(0, 10),
    note: "N may only fall; D may only rise. Lowering maxN is part of a mechanisation, not a follow-up. minD stops N being lowered by MOVING a rule out of the tagged sections.",
  }, null, 2))
  process.exit(0)
}

const ceiling = existsSync(CEILING_PATH) ? JSON.parse(readFileSync(CEILING_PATH, "utf8")) : null
const ratchet = ratchetFindings(N, ceiling, CEILING_PATH, D)
findings.push(...ratchet)
if (!ratchet.length) console.log(`🔒 ratchet — N at its ceiling (${ceiling.maxN}, may only fall) · D at its floor (${ceiling.minD}, may only rise).`)

// M-KIT-04: the depth phase 4 asks for. Printed beside the ratio because the two answer different
// halves of one question — the ratio is how much of the document is unmechanised, the depth is how
// much of that has a plan. A high ratio with a deep register is a queue; a high ratio with an empty
// one is a shrug.
{
  const reg = `${"."}/${REGISTER_PATH}`
  if (!existsSync(reg)) {
    console.log(`🗒️  M-register — ${REGISTER_PATH} does not exist, so depth is UNMEASURED (not zero)`)
  } else {
    const regText = readFileSync(reg, "utf8")
    const d = registerDepth(regText, REGISTER_HEADING.source)
    const entries = registerEntries(regText, REGISTER_HEADING.source)
    const st = registerStatus(entries, entries.map((e) => e.id))
    findings.push(...st.findings.map((f) => `${REGISTER_PATH}: ${f}`))
    findings.push(...reconcileClosure(entries, st.state, d).map((f) => `${REGISTER_PATH}: ${f}`))
    findings.push(
      ...refuteOpen(entries, st.state, (ns, id) => controlExists(ns, id, "."), KNOWN_NAMESPACES())
        .map((f) => `${REGISTER_PATH}: ${f}`),
    )
    console.log(
      `🗒️  M-register depth — ${d.open} open, ${d.closed} closed` +
        (d.hasClosedHeading ? "" : " (no `## Closed` heading yet — nothing has left)"),
    )
    // COVERAGE IS PRINTED EVERY RUN, MARKED OR NOT. At 0 of N it says the register asserts nothing
    // — the honest reading of a register that has not adopted M-KIT-09 — rather than printing
    // nothing and letting an unmeasured file look like a measured one.
    // ADVISORY IS COUNTED, so the qualifier changes the output and is therefore read. It was
    // parsed and used nowhere until 2026-09-09 — a documented escape that did nothing, which is
    // the "claim nothing reads is decoration" rule holding against this file's own grammar.
    if (delegated && delegated.size) {
      console.log(
        `🔗 delegated controls — ${delegated.size} marker(s) name another repo as the invoker and are ` +
          `NOT verified here: ${[...delegated.entries()].map(([k, r]) => `${k} (${r})`).join(", ")}. ` +
          `They count as unenforceable in this tree, because nothing in this tree checks them.`,
      )
    }
    if (delegatedPointers && delegatedPointers.size) {
      console.log(
        `🔗 delegated register pointers — ${delegatedPointers.size} pointer(s) name an entry in ` +
          `ANOTHER repo's M-register and are NOT resolved here: ` +
          `${[...delegatedPointers.entries()].map(([k, r]) => `${k} (${r})`).join(", ")}. ` +
          `Verifying the far side means reading another repo, which canon already refuses for controls.`,
      )
    }
    if (advisory && advisory.size) {
      console.log(
        `📣 advisory controls — ${advisory.size} resolved control(s) REPORT rather than block: ` +
          `${[...advisory].join(", ")}`,
      )
    }
    console.log(
      `🏷️  M-register closure — ${st.marked} of ${st.total} entr${st.total === 1 ? "y" : "ies"} assert a \`Status\`` +
        (st.marked === 0
          ? " — none yet, so closure here is still positional (M-KIT-09)"
          : st.marked < st.total
            ? ` — ${st.total - st.marked} still positional; the count may only rise`
            : " — every entry asserts its own state"),
    )
  }
}

if (findings.length) {
  // Named before the verdict, pass or fail, and never among the findings: a run that did not
  // measure part of its subject has not passed that part, and it has not failed it either.
  for (const s of skipped) console.log(`  ⊘ not measured — ${s}`)
  console.error(`\n❌ ${findings.length} finding(s):\n`)
  for (const f of findings) console.error(`  ${f}`)
  process.exit(1)
}
console.log("✅ every marker resolves, nothing is claimed twice, every rule bullet is tagged")
