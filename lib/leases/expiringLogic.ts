interface LeaseForExpiry {
  end_date: string | null
  notice_period_days: number
  is_fixed_term: boolean
}

interface LeaseForUrgency {
  end_date: string | null
  notice_period_days: number
}

export type ExpiryUrgency = "expired" | "critical" | "warning" | "safe"

/**
 * True if a fixed-term lease is expiring within notice_period_days + 30 days.
 * This replaces any fixed 90-day cutoff — each lease uses its own notice period.
 */
export function isExpiringSoon(lease: LeaseForExpiry): boolean {
  if (!lease.is_fixed_term || !lease.end_date) return false
  const now = new Date()
  const endDate = new Date(lease.end_date)
  const bufferDays = (lease.notice_period_days || 20) + 30
  const threshold = new Date(now.getTime() + bufferDays * 86400000)
  return endDate <= threshold
}

/**
 * Returns urgency level based on days remaining vs notice period.
 * - expired: lease end is in the past
 * - critical: <= 30 days remaining
 * - warning: <= notice_period_days + 30 days remaining
 * - safe: otherwise
 */
export function getExpiryUrgency(lease: LeaseForUrgency): ExpiryUrgency {
  if (!lease.end_date) return "safe"
  const now = new Date()
  const endDate = new Date(lease.end_date)
  const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / 86400000)
  if (daysRemaining < 0) return "expired"
  if (daysRemaining <= 30) return "critical"
  if (daysRemaining <= (lease.notice_period_days || 20) + 30) return "warning"
  return "safe"
}

/** Hex colour for each urgency level. */
export function getExpiryColor(urgency: ExpiryUrgency): string {
  switch (urgency) {
    case "expired":  return "#E24B4A"
    case "critical": return "#E24B4A"
    case "warning":  return "#EF9F27"
    case "safe":     return "#378ADD"
  }
}
