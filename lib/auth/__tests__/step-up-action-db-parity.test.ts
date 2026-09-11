/**
 * lib/auth/__tests__/step-up-action-db-parity.test.ts — the TS union and the DB CHECK must agree
 *
 * Notes: `StepUpAction` in lib/auth/step-up.ts has a twin in `step_up_challenges.action`'s CHECK
 *        constraint. Adding a member on one side only makes every challenge insert for that action
 *        fail with 23514 — which is exactly how M-127's fix could have shipped broken, and is the
 *        shape that ate the eight consent_* auth_events types (010 §"auth_events.event_type").
 *        The warning comment at the union said "keep these in step"; this is that comment with
 *        teeth. Both directions: a TS member with no DB value, and a DB value with no TS member.
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const root = resolve(__dirname, "../../..")
const TS_SRC  = readFileSync(resolve(root, "lib/auth/step-up.ts"), "utf8")
const SQL_SRC = readFileSync(resolve(root, "supabase/migrations/010_platform_features.sql"), "utf8")

/** The union members, read from the declaration block only — `| "value"` lines beneath it. */
function tsActions(src: string): string[] {
  const start = src.indexOf("export type StepUpAction =")
  expect(start).toBeGreaterThan(-1)
  // The declaration ends at the first blank line after it; every member sits on its own line.
  const block = src.slice(start).split("\n\n")[0]
  return [...block.matchAll(/\|\s*"([a-z_]+)"/g)].map(m => m[1])
}

/**
 * The LIVE value list: the last `ADD CONSTRAINT step_up_challenges_action_check` in the file.
 * Migrations replay top-to-bottom, so an earlier, wider list is not what the database ends up with
 * — reading anything but the last one would assert against a constraint that no longer exists.
 */
function sqlActions(src: string): string[] {
  const marker = "ADD CONSTRAINT step_up_challenges_action_check"
  const at = src.lastIndexOf(marker)
  expect(at).toBeGreaterThan(-1)
  const tail = src.slice(at)
  const end = tail.indexOf("));")
  expect(end).toBeGreaterThan(-1)
  return [...tail.slice(0, end).matchAll(/'([a-z_]+)'/g)].map(m => m[1])
}

describe("StepUpAction ↔ step_up_challenges.action", () => {
  const ts = tsActions(TS_SRC)
  const sql = sqlActions(SQL_SRC)

  it("reads a non-trivial set from each side", () => {
    // Guards the parse itself: a regex that silently matches nothing would make every
    // set-difference assertion below pass vacuously.
    expect(ts.length).toBeGreaterThan(5)
    expect(sql.length).toBeGreaterThan(5)
  })

  it("has no TS action the database would reject", () => {
    expect(ts.filter(a => !sql.includes(a))).toEqual([])
  })

  it("has no database action the TS union cannot name", () => {
    expect(sql.filter(a => !ts.includes(a))).toEqual([])
  })

  it("carries passkey_enroll on both sides (M-127)", () => {
    expect(ts).toContain("passkey_enroll")
    expect(sql).toContain("passkey_enroll")
  })
})
