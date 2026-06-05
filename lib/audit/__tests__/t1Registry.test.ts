/**
 * lib/audit/__tests__/t1Registry.test.ts — D-6 registry-completeness guard (no DB)
 *
 * The behavioural harness (Category 14) also checks completeness at runtime, but this catches a
 * missing/ malformed T1 in `npm run check` — a new T1 mutation can't silently skip coverage.
 */
import { describe, it, expect } from "vitest"
import { T1_REGISTRY, T1_CONTRACT_IDS } from "@/lib/audit/t1Registry"

describe("T1 registry", () => {
  it("covers every contract T1 (D-6)", () => {
    const ids = new Set(T1_REGISTRY.map((t) => t.id))
    for (const id of T1_CONTRACT_IDS) {
      expect(ids.has(id), `T1 "${id}" is in the contract but missing from the registry`).toBe(true)
    }
  })

  it("has no duplicate ids", () => {
    const ids = T1_REGISTRY.map((t) => t.id)
    expect(new Set(ids).size, "duplicate T1 id in registry").toBe(ids.length)
  })

  it("behavioural entries expose invoke(); pending entries explain why", () => {
    for (const t of T1_REGISTRY) {
      if (t.status === "behavioural") {
        expect(typeof t.invoke, `behavioural T1 "${t.id}" must expose invoke()`).toBe("function")
      } else {
        expect(t.reason, `pending T1 "${t.id}" must carry a reason (visible debt)`).toBeTruthy()
      }
    }
  })

  it("every entry declares a valid audit action + table", () => {
    for (const t of T1_REGISTRY) {
      expect(["INSERT", "UPDATE", "DELETE"]).toContain(t.expectedAction)
      expect(t.table.length, `T1 "${t.id}" needs a table`).toBeGreaterThan(0)
    }
  })
})
