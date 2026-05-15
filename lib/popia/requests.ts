/**
 * lib/popia/requests.ts — Data-subject request CRUD + subject controller enumeration
 *
 * Auth:   Service-role (server actions / server components only)
 * Data:   data_subject_requests, user_orgs_tenants, user_orgs_landlords, user_orgs_contractors
 * Notes:  D-POPIA-15 viewer-centric scoping: subject-side helpers enumerate all
 *         controllers by user_id; agency-side helpers scope to one org_id.
 *         Never mix subject-side and agency-side parameter shapes — the types enforce this.
 */
import { createServiceClient } from "@/lib/supabase/server"

// ─── Types ────────────────────────────────────────────────────────────────────

export type RequestStatus =
  | "new"
  | "verifying_identity"
  | "under_review"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled"

export type RequestType =
  | "access"
  | "correction"
  | "erasure"
  | "objection"
  | "restriction"
  | "portability"
  | "consent_withdrawal"
  | "nuke"

export type SubjectVia = "portal" | "email" | "platform_admin_route" | "agency_initiated"

export interface DataSubjectRequest {
  id: string
  org_id: string
  subject_user_id: string | null
  subject_email: string
  subject_full_name: string | null
  subject_role_context: string | null
  request_type: RequestType
  request_scope: Record<string, unknown>
  subject_narrative: string | null
  status: RequestStatus
  submitted_at: string
  submitted_via: SubjectVia
  sla_deadline: string
  assigned_to: string | null
  resolution_notes: string | null
  resolution_legal_basis: string | null
  resolved_at: string | null
  resolved_by: string | null
  export_id: string | null
  erasure_records_affected: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface ControllerCard {
  type: "pleks_rp" | "agency_operator"
  org_id: string | null       // null for Pleks RP
  org_name: string
  subject_role: string        // e.g. "tenant", "landlord", "supplier"
  data_categories: string[]   // high-level summary of data categories held
}

export interface CreateDataSubjectRequestInput {
  org_id: string
  subject_user_id: string | null
  subject_email: string
  subject_full_name?: string
  subject_id_last4?: string
  subject_role_context?: string
  request_type: RequestType
  request_scope?: Record<string, unknown>
  subject_narrative?: string
  submitted_via?: SubjectVia
}

export interface RequestStats {
  open: number
  completed: number
  rejected: number
  avg_resolution_days: number
}

// ─── Subject-side helpers (viewer-centric — D-POPIA-15) ───────────────────────

/**
 * Returns one ControllerCard per distinct controller (org) the subject has a
 * relationship with, plus a synthetic Pleks RP card for platform-account data.
 * Bridges: user_orgs_tenants | user_orgs_landlords | user_orgs_contractors.
 */
export async function listControllersForSubject(userId: string): Promise<ControllerCard[]> {
  const db = createServiceClient()
  const cards: ControllerCard[] = []

  type OrgLink = { org_id: string; organisations: unknown }

  function orgName(link: OrgLink): string | null {
    const o = link.organisations
    if (!o || typeof o !== "object") return null
    // Supabase may return an array (0-or-1 rows) or a single object depending on schema typing
    const obj = Array.isArray(o) ? o[0] : o
    return (obj as { name?: string })?.name ?? null
  }

  // Tenant memberships
  const { data: tenantLinks } = await (await db)
    .from("user_orgs_tenants")
    .select("org_id, organisations(name)")
    .eq("user_id", userId)
    .is("deleted_at", null)

  for (const link of (tenantLinks ?? []) as OrgLink[]) {
    const name = orgName(link)
    if (!name) continue
    cards.push({
      type: "agency_operator",
      org_id: link.org_id,
      org_name: name,
      subject_role: "tenant",
      data_categories: ["Lease documents", "Inspections", "Communications", "Rent ledger", "Deposits"],
    })
  }

  // Landlord memberships
  const { data: landlordLinks } = await (await db)
    .from("user_orgs_landlords")
    .select("org_id, organisations(name)")
    .eq("user_id", userId)
    .is("deleted_at", null)

  for (const link of (landlordLinks ?? []) as OrgLink[]) {
    const name = orgName(link)
    if (!name) continue
    if (cards.some((c) => c.org_id === link.org_id && c.subject_role === "landlord")) continue
    cards.push({
      type: "agency_operator",
      org_id: link.org_id,
      org_name: name,
      subject_role: "landlord",
      data_categories: ["Property records", "Trust summaries", "Communications"],
    })
  }

  // Supplier/contractor memberships
  const { data: supplierLinks } = await (await db)
    .from("user_orgs_contractors")
    .select("org_id, organisations(name)")
    .eq("user_id", userId)
    .is("deleted_at", null)

  for (const link of (supplierLinks ?? []) as OrgLink[]) {
    const name = orgName(link)
    if (!name) continue
    if (cards.some((c) => c.org_id === link.org_id && c.subject_role === "supplier")) continue
    cards.push({
      type: "agency_operator",
      org_id: link.org_id,
      org_name: name,
      subject_role: "supplier",
      data_categories: ["Job history", "Invoices", "Communications"],
    })
  }

  // Always add the Pleks RP card (platform account data)
  cards.push({
    type: "pleks_rp",
    org_id: null,
    org_name: "Pleks",
    subject_role: "platform_account",
    data_categories: ["Login & sessions", "Passkeys & MFA", "Platform activity", "In-app feedback"],
  })

  return cards
}

export async function createDataSubjectRequest(
  input: CreateDataSubjectRequestInput,
): Promise<DataSubjectRequest> {
  const db = createServiceClient()
  const { data, error } = await (await db)
    .from("data_subject_requests")
    .insert({
      org_id: input.org_id,
      subject_user_id: input.subject_user_id,
      subject_email: input.subject_email,
      subject_full_name: input.subject_full_name,
      subject_id_last4: input.subject_id_last4,
      subject_role_context: input.subject_role_context,
      request_type: input.request_type,
      request_scope: input.request_scope ?? {},
      subject_narrative: input.subject_narrative,
      submitted_via: input.submitted_via ?? "portal",
      status: "new",
    })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[popia/requests] createDataSubjectRequest failed: ${error?.message ?? "unknown"}`)
  }

  return data as DataSubjectRequest
}

export async function transitionRequestStatus(
  requestId: string,
  to: RequestStatus,
  context: { actor_user_id: string; legal_basis?: string; notes?: string },
): Promise<DataSubjectRequest> {
  const db = createServiceClient()
  const update: Record<string, unknown> = {
    status: to,
    updated_at: new Date().toISOString(),
  }

  if (to === "approved" || to === "rejected" || to === "completed") {
    update.resolved_at = new Date().toISOString()
    update.resolved_by = context.actor_user_id
    if (context.legal_basis) update.resolution_legal_basis = context.legal_basis
    if (context.notes) update.resolution_notes = context.notes
  }

  const { data, error } = await (await db)
    .from("data_subject_requests")
    .update(update)
    .eq("id", requestId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[popia/requests] transitionRequestStatus failed: ${error?.message ?? "unknown"}`)
  }

  return data as DataSubjectRequest
}

