/**
 * GET /api/documents/[jobId]/print?print=1
 * Returns a print-ready HTML page for the saved document draft.
 * Open in a new tab → browser prints to PDF (auto-triggered when ?print=1).
 * Auth: cookie session (same pattern as tenant statement route).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { buildLetterHTML, resolveMergeFields } from "@/lib/pdf/documentLetter"

// ── Helpers ───────────────────────────────────────────────────────────────────

type LeaseRow = {
  rent_cents: number
  tenants: { contacts: ContactRow } | null
  units: { unit_number: string; properties: { name: string } | null } | null
}

interface LeaseContext {
  mergeValues: Record<string, string>
  leaseRef: string | null
}

type ContactRow = { first_name?: string | null; last_name?: string | null; company_name?: string | null } | null

function buildTenantName(contact: ContactRow): string {
  if (!contact) return ""
  return (
    contact.company_name?.trim() ||
    [contact.first_name, contact.last_name].filter(Boolean).join(" ")
  )
}

async function resolveLeaseContext(
  service: SupabaseClient,
  leaseId: string,
): Promise<LeaseContext> {
  const { data: lease } = await service
    .from("leases")
    .select("rent_cents, tenants(contacts(first_name, last_name, company_name)), units(unit_number, properties(name))")
    .eq("id", leaseId)
    .single()

  if (!lease) return { mergeValues: {}, leaseRef: null }

  const l = lease as unknown as LeaseRow
  const tenantName = buildTenantName(l.tenants?.contacts ?? null)
  const unitNumber = l.units?.unit_number ?? ""
  const propertyName = l.units?.properties?.name ?? ""
  const rentFormatted = l.rent_cents
    ? `R ${(l.rent_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
    : ""

  const parts = [propertyName, unitNumber ? `Unit ${unitNumber}` : ""].filter(Boolean)
  const leaseRef = parts.length > 0 ? parts.join(" — ") : null

  return {
    mergeValues: {
      "tenant.full_name": tenantName,
      "unit.number": unitNumber,
      "property.name": propertyName,
      "lease.rent_amount": rentFormatted,
    },
    leaseRef,
  }
}

async function getSignatureUrl(service: SupabaseClient, userId: string): Promise<string | null> {
  const { data: sig } = await service
    .from("user_signatures")
    .select("storage_path")
    .eq("user_id", userId)
    .eq("is_active", true)
    .single()

  if (!sig?.storage_path) return null

  const { data: urlData } = await service.storage
    .from("signatures")
    .createSignedUrl(sig.storage_path, 3600)

  return urlData?.signedUrl ?? null
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params

  // Auth
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  // Org membership
  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, user_profiles(full_name)")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return new Response("Unauthorized", { status: 401 })

  const orgId = membership.org_id
  const profile = membership.user_profiles as unknown as { full_name: string | null } | null
  const agentName = profile?.full_name ?? user.email ?? "Agent"

  // Fetch the job (must belong to this org)
  const { data: job } = await service
    .from("document_generation_jobs")
    .select("id, lease_id, body_html")
    .eq("id", jobId)
    .eq("org_id", orgId)
    .single()

  if (!job) return new Response("Not found", { status: 404 })

  // Build merge values from context
  const today = new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const mergeValues: Record<string, string> = { today, today_long: today, "agent.name": agentName }

  let leaseRef: string | null = null

  if (job.lease_id) {
    const ctx = await resolveLeaseContext(service, job.lease_id)
    Object.assign(mergeValues, ctx.mergeValues)
    leaseRef = ctx.leaseRef
  }

  // Org name + signature (parallel)
  const [orgResult, signatureUrl] = await Promise.all([
    service.from("organisations").select("name").eq("id", orgId).single(),
    getSignatureUrl(service, user.id),
  ])

  const orgName = orgResult.data?.name ?? "Property Management"
  mergeValues["org.name"] = orgName

  const resolvedBody = resolveMergeFields(job.body_html ?? "", mergeValues)

  const html = buildLetterHTML({ orgName, agentName, signatureUrl, leaseRef, bodyHtml: resolvedBody })

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `inline; filename="document-${jobId.slice(0, 8)}.html"`,
      "X-Robots-Tag": "noindex",
    },
  })
}
