#!/usr/bin/env node
/**
 * scripts/ci-partition.mjs — runs one half of `npm run check`, so CI can run the two halves as parallel jobs.
 *
 * Usage:  node scripts/ci-partition.mjs static     the typecheck and lint steps (CI job "Lint & Typecheck")
 *         node scripts/ci-partition.mjs rest       every other step, in chain order (CI job "Checks & unit tests")
 *         node scripts/ci-partition.mjs --selftest probes, both directions
 *
 * WHY: CI ran the whole chain as one serial job, ~5m20s on the hosted runner; typecheck plus uncached lint were
 * ~200s of it (job 113783832236, 2026-10-09). Split, the wall time is the slower half instead of the sum.
 *
 * THE CHAIN STAYS THE SINGLE SOURCE. Both halves are read from package.json's `check` through check-scope's own
 * parser, and STATIC is matched by exact command string. The selftest fails unless the two halves are disjoint,
 * cover every step, and STATIC finds every one of its steps — so a step added to `check` lands in `rest` and runs
 * in CI without anyone editing this file, and a renamed typecheck or lint step fails here instead of vanishing.
 *
 * Steps run through check-scope's `execute`, stopping at the first failure, exactly as `&&` does in the chain.
 */
import { readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"
import { chainCommands, execute } from "./check-scope.mjs"

export const STATIC = ["tsc --noEmit --incremental false", "node scripts/lint.mjs"]

/** Pure: the steps of `chain` that belong to `part`. Throws if the chain no longer holds every STATIC step. */
export function partition(chain, part) {
  const absent = STATIC.filter((s) => !chain.includes(s))
  if (absent.length) throw new Error(`ci-partition: \`check\` no longer contains ${absent.join(" | ")} — update STATIC`)
  if (part === "static") return chain.filter((c) => STATIC.includes(c))
  if (part === "rest") return chain.filter((c) => !STATIC.includes(c))
  throw new Error(`ci-partition: unknown part "${part}" (static | rest)`)
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
const chain = () => chainCommands(readFileSync("package.json", "utf8"))

if (invoked && process.argv.includes("--selftest")) {
  let failed = 0
  const ok = (cond, label) => {
    if (!cond) failed++
    console.log(`  ${cond ? "✓" : "✗"} ${label}`)
  }
  const c = chain()
  const s = partition(c, "static")
  const r = partition(c, "rest")
  ok(s.length === STATIC.length, "every STATIC step is in `check`")
  ok(s.length + r.length === c.length && [...s, ...r].every((x) => c.includes(x)), "the halves cover the chain exactly")
  ok(!s.some((x) => r.includes(x)), "the halves are disjoint")
  ok(partition([...c, "node scripts/check-new-thing.mjs"], "rest").includes("node scripts/check-new-thing.mjs"), "PLANTED: a new step lands in `rest`")
  let threw = false
  try { partition(c.filter((x) => x !== "node scripts/lint.mjs"), "static") } catch { threw = true }
  ok(threw, "PLANTED: a chain without the lint step throws, never runs a short `static`")
  threw = false
  try { partition(c, "everything") } catch { threw = true }
  ok(threw, "PLANTED: an unknown part throws")
  // The partition proves nothing unless CI runs BOTH halves (walker, .handoff/ci-faster-gates/02-walker.md F2).
  const ci = readFileSync(".github/workflows/ci.yml", "utf8")
  const runs = (part) => new RegExp(`^\\s*run:\\s*npm run check:ci -- ${part}\\s*$`, "m")
  ok(runs("static").test(ci) && runs("rest").test(ci), "ci.yml runs both halves (`npm run check:ci -- static` and `-- rest`)")
  ok(!runs("rest").test(ci.replace("npm run check:ci -- rest", "npm run check:ci -- static")), "PLANTED: a ci.yml that drops `rest` is caught")
  console.log(failed ? `\n❌ ${failed} probe(s) wrong` : "\n✅ probes green — the two halves are exactly `check`")
  process.exit(failed ? 1 : 0)
}

if (invoked) {
  const part = process.argv[2]
  const steps = partition(chain(), part)
  console.log(`ci-partition ${part}: ${steps.length} of ${chain().length} steps`)
  const t0 = Date.now()
  const res = execute({ commands: steps }, (cmd) => spawnSync(cmd, { stdio: "inherit", shell: true }).status ?? 1)
  console.log(res.ok ? `ci-partition ${part}: passed in ${((Date.now() - t0) / 1000).toFixed(1)}s` : `ci-partition ${part}: FAILED at: ${res.failed}`)
  process.exit(res.ok ? 0 : 1)
}
