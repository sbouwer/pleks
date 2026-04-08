/**
 * Deterministic clause conflict checker.
 * Pure functions — no DB calls, no async, runs instantly in the browser.
 *
 * Four checks (ADDENDUM_31B):
 *  1. Pets clause vs Annexure C pets rule
 *  2. Parking clause vs unit parking bays (overallocation)
 *  3. Telecommunications clause on sectional title property
 *  4. Alternative utilities clause on sectional title property
 */

import type { AnnexureCRules } from "@/components/leases/LeaseWizard"

export interface ClauseConflict {
  id: string
  clauseKey: string
  title: string
  description: string
  source: "deterministic" | "ai"
  quickFix?: {
    label: string
    type: "disable_clause"
    clauseKey: string
  }
}

/** Patterns that indicate pets are prohibited in the property rules. */
const PETS_PROHIBITED = /\b(no pets|not permitted|not allowed|prohibited|strictly prohibited)\b/i

export function runDeterministicChecks(
  clauseSelections: Record<string, boolean>,
  annexureCRules: AnnexureCRules,
  isSectionalTitle: boolean,
  parkingBays: number,
): ClauseConflict[] {
  const conflicts: ClauseConflict[] = []

  // ── 1. Pets clause vs Annexure C pets rule ──────────────────────────────────
  if (clauseSelections.pets === true && PETS_PROHIBITED.test(annexureCRules.pets)) {
    conflicts.push({
      id: "pets_rule_conflict",
      clauseKey: "pets",
      source: "deterministic",
      title: "Pets clause conflicts with property rules",
      description: `Annexure C states: "${annexureCRules.pets}" — this prohibits pets, but the Pets clause is enabled. Either amend the Annexure C pets rule in Step 6 to allow pets, or disable the clause.`,
      quickFix: { label: "Disable pets clause", type: "disable_clause", clauseKey: "pets" },
    })
  }

  // ── 2. Parking clause vs unit parking bays ──────────────────────────────────
  if (clauseSelections.parking === true && parkingBays === 0) {
    conflicts.push({
      id: "parking_overallocation",
      clauseKey: "parking",
      source: "deterministic",
      title: "Parking clause — unit has no parking bays",
      description: "The Parking clause is enabled but this unit has 0 parking bays. The clause creates an obligation the Landlord cannot fulfil. Update the unit's parking bay count, add a bay in Annexure D (Step 6), or disable the clause.",
      quickFix: { label: "Disable parking clause", type: "disable_clause", clauseKey: "parking" },
    })
  }

  // ── 3. Telecommunications on sectional title ────────────────────────────────
  if (isSectionalTitle && clauseSelections.telecommunications === true) {
    conflicts.push({
      id: "telecom_sectional_title",
      clauseKey: "telecommunications",
      source: "deterministic",
      title: "Telecom clause requires BC approval (sectional title)",
      description: "Installing fibre, satellite dishes, or telecom infrastructure in a sectional title scheme requires Body Corporate consent under the STSMA. The Telecommunications clause may create an obligation the Landlord cannot fulfil without prior BC approval.",
      quickFix: { label: "Disable telecommunications clause", type: "disable_clause", clauseKey: "telecommunications" },
    })
  }

  // ── 4. Alternative utilities on sectional title ─────────────────────────────
  if (isSectionalTitle && clauseSelections.utilities_alternative === true) {
    conflicts.push({
      id: "utilities_sectional_title",
      clauseKey: "utilities_alternative",
      source: "deterministic",
      title: "Alternative utilities clause requires BC approval (sectional title)",
      description: "Solar panels, boreholes, and rainwater harvesting installations in a sectional title scheme require Body Corporate approval under the STSMA. This clause may conflict with BC conduct rules.",
      quickFix: { label: "Disable alternative utilities clause", type: "disable_clause", clauseKey: "utilities_alternative" },
    })
  }

  return conflicts
}

/** Returns true when the AI check should fire:
 *  at least one optional clause is enabled AND at least one Annexure C rule has been customised. */
export function shouldRunAiCheck(
  clauseSelections: Record<string, boolean>,
  annexureCRules: AnnexureCRules,
  defaultAnnexureCRules: AnnexureCRules,
): boolean {
  const OPTIONAL_KEYS = ["pets", "parking", "telecommunications", "utilities_alternative"]
  const hasOptionalEnabled = OPTIONAL_KEYS.some((k) => clauseSelections[k] === true)
  const hasCustomRule = (Object.keys(annexureCRules) as (keyof AnnexureCRules)[])
    .some((k) => annexureCRules[k] !== defaultAnnexureCRules[k])
  return hasOptionalEnabled && hasCustomRule
}
