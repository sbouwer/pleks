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
  | "documents" | "units" | "banking"

export interface CompletenessItem {
  topic:    CompletenessTopic
  label:    string
  detail?:  string
  done:     boolean
  weight:   number
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
  /** Map of pending info_request topic → request id */
  pendingRequests:     Partial<Record<CompletenessTopic, string>>
}

export interface CompletenessResult {
  pct:         number
  items:       CompletenessItem[]
  outstanding: CompletenessItem[]
}

const WEIGHTS: Record<CompletenessTopic, number> = {
  address:   15,
  owner:     15,
  scheme:    10,
  insurance: 15,
  broker:    10,
  documents: 10,
  units:     15,
  banking:   10,
}

export function computePropertyCompleteness(snap: CompletenessSnapshot): CompletenessResult {
  const items: CompletenessItem[] = []

  // Address + scenario — assumed present (you can't have a property without these)
  items.push({
    topic:  "address",
    label:  "Address & property type",
    done:   true,
    weight: WEIGHTS.address,
  })

  // Owner / landlord
  const ownerDone = snap.managedMode === "self_owned" || snap.hasLandlord
  items.push({
    topic:  "owner",
    label:  snap.managedMode === "self_owned" ? "Owner — you" : "Owner / landlord linked",
    done:   ownerDone,
    weight: WEIGHTS.owner,
    detail: !ownerDone ? "Link an existing owner or add a new one" : undefined,
    pendingRequestId: snap.pendingRequests.owner,
  })

  // Scheme — only counts when applicable
  if (snap.hasManagingScheme) {
    items.push({
      topic:  "scheme",
      label:  "Managing scheme contact",
      done:   snap.hasSchemeContact,
      weight: WEIGHTS.scheme,
      detail: !snap.hasSchemeContact ? "Add the BC / HOA managing agent contact" : undefined,
      pendingRequestId: snap.pendingRequests.scheme,
    })
  }

  // Insurance — partial credit per field populated
  const insuranceDone = snap.insuranceFieldsCount >= 4
  items.push({
    topic:  "insurance",
    label:  "Insurance policy details",
    done:   insuranceDone,
    weight: WEIGHTS.insurance,
    detail: insuranceDone
      ? undefined
      : `${snap.insuranceFieldsCount} of 4 fields complete`,
    pendingRequestId: snap.pendingRequests.insurance,
  })

  // Broker — only shown for Owner Pro tiers
  if (snap.isOwnerProBrokerVisible) {
    items.push({
      topic:  "broker",
      label:  "Broker contact",
      done:   snap.brokerLinked,
      weight: WEIGHTS.broker,
      detail: !snap.brokerLinked ? "Link your insurance broker for incident notifications" : undefined,
      pendingRequestId: snap.pendingRequests.broker,
    })
  }

  // Documents — at least 1 doc on file
  items.push({
    topic:  "documents",
    label:  "Compliance documents",
    done:   snap.documentsCount > 0,
    weight: WEIGHTS.documents,
    detail: snap.documentsCount > 0
      ? `${snap.documentsCount} on file`
      : "No CoCs or title deed uploaded",
    pendingRequestId: snap.pendingRequests.documents,
  })

  // Units detail
  const unitsDone = snap.unitsTotalCount > 0 && snap.unitsWithDetailCount === snap.unitsTotalCount
  items.push({
    topic:  "units",
    label:  "Unit details (size, bedrooms)",
    done:   unitsDone,
    weight: WEIGHTS.units,
    detail: unitsDone
      ? undefined
      : `${snap.unitsWithDetailCount} of ${snap.unitsTotalCount} units have full details`,
  })

  // Banking — only for managed properties
  if (snap.managedMode === "managed_for_owner") {
    items.push({
      topic:  "banking",
      label:  "Owner banking details",
      done:   snap.hasOwnerBanking,
      weight: WEIGHTS.banking,
      detail: !snap.hasOwnerBanking ? "Required for owner statement payouts" : undefined,
      pendingRequestId: snap.pendingRequests.banking,
    })
  }

  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0)
  const earnedWeight = items.reduce((sum, i) => sum + (i.done ? i.weight : 0), 0)
  const pct = totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100)

  return {
    pct,
    items,
    outstanding: items.filter((i) => !i.done),
  }
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
