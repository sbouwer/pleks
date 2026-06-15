/**
 * lib/rules/registry.ts — Registered rules for the Pleks autonomous intelligence engine
 *
 * Notes:  Phase 1 rules — 7 implemented rules.
 *         See BUILD_67_RULES_ENGINE.md for the full catalogue and migration path.
 *         legalArchiveRule deferred — already runs as runLegalArchiveStep() in daily cron.
 *         searchworksConnectivityRule deferred — no Searchworx API credentials yet.
 *         rejectedApplicantPurgeRule retired (ADDENDUM_70H F3) — its 90-day declined-applicant PII purge
 *         is now the single comprehensive purge in lib/popia/screeningArtefactPurge.ts (daily cron).
 */
import type { PleksRule } from "./types"

// Application
// (rejected-applicant-purge retired — folded into the single 90-day declined-applicant purge in
//  lib/popia/screeningArtefactPurge.ts, run from the daily cron. ADDENDUM_70H F3.)

// Tenant
import { depositReturnT7Rule } from "./tenant/deposit-return-t7"
import { depositReturnT1Rule } from "./tenant/deposit-return-t1"

// Compliance
import { depositDeadlineBreachRule } from "./compliance/deposit-deadline-breach"
import { ficaExpiryRule }            from "./compliance/fica-expiry"

// Trust
import { trustReconciliationDriftRule } from "./trust/reconciliation-drift"
import { unallocatedReceiptRule }        from "./trust/unallocated-receipt"

// Communication
import { emailBounceAlertRule } from "./communication/email-bounce-alert"

export const RULE_REGISTRY: readonly PleksRule[] = [
  // Tenant — deposit return timeline
  depositReturnT7Rule,
  depositReturnT1Rule,

  // Compliance — deposit breach + FICA
  depositDeadlineBreachRule,
  ficaExpiryRule,

  // Trust — bank feed health
  trustReconciliationDriftRule,
  unallocatedReceiptRule,

  // Communication — email data quality
  emailBounceAlertRule,
] as const
