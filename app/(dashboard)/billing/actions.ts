"use server"

/**
 * app/(dashboard)/billing/actions.ts — bulk rent reminder SMS dispatch
 *
 * Auth:   requireAgentWriteAccess (subscription-gated)
 * Data:   rent_invoices, leases, tenant_view; sends SMS via sendSMS
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { sendSMS } from "@/lib/sms/sendSMS"

function normalizeSAPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`
  return phone
}

export async function sendBulkRentReminders(): Promise<{
  sent: number
  skipped: number
  error?: string
}> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "billing"))) throw new Error("Billing access is required")

  const { db, orgId } = gw

  // Get lease IDs with outstanding rent balances
  const { data: openInvoices, error: invoicesError } = await db
    .from("rent_invoices")
    .select("lease_id")
    .eq("org_id", orgId)
    .in("status", ["open", "partial", "overdue"])
    .gt("balance_cents", 0)

  if (invoicesError) {
    console.error("sendBulkRentReminders invoices error:", invoicesError.message)
    return { sent: 0, skipped: 0, error: "Failed to fetch invoices" }
  }

  const leaseIds = [...new Set((openInvoices ?? []).map((i) => i.lease_id).filter(Boolean))] as string[]
  if (leaseIds.length === 0) return { sent: 0, skipped: 0 }

  // Get tenant details for those leases
  const { data: leases, error: leasesError } = await db
    .from("leases")
    .select("id, tenant_view(first_name, phone)")
    .in("id", leaseIds)
    .eq("org_id", orgId)

  if (leasesError) {
    console.error("sendBulkRentReminders leases error:", leasesError.message)
    return { sent: 0, skipped: 0, error: "Failed to fetch tenant details" }
  }

  let sent = 0
  let skipped = 0
  const sentPhones = new Set<string>()

  for (const lease of leases ?? []) {
    const tenant = lease.tenant_view as unknown as { first_name: string | null; phone: string | null } | null
    if (!tenant?.phone) { skipped++; continue }

    const phone = normalizeSAPhone(tenant.phone)
    if (sentPhones.has(phone)) continue
    sentPhones.add(phone)

    const firstName = tenant.first_name ?? "there"
    const message = `Hi ${firstName}, this is a friendly reminder that your rent payment is outstanding. Please make payment or contact your agent. - Pleks`

    const result = await sendSMS(orgId, phone, message)
    if (result.sent) sent++
    else skipped++
  }

  return { sent, skipped }
}
