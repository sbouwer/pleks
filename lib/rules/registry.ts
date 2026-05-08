/**
 * lib/rules/registry.ts — Registered rules for the Pleks autonomous intelligence engine
 *
 * Notes:  Phase 1 rules — all 8 implemented rules.
 *         See BUILD_67_RULES_ENGINE.md for the full catalogue and migration path.
 *         legalArchiveRule deferred — already runs as runLegalArchiveStep() in daily cron.
 *         searchworksConnectivityRule deferred — no Searchworx API credentials yet.
 */
import type { PleksRule } from "./types"

// Application
import { rejectedApplicantPurgeRule } from "./application/rejected-applicant-purge"

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
  // Application — PAIA compliance
  rejectedApplicantPurgeRule,

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
