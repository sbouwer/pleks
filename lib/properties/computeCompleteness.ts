/**
 * Pure function: compute property setup completeness from current state.
 * Returns 0-100 weighted percentage + a list of outstanding items the
 * widget can render with quick-action buttons.
 *
 * Categories per BUILD_60 §13.3:
 *   Address + scenario     15
 *   Owner / landlord       15
 *   Scheme (if applicable) 10
 *   Insurance basic        15
 *   Broker (Owner Pro+)    10
 *   Documents              10
 *   Units detail           15
 *   Banking (managed)      10
 */

export type CompletenessTopic =
  | "address" | "owner" | "scheme" | "insurance" | "broker"
  | "documents" | "units" | "banking" | "universals"

export interface CompletenessItem {
  topic:    CompletenessTopic
  label:    string
  detail?:  string
  done:     boolean
  weight:   number
  /** Overrides binary weight calculation for partial credit (0–weight) */
  earnedWeight?: number
  /** Pending info_request id, if one is already open for this topic */
  pendingRequestId?: string
}

export interface CompletenessSnapshot {
  managedMode:         "self_owned" | "managed_for_owner"
  hasLandlord:         boolean
  hasManagingScheme:   boolean
  hasSchemeContact:    boolean
  insuranceFieldsCount: number          // 0–4 (insurer, policy, renewal, replacement value)
  brokerLinked:        boolean
  isOwnerProBrokerVisible: boolean      // true for Steward+ orgs or Owner with active Owner Pro lease
  documentsCount:      number
  unitsTotalCount:     number
  unitsWithDetailCount: number          // residential: bedrooms+bathrooms; commercial: size_m2
  hasOwnerBanking:     boolean
  /** Confirmed applicable checklist items (when checklist exists) */
  checklistConfirmed?: number
  /** Total applicable checklist items (non-NA; 0 = checklist not yet initialised) */
  checklistTotal?:     number
  /** Map of pending info_request topic → request id */
  pendingRequests:     Partial<Record<CompletenessTopic, string>>
  /** Count of universal fields (wifi, cell signal, backup power) still marked "unknown" */
  unknownUniversalsCount: number
  /** True when org tier is owner or steward — shows unknown universals as open items */
  isOwnerStewardTier:  boolean
}

export interface CompletenessResult {
  pct:         number
  items:       CompletenessItem[]
  outstanding: CompletenessItem[]
}

const WEIGHTS: Record<CompletenessTopic, number> = {
  address:    15,
  owner:      15,
  scheme:     10,
  insurance:  15,
  broker:     10,
  documents:  10,
  units:      15,
  banking:    10,
  universals:  0, // informational open item — does not affect scored percentage
}

function buildOwnerItem(snap: CompletenessSnapshot): CompletenessItem {
  const done = snap.managedMode === "self_owned" || snap.hasLandlord
  return {
    topic:  "owner",
    label:  snap.managedMode === "self_owned" ? "Owner — you" : "Owner / landlord linked",
    done,
    weight: WEIGHTS.owner,
    detail: done ? undefined : "Link an existing owner or add a new one",
    pendingRequestId: snap.pendingRequests.owner,
  }
}

function buildSchemeItem(snap: CompletenessSnapshot): CompletenessItem | null {
  if (!snap.hasManagingScheme) return null
  return {
    topic:  "scheme",
    label:  "Managing scheme contact",
    done:   snap.hasSchemeContact,
    weight: WEIGHTS.scheme,
    detail: snap.hasSchemeContact ? undefined : "Add the BC / HOA managing agent contact",
    pendingRequestId: snap.pendingRequests.scheme,
  }
}

function buildBrokerItem(snap: CompletenessSnapshot): CompletenessItem | null {
  if (!snap.isOwnerProBrokerVisible) return null
  return {
    topic:  "broker",
    label:  "Broker contact",
    done:   snap.brokerLinked,
    weight: WEIGHTS.broker,
    detail: snap.brokerLinked ? undefined : "Link your insurance broker for incident notifications",
    pendingRequestId: snap.pendingRequests.broker,
  }
}

function buildDocumentsItem(snap: CompletenessSnapshot): CompletenessItem {
  const done = snap.documentsCount > 0
  return {
    topic:  "documents",
    label:  "Compliance documents",
    done,
    weight: WEIGHTS.documents,
    detail: done ? `${snap.documentsCount} on file` : "No CoCs or title deed uploaded",
    pendingRequestId: snap.pendingRequests.documents,
  }
}

