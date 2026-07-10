/**
 * eslint-rules/no-raw-process-env.mjs — process.env is read in exactly one place: lib/env.ts
 *
 * A raw `process.env.X` read discovers a missing or mis-scoped variable at USE TIME, deep in a request —
 * the mechanics of the June 4–10 outage. lib/env.ts makes absence a named error at the boundary
 * (`requireEnv`) and a health signal before the request (`assertRequiredEnv`), and gives NEXT_PUBLIC_* vars
 * one canonical default each instead of the five-way drift the audit found on APP_URL.
 *
 * Three exemptions, and only three:
 *   1. lib/env.ts — the implementation.
 *   2. A hardcoded ALLOWLIST of build/instrumentation entry points (next.config, sentry.*.config,
 *      instrumentation.ts). These run OUTSIDE the app runtime, before lib/env.ts is meaningfully loaded,
 *      and are the framework's own env contract — routing them through the centre buys nothing and risks
 *      an init-order cycle.
 *   3. A per-file BASELINE (no-raw-process-env.baseline.json) of the ~150 pre-existing sites, burning down.
 *      Baselines only SHRINK — remove a file as you migrate it; a NEW read in an un-baselined file fails
 *      immediately.
 *
 * A centre without a lint rule is a suggestion; with one, it's an invariant.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const BASELINE = new Set(JSON.parse(readFileSync(join(here, "no-raw-process-env.baseline.json"), "utf8")))

/** Build/instrumentation entry points that legitimately read raw env. Repo-root relative, forward-slashed. */
const ALLOWLIST = new Set([
  "lib/env.ts",
  "next.config.ts",
  "instrumentation.ts",
  "sentry.client.config.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
])

const CWD = process.cwd().replaceAll("\\", "/").replace(/\/$/, "") + "/"
function relPath(context) {
  const file = (context.filename ?? context.getFilename?.() ?? "").replaceAll("\\", "/")
  return file.startsWith(CWD) ? file.slice(CWD.length) : file
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "process.env is read only in lib/env.ts — import a typed accessor, or requireEnv()." },
    messages: {
      rawEnv:
        "Read this through @/lib/env, not process.env directly. Public vars are named exports (APP_URL, SUPABASE_URL, …); server secrets go through requireEnv(name) (throws a named error if unset) or optionalEnv(name, fallback). A raw read is discovered at use-time, deep in a request — the June-outage class.",
    },
    schema: [],
  },
  create(context) {
    const file = relPath(context)
    if (ALLOWLIST.has(file) || BASELINE.has(file)) return {}
    if (file.includes("/eslint-rules/")) return {}
    // Tests stub process.env deliberately (vi.stubEnv, setup harnesses) — that is the correct place to
    // read it raw, and routing a test through requireEnv would just fight the stub.
    if (/\.(test|dbtest)\.tsx?$/.test(file) || file.startsWith("test/") || file.includes("/__tests__/")) return {}

    return {
      // Any `process.env` member access — `process.env.X`, `process.env[name]`, or bare `process.env`.
      "MemberExpression[property.name='env']"(node) {
        if (node.object?.type === "Identifier" && node.object.name === "process") {
          context.report({ node, messageId: "rawEnv" })
        }
      },
    }
  },
}

export default rule
