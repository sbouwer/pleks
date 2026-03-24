import { differenceInDays, subDays, format } from "date-fns"

export function checkVisaLeaseAlignment(
  permitExpiry: Date | null,
  proposedLeaseEnd: Date | null
): {
  compatible: boolean
  warning: string | null
  recommendation: string | null
} {
  if (!permitExpiry) return { compatible: true, warning: null, recommendation: null }
  if (!proposedLeaseEnd) return { compatible: true, warning: null, recommendation: null }

  const daysToPermitExpiry = differenceInDays(permitExpiry, new Date())
  const leaseWithinPermit = proposedLeaseEnd <= permitExpiry

  if (leaseWithinPermit) {
    return {
      compatible: true,
      warning: null,
      recommendation: daysToPermitExpiry < 180
        ? `Permit expires ${format(permitExpiry, "dd MMM yyyy")} — within 6 months. Confirm permit renewal is in progress before signing.`
        : null,
    }
  }

  return {
    compatible: false,
    warning: `Proposed lease end (${format(proposedLeaseEnd, "dd MMM yyyy")}) extends past permit expiry (${format(permitExpiry, "dd MMM yyyy")}).`,
    recommendation: `Shorten lease end to ${format(subDays(permitExpiry, 30), "dd MMM yyyy")} (1 month before permit expiry) OR include a lease break clause if permit is not renewed.`,
  }
}
