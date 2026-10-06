/**
 * lib/applications/applicantTodos.ts — the applicant-facing slice of a 14M evaluation: remediation to-dos only.
 *
 * Notes:  A18, Stéan ruling 2026-10-06 (verify-14m row 15): the applicant sees the to-dos ("upload a current
 *         bank statement"), NOT the two-axis ruling. The ruling feeds the agent. So this is the ONLY projection of
 *         an evaluation that leaves the server on the applicant's token. It carries no tier, ratio or amount.
 *         Two exclusions are doctrine, not taste (14M §7.2 and the decision-tree amendment):
 *         - only FIXABLE flags become to-dos. Signals, overrides and the structural affordability flag never do:
 *           "coach the evidence, not the number".
 *         - an integrity case gets NO to-dos at all: a major integrity flag (flag 7 identity mismatch) or any
 *           warning/critical fraud signal (bar the data-hygiene warnings in HYGIENE_SIGNALS). Coaching an integrity issue teaches laundering, and an empty list is
 *           indistinguishable from a clean scan, so nothing tells the applicant which branch they are on.
 *         Pure; unit-tested.
 */
import type { RulingFlag } from "./ruling"

export interface ApplicantTodo { key: string; title: string; action: string }

interface SignalLike { type?: unknown; severity?: unknown }

/** Warning-level signals that are data hygiene, not integrity: the signal's own text says to advise the applicant
 *  (an ID number in a filename), so it must not silence their to-dos. Critical always suppresses. */
const HYGIENE_SIGNALS: ReadonlySet<string> = new Set(["embedded-id-in-filename"])

export function isIntegrityCase(flags: readonly RulingFlag[], fraudSignals: readonly unknown[]): boolean {
  if (flags.some((f) => f.axis === "integrity" && f.severity === "major")) return true
  return fraudSignals.some((s) => {
    const sig = s as SignalLike | null
    if (sig?.severity === "critical") return true
    return sig?.severity === "warning" && !(typeof sig.type === "string" && HYGIENE_SIGNALS.has(sig.type))
  })
}

export function applicantTodos(flags: readonly RulingFlag[] | null, fraudSignals: readonly unknown[] | null): ApplicantTodo[] {
  const fs = flags ?? []
  if (isIntegrityCase(fs, fraudSignals ?? [])) return []
  const seen = new Set<string>()
  const out: ApplicantTodo[] = []
  for (const f of fs) {
    if (f.type !== "fixable" || !f.remediation || seen.has(f.remediation)) continue
    seen.add(f.remediation)
    out.push({ key: f.key, title: f.title, action: f.remediation })
  }
  return out
}
