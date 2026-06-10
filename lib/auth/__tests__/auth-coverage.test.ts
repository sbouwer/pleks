/**
 * lib/auth/__tests__/auth-coverage.test.ts — the systemic cure (ADDENDUM_AUTH_HARDENING §4)
 *
 * Static scan: a security primitive that's DECLARED must be WIRED, or explicitly listed as pending. This turns
 * "found by coincidence" into "fails the build":
 *   • every StepUpAction must have a requireStepUp({ action }) call site, or be in STEP_UP_PENDING
 *   • every SECURITY_NOTIFY event must have a logAuthEvent({ eventType }) emit site, or be in NOTIFY_PENDING
 * It's a RATCHET — wiring a pending value fails the test until you remove it from the pending set, so the debt
 * can only shrink. No DB, no runtime; pure source-text analysis.
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

const read = (f: string) => readFileSync(f, "utf8").replaceAll("\r\n", "\n")  // normalise CRLF for the regexes
const SOURCE = [...collect("app"), ...collect("lib")].map(read).join("\n")
const values = (src: string, re: RegExp) => [...(re.exec(src)?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1])

// Auto-discover the declared sets from source (so a NEW declaration is caught even if this test isn't touched).
const STEP_UP_ACTIONS = values(read("lib/auth/step-up.ts"), /export type StepUpAction =([\s\S]*?)\n\n/)
const SECURITY_NOTIFY = values(read("lib/auth/events.ts"), /SECURITY_NOTIFY = new Set<AuthEventType>\(\[([\s\S]*?)\]\)/)

// Pending values, in two HONEST categories (ADDENDUM_AUTH_HARDENING §4 refinement — keeps the ratchet honest
// instead of a dumping ground):
//   NO_FEATURE — the underlying feature doesn't exist yet; the gate/emit ships WITH the feature. Acceptable
//                indefinitely (e.g. recovery_used: no recovery-code login path; role_switched: no /api/switch-role
//                handler — both have nothing to instrument).
//   UNWIRED    — the feature EXISTS but the gate/emit isn't wired. Real debt — burn it down. (bank_detail_change,
//                team_role_change, passkey_unenroll lived here; now wired + removed.)
// Wiring (or building the feature for) any value still fails the test until it's removed here — debt only shrinks.
const STEP_UP_NO_FEATURE = new Set<string>([])
const STEP_UP_UNWIRED = new Set([
  "deposit_refund_approval", "subscription_change", "tenant_data_deletion",
  "security_settings_change", "totp_unenroll", "bulk_export",
])
const NOTIFY_NO_FEATURE = new Set([
  "recovery_used",    // recovery-code login consumption path isn't built
  "totp_unenrolled",  // no remove-authenticator (TOTP) flow built
])
const NOTIFY_UNWIRED = new Set<string>([])
const STEP_UP_PENDING = new Set([...STEP_UP_NO_FEATURE, ...STEP_UP_UNWIRED])
const NOTIFY_PENDING = new Set([...NOTIFY_NO_FEATURE, ...NOTIFY_UNWIRED])

describe("auth coverage — declarations must not outrun their wiring (ADDENDUM_AUTH_HARDENING §4)", () => {
  it("discovered the declared sets", () => {
    expect(STEP_UP_ACTIONS.length).toBeGreaterThan(0)
    expect(SECURITY_NOTIFY.length).toBeGreaterThan(0)
  })

  describe("every StepUpAction is enforced (or explicitly pending)", () => {
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

  describe("every SECURITY_NOTIFY event is emitted (or explicitly pending)", () => {
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
})