export async function assignRequest(
  requestId: string,
  assignee_user_id: string,
): Promise<DataSubjectRequest> {
  const db = createServiceClient()
  const { data, error } = await (await db)
    .from("data_subject_requests")
    .update({ assigned_to: assignee_user_id, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .select()
    .single()

  if (error || !data) {
    throw new Error(`[popia/requests] assignRequest failed: ${error?.message ?? "unknown"}`)
  }

  return data as DataSubjectRequest
}

// ─── Agency-side helpers (org-scoped — D-POPIA-15) ───────────────────────────

export async function getOverdueRequests(orgId: string): Promise<DataSubjectRequest[]> {
  const db = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("org_id", orgId)
    .in("status", ["new", "verifying_identity", "under_review"])
    .lt("sla_deadline", today)
    .order("sla_deadline", { ascending: true })

  if (error) {
    throw new Error(`[popia/requests] getOverdueRequests failed: ${error.message}`)
  }

  return (data ?? []) as DataSubjectRequest[]
}

export async function getRequestStats(
  orgId: string,
  periodMonths: number,
): Promise<RequestStats> {
  const db = createServiceClient()
  const since = new Date()
  since.setMonth(since.getMonth() - periodMonths)
  const sinceIso = since.toISOString()

  const { data, error } = await (await db)
    .from("data_subject_requests")
    .select("status, submitted_at, resolved_at")
    .eq("org_id", orgId)
    .gte("submitted_at", sinceIso)

  if (error) {
    throw new Error(`[popia/requests] getRequestStats failed: ${error.message}`)
  }

  const rows = data ?? []
  const open = rows.filter((r) => ["new", "verifying_identity", "under_review"].includes(r.status)).length
  const completed = rows.filter((r) => r.status === "completed").length
  const rejected = rows.filter((r) => r.status === "rejected").length

  const resolvedWithDates = rows.filter((r) => r.resolved_at && r.submitted_at)
  const avg_resolution_days =
    resolvedWithDates.length === 0
      ? 0
      : resolvedWithDates.reduce((sum, r) => {
          const ms = new Date(r.resolved_at as string).getTime() - new Date(r.submitted_at).getTime()
          return sum + ms / (1000 * 60 * 60 * 24)
        }, 0) / resolvedWithDates.length

  return { open, completed, rejected, avg_resolution_days: Math.round(avg_resolution_days) }
}
