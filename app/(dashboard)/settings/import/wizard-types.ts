/**
 * app/(dashboard)/settings/import/wizard-types.ts — the shapes the import wizard's steps pass between them
 *
 * Data:   populated by the client wizard in ./page.tsx from a parsed upload and, for results, from
 *         lib/import/importRunner. This module declares shapes only and reads nothing itself.
 * Notes:  Lives apart from page.tsx so the five Step components can import these types without
 *         importing the page that renders them — five circular imports that compiled only because
 *         every edge is type-only. The comments below record two real drift incidents and belong to
 *         the declarations, not to the page; they moved with them.
 */
import type { IdentityHold } from "./_components/StepIdentityHolds"
import type { ColumnSuggestion } from "@/lib/import/columnMapper"
import type { WizardDecisions } from "@/lib/import/decisions"

export interface AnalysisResult {
  detectedEntities: { hasTenant: boolean; hasUnit: boolean; hasLease: boolean }
  rowCounts: { tenant: number; unit: number; lease: number }
  isTpnFormat: boolean
  columnSuggestions: ColumnSuggestion[]
  unmappedColumns: string[]
  filename: string
}

/**
 * The wizard's decision state — and, deliberately, the SAME type that goes on the wire and is translated for
 * the runner (`lib/import/decisions.ts`). It used to be an independent interface declared right here, which is
 * how the wizard and the runner drifted into two `ImportDecisions` shapes sharing only `columnMapping`: the
 * runner read `expiredLeases`/`skipRows`/`conflicts`, none of which the wizard has ever sent, so "skip expired
 * leases" — the default, printed on the confirm screen — silently did nothing. Deriving it from the one wire
 * contract means the next field cannot go missing in transit.
 */
export type ImportDecisions = Required<WizardDecisions>

export interface ImportResultData {
  /** Rows the importer would not guess about. They did NOT import; the agent answers, and we re-run. */
  identityHolds?: IdentityHold[]
  created: {
    tenants: number
    units: number
    leases: number
    contractors?: number
    landlords?: number
    agentInvites?: number
    bankAccounts?: number
  }
  skipped: number
  /** Mirrors lib/import/importRunner's ImportError. It used to be typed loosely as `{ row?, error?, ... }`,
   *  which is why StepSuccess rendered `err.row` — a field the runner never emits — and numbered every message
   *  by its array position instead of its row, while showing a hard refusal and an FYI identically. */
  errors: Array<{
    /** 0-based index into the file's data rows; -1 for file-level (mapping) messages. */
    rowIndex: number
    field: string
    message: string
    severity: "error" | "warning"
  }>
  pendingLandlordLinks?: Array<{ pendingLandlordId: string; name: string; email: string }>
  agentInvites?: Array<{ email: string; role: string }>
}