function buildUnitsItem(snap: CompletenessSnapshot): CompletenessItem {
  const done = snap.unitsTotalCount > 0 && snap.unitsWithDetailCount === snap.unitsTotalCount
  return {
    topic:  "units",
    label:  "Unit details (size, bedrooms)",
    done,
    weight: WEIGHTS.units,
    detail: done ? undefined : `${snap.unitsWithDetailCount} of ${snap.unitsTotalCount} units have full details`,
  }
}

function buildBankingItem(snap: CompletenessSnapshot): CompletenessItem | null {
  if (snap.managedMode !== "managed_for_owner") return null
  return {
    topic:  "banking",
    label:  "Owner banking details",
    done:   snap.hasOwnerBanking,
    weight: WEIGHTS.banking,
    detail: snap.hasOwnerBanking ? undefined : "Required for owner statement payouts",
    pendingRequestId: snap.pendingRequests.banking,
  }
}

function buildUniversalsItem(snap: CompletenessSnapshot): CompletenessItem | null {
  if (!snap.isOwnerStewardTier || snap.unknownUniversalsCount === 0) return null
  const fields = snap.unknownUniversalsCount === 1 ? "field" : "fields"
  return {
    topic:  "universals",
    label:  "Property utility details",
    done:   false,
    weight: 0,
    detail: `${snap.unknownUniversalsCount} ${fields} marked Unknown — confirm WiFi, cell signal, or backup power`,
  }
}

function buildInsuranceItem(snap: CompletenessSnapshot): CompletenessItem {
  const total = snap.checklistTotal ?? 0
  const confirmed = snap.checklistConfirmed ?? 0
  if (total > 0) {
    const done = confirmed === total
    return {
      topic:        "insurance",
      label:        "Insurance policy details",
      done,
      weight:       WEIGHTS.insurance,
      earnedWeight: Math.round((confirmed / total) * WEIGHTS.insurance),
      detail:       done ? undefined : `${confirmed} of ${total} items verified`,
      pendingRequestId: snap.pendingRequests.insurance,
    }
  }
  const done = snap.insuranceFieldsCount >= 4
  return {
    topic:  "insurance",
    label:  "Insurance policy details",
    done,
    weight: WEIGHTS.insurance,
    detail: done ? undefined : `${snap.insuranceFieldsCount} of 4 fields complete`,
    pendingRequestId: snap.pendingRequests.insurance,
  }
}

export function computePropertyCompleteness(snap: CompletenessSnapshot): CompletenessResult {
  const items: CompletenessItem[] = [
    { topic: "address", label: "Address & property type", done: true, weight: WEIGHTS.address },
    buildOwnerItem(snap),
    buildSchemeItem(snap),
    buildInsuranceItem(snap),
    buildBrokerItem(snap),
    buildDocumentsItem(snap),
    buildUnitsItem(snap),
    buildBankingItem(snap),
    buildUniversalsItem(snap),
  ].filter((i): i is CompletenessItem => i !== null)

  const totalWeight  = items.reduce((sum, i) => sum + i.weight, 0)
  const earnedWeight = items.reduce((sum, i) => sum + (i.earnedWeight ?? (i.done ? i.weight : 0)), 0)
  const pct = totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100)

  return { pct, items, outstanding: items.filter((i) => !i.done) }
}

// ── Decision: should the widget render at all? ───────────────────────────────

export interface ShouldRenderWidgetInput {
  pct:                            number
  createdAt:                      string | null
  onboardingCompletedAt:          string | null
  onboardingWidgetDismissedAt:    string | null
}

const WIDGET_LIFETIME_DAYS = 30
const DISMISS_COOLDOWN_DAYS = 7

export function shouldRenderCompletenessWidget(input: ShouldRenderWidgetInput): boolean {
  if (input.pct >= 100) return false
  if (input.onboardingCompletedAt) return false

  if (input.onboardingWidgetDismissedAt) {
    const dismissedAt = new Date(input.onboardingWidgetDismissedAt).getTime()
    const cooldownMs = DISMISS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000
    if (Date.now() - dismissedAt < cooldownMs) return false
  }

  if (input.createdAt) {
    const createdAt = new Date(input.createdAt).getTime()
    const lifetimeMs = WIDGET_LIFETIME_DAYS * 24 * 60 * 60 * 1000
    if (Date.now() - createdAt > lifetimeMs) return false
  }

  return true
}
