/**
 * lib/invariants/__tests__/invariant-coverage.test.ts — the invariant-coverage ratchet
 *
 * Generalises the auth §4 coverage test (ADDENDUM_AUTH_HARDENING) across every domain where this session found
 * the SAME bug class — a primitive DECLARED but not maintained: auth (step-up actions / notify events), trust
 * (F-3 dead guard), deposits (F-2 confirm field), recon (F-5 uncomputed discrepancy), POPIA (P-1 strip-set).
 *
 * Rule: every declared enforcement primitive must have a live writer/wirer in the codebase, OR an explicit
 * pending entry. CI fails when one is declared-but-unmaintained. It's a RATCHET — a pending value that becomes
 * wired ALSO fails (forcing removal), so the debt can only shrink. Pure source-text analysis; no DB, no runtime.
 *
 * Two layers:
 *   1. Auto-discovered unions — StepUpAction → a requireStepUp({ action }) call site; SECURITY_NOTIFY → a
 *      logAuthEvent({ eventType }) emit site.
 *   2. Curated INVARIANT_REGISTRY — cross-domain primitives that can't be auto-discovered (a guard that must be
 *      called, a gate field that must be written, a strip-set that must exist). Add an entry when you add a new
 *      enforcement primitive; that forces declaring how it's verified.
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

function collect(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__" || e.name.startsWith(".")) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p)
  }
  return out
}

const read = (f: string) => readFileSync(f, "utf8").replaceAll("\r\n", "\n")
const FILES = [...collect("app"), ...collect("lib")].map((path) => ({ path, content: read(path) }))
const SOURCE = FILES.map((f) => f.content).join("\n")
const values = (src: string, re: RegExp) => [...(re.exec(src)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1])

// ── Layer 1: auto-discovered auth unions ──────────────────────────────────────
const STEP_UP_ACTIONS = values(read("lib/auth/step-up.ts"), /export type StepUpAction =([\s\S]*?)\n\n/)
const SECURITY_NOTIFY = values(read("lib/auth/events.ts"), /SECURITY_NOTIFY = new Set<AuthEventType>\(\[([\s\S]*?)\]\)/)

// NO_FEATURE = the feature doesn't exist yet (acceptable indefinitely); UNWIRED = feature exists, gate deferred
// (real debt). Wiring (or building the feature for) any value fails the test until it's removed — debt shrinks.
const STEP_UP_NO_FEATURE = new Set<string>([])
const STEP_UP_UNWIRED = new Set([
  "deposit_refund_approval", "subscription_change", "tenant_data_deletion",
  "security_settings_change", "totp_unenroll", "bulk_export",
])
const NOTIFY_NO_FEATURE = new Set(["recovery_used", "totp_unenrolled"])
const NOTIFY_UNWIRED = new Set<string>([])
const STEP_UP_PENDING = new Set([...STEP_UP_NO_FEATURE, ...STEP_UP_UNWIRED])
const NOTIFY_PENDING = new Set([...NOTIFY_NO_FEATURE, ...NOTIFY_UNWIRED])

// ── Layer 2: curated cross-domain registry ────────────────────────────────────
interface Invariant { domain: string; name: string; wired: () => boolean; pending?: string }

const directTrustInsert = /from\(["']trust_transactions["']\)[\s\S]{0,80}\.insert\(/
const INVARIANT_REGISTRY: Invariant[] = [
  {
    domain: "trust",
    name: "trust writes route through recordTrustTransaction (no direct trust_transactions inserts)",
    wired: () => !FILES.some((f) => !f.path.includes("invariants.ts") && directTrustInsert.test(f.content)),
    pending: "ADDENDUM_FINANCIAL_INTEGRITY F-3 balance: ~11 direct trust_transactions inserts remain; wire the single insert path, then delete this entry",
  },
  {
    domain: "recon",
    name: "balance_discrepancy_cents is computed/written, not just read (F-5)",
    wired: () => SOURCE.includes("recomputeDiscrepancy"),
  },
  {
    domain: "deposits",
    name: "tenant-damage deductions are confirmable in code, gated on a justification (F-2)",
    wired: () => SOURCE.includes("confirmDeductionItem"),
  },
  {
    domain: "popia",
    name: "PII strip-set / retention is maintained (anonymise plan, P-1)",
    wired: () => SOURCE.includes("anonymisePlan") && SOURCE.includes("getRetentionForSubject"),
  },
]

describe("invariant-coverage ratchet — declared enforcement primitives must be maintained", () => {
  it("discovered the auth unions", () => {
    expect(STEP_UP_ACTIONS.length).toBeGreaterThan(0)
    expect(SECURITY_NOTIFY.length).toBeGreaterThan(0)
  })

  describe("StepUpAction → requireStepUp call site (or pending)", () => {
    for (const action of STEP_UP_ACTIONS) {
      it(action, () => {
        const wired = new RegExp(String.raw`action:\s*["']${action}["']`).test(SOURCE)
        if (STEP_UP_PENDING.has(action)) {
          expect(wired, `"${action}" is now wired — remove it from STEP_UP_PENDING`).toBe(false)
        } else {
          expect(wired, `StepUpAction "${action}" has no requireStepUp call site — wire it or add to STEP_UP_PENDING`).toBe(true)
        }
      })
    }
  })

  describe("SECURITY_NOTIFY → logAuthEvent emit site (or pending)", () => {
    for (const ev of SECURITY_NOTIFY) {
      it(ev, () => {
        const wired = new RegExp(String.raw`eventType:\s*["']${ev}["']`).test(SOURCE)
        if (NOTIFY_PENDING.has(ev)) {
          expect(wired, `"${ev}" is now emitted — remove it from NOTIFY_PENDING`).toBe(false)
        } else {
          expect(wired, `SECURITY_NOTIFY event "${ev}" is never emitted — add a logAuthEvent emit site or add to NOTIFY_PENDING`).toBe(true)
        }
      })
    }
  })

  describe("cross-domain enforcement primitives have a live writer (or pending)", () => {
    for (const inv of INVARIANT_REGISTRY) {
      it(`${inv.domain}: ${inv.name}`, () => {
        const wired = inv.wired()
        if (inv.pending) {
          expect(wired, `"${inv.name}" is now wired — remove its pending entry from INVARIANT_REGISTRY`).toBe(false)
        } else {
          expect(wired, `"${inv.name}" has no live writer/wirer — wire it or add a pending reason`).toBe(true)
        }
      })
    }
  })
})
