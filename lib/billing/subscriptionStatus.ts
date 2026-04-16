type Sub = { status: string } | null | undefined

/**
 * Whether the subscription allows landlord write operations.
 * past_due is kept writable during the 14-day banking retry + comms window.
 */
export function canWrite(subscription: Sub): boolean {
  if (!subscription) return false
  return ["active", "trialing", "past_due"].includes(subscription.status)
}

/** Same as canWrite — premium features are gated by subscription health. */
export function canUsePremiumFeatures(subscription: Sub): boolean {
  return canWrite(subscription)
}

/**
 * Recording payments is ALWAYS allowed — trust account receipts
 * cannot be blocked (tenant is paying, not the landlord).
 */
export function canRecordPayment(): boolean {
  return true
}

/**
 * Tenant portal access is ALWAYS allowed — tenants are not
 * responsible for the landlord's subscription status.
 */
export function canAccessTenantPortal(): boolean {
  return true
}

/**
 * Data export is ALWAYS allowed — POPIA s24 right of access
 * cannot be blocked by a subscription gate.
 */
export function canExportData(): boolean {
  return true
}

export function isFrozen(subscription: Sub): boolean {
  return subscription?.status === "frozen"
}

export function isPastDue(subscription: Sub): boolean {
  return subscription?.status === "past_due"
}
