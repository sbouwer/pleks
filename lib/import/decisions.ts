/**
 * lib/import/decisions.ts — the WIRE CONTRACT between the import wizard and the import runner
 *
 * Notes:  These two halves have never spoken the same language. The wizard POSTs
 *           { columnMapping, extraColumnRouting, expiredLeaseAction, perRowOverrides }
 *         and `runImport` reads
 *           { conflicts, expiredLeases, skipRows }
 *         — no overlapping key but `columnMapping`. The route passed the object straight through, and because
 *         `await req.json()` is `any`, TypeScript never saw the mismatch. So in production:
 *           - `decisions.expiredLeases` was ALWAYS undefined → the "skip expired leases" branch was dead.
 *             That is the wizard's DEFAULT and recommended option, and Step4Confirm prints "Expired leases
 *             will be skipped" on the confirmation screen — while every expired lease was imported.
 *           - `decisions.skipRows` was ALWAYS [] → the per-row overrides the agent set in Step 3 were discarded.
 *           - `decisions.conflicts` was ALWAYS [] → every co-tenant/previous/duplicate resolution was inert.
 *         A silent no-op on an explicit, UI-confirmed decision is worse than an error: the agent is told the
 *         thing happened.
 *
 *         This module is the single place the two shapes meet. The runner keeps its own vocabulary (it is not
 *         a UI), the wizard keeps its own (it is not a database), and the translation is explicit, typed and
 *         tested. Translation happens SERVER-SIDE: the wire is client-controlled, so it is parsed defensively
 *         (unknown values fall back to the safe option, never to "import everything").
 */
import type { ColumnMapping, ImportDecisions, ExpiredDecision } from "./importRunner"

/** Exactly what `Step4Confirm` POSTs to /api/import/execute. Mirrors `ImportDecisions` in the wizard's page.tsx. */
export interface WizardDecisions {
  columnMapping?: Record<string, { field: string; entity: string }>
  extraColumnRouting?: Record<string, string>
  /** Step 3's global choice. "skip" is the default AND the recommended option. */
  expiredLeaseAction?: "skip" | "import_as_expired"
  /** Step 3's per-row exceptions, keyed by index into the POSTed `rows`. "active" = "Keep active" (import this
   *  expired-looking lease as a live one anyway). "skip" = drop the row entirely. */
  perRowOverrides?: Record<number, "active" | "skip">
}

/** The wizard's global expired-lease choice → the runner's vocabulary. */
const EXPIRED_ACTION: Record<string, ExpiredDecision> = {
  // "Only active leases imported" — the expired ones become tenancy HISTORY, not leases.
  skip: "import_active_only",
  // "Creates tenant + lease records with status 'expired'."
  import_as_expired: "import_all",
}

/**
 * The wizard sends `{ field, entity }` per column; the runner's `MappedField` also carries `column`. It worked
 * by accident (the runner resolves via the mapping KEY and only falls back to `mapped.column`), but the type
 * was a lie across the wire. Fill it in so it is not.
 */
export function toColumnMapping(wire: WizardDecisions["columnMapping"]): ColumnMapping {
  return Object.fromEntries(
    Object.entries(wire ?? {})
      .filter(([, m]) => m?.field)
      .map(([column, m]) => [column, { column, field: m.field, entity: m.entity ?? "" }]),
  )
}

/**
 * Translate the wizard's decisions into the runner's. Defensive: this is client-supplied JSON, so an unknown
 * or absent `expiredLeaseAction` falls back to `import_active_only` — the wizard's own default, and the SAFE
 * direction. Failing the other way would resurrect dead leases from a migrated book as live ones.
 */
export function toImportDecisions(wire: WizardDecisions | null | undefined): ImportDecisions {
  const action = wire?.expiredLeaseAction
  const expiredLeases: ExpiredDecision =
    (action ? EXPIRED_ACTION[action] : undefined) ?? "import_active_only"

  const skipRows: number[] = []
  const forceActiveRows: number[] = []

  for (const [key, value] of Object.entries(wire?.perRowOverrides ?? {})) {
    const index = Number.parseInt(key, 10)
    if (!Number.isInteger(index) || index < 0) continue
    if (value === "skip") skipRows.push(index)
    else if (value === "active") forceActiveRows.push(index)
  }

  return {
    // No wizard step collects conflict resolutions today, so this is genuinely empty rather than lost in
    // translation. `determineRole` still honours a `tenant_role` column in the file. If a conflicts step is
    // ever built, it wires in HERE — and the runner already understands it.
    conflicts: [],
    expiredLeases,
    skipRows,
    forceActiveRows,
  }
}
