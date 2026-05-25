/**
 * lib/marketing/facts.ts — Marketing facts aggregator
 *
 * Notes:  Single import surface for all derived marketing facts.
 *         Public-surface files import from here, not from lib/legal/* directly.
 *         Spec: ADDENDUM_00J §4.5 D-MKT-01, D-MKT-03, D-MKT-16
 */
import { POPIA_PURPOSES } from "@/lib/legal/popia-purposes"
import { OPERATORS } from "@/lib/legal/operators"
import { RETENTION_CATEGORIES } from "@/lib/legal/retention-categories"
import { CHARTER_COMMITMENTS } from "@/components/marketing/charter/commitments"
import { TIERS } from "@/lib/marketing/tiers"

export const MARKETING_FACTS = {
  popiaPurposes: {
    total:       POPIA_PURPOSES.length,
    partA:       POPIA_PURPOSES.filter(p => p.id.startsWith("A")).length,
    partB:       POPIA_PURPOSES.filter(p => p.id.startsWith("B")).length,
    notDeployed: POPIA_PURPOSES.filter(p => p.notDeployed).length,
  },
  operators: {
    total:       OPERATORS.length,
    crossBorder: OPERATORS.filter(o => o.crossBorder).length,
    domestic:    OPERATORS.filter(o => !o.crossBorder).length,
  },
  subProcessors: {
    total: OPERATORS.filter(o => o.purposes.length > 0).length,
  },
  retention: {
    categories:  RETENTION_CATEGORIES.length,
    longestYears: Math.max(...RETENTION_CATEGORIES.map(r => r.retentionYearsMin)),
  },
  charter: {
    total: CHARTER_COMMITMENTS.length,
  },
  pricing: {
    tierCount:              TIERS.length,
    freeTier:               "Owner" as const,
    bespokeLeaseThreshold:  Math.max(...TIERS.filter(t => t.leaseCap !== null).map(t => t.leaseCap as number)),
  },
  sla: {
    popiaResponseDays:        30,
    breachNotificationHours:  24,
    popiaBreachHours:         72,
    requestRoutingDays:       5,
    depositReturnDaysClaim:   14,
    depositReturnDaysClaimed: 21,
  },
  notifications: {
    subprocessorChangeDays:    30,
    cpaAutoRenewalMinBizDays:  40,
    cpaAutoRenewalMaxBizDays:  80,
  },
} as const
