/**
 * app/api/tenants/[id]/contact-details/route.ts — CRUD for a tenant's contact sub-records
 *
 * Route:  /api/tenants/[id]/contact-details
 * Auth:   auth.getUser + user_orgs membership; ownership verified (tenant owns the contact_id) per request
 * Data:   contact_phones / contact_emails / contact_addresses / contact_bank_accounts (switched on body.type)
 * Notes:  thin dispatcher — the per-type CRUD lives in lib/contacts/contactSubRecords (shared with suppliers/landlords)
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import {
  createSubRecord, updateSubRecord, deleteSubRecord, type SubRecordBody, type SubRecordResult,
} from "@/lib/contacts/contactSubRecords"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { bankDetailStepUp } from "@/lib/auth/contactStepUp"

interface RouteContext {
  params: Promise<{ id: string }>
}

async function getMembership(service: Awaited<ReturnType<typeof createServiceClient>>, userId: string) {
  const { data, error: queryError2 } = await service
    .from("user_orgs").select("org_id, role").eq("user_id", userId).is("deleted_at", null).single()
    logQueryError("getMembership user_orgs", queryError2)
  return data
}

/**
 * Resolve the tenant's contact_id authoritatively from the owned tenant row. We never trust a
 * client-sent contactId: ContactEditForm doesn't send one (so `body.contactId ?? ""` produced an
 * empty-UUID query → 404 on phone/email edits), and deriving it server-side also stops a caller
 * targeting another tenant's contact.
 */
async function resolveContactId(
  service: Awaited<ReturnType<typeof createServiceClient>>, tenantId: string, orgId: string,
): Promise<string | null> {
  const { data, error: queryError } = await service
    .from("tenants").select("contact_id").eq("id", tenantId).eq("org_id", orgId).single()
    logQueryError("resolveContactId tenants", queryError)
  return data?.contact_id ?? null
}

type Resolved =
  | { error: NextResponse }
  | { service: Awaited<ReturnType<typeof createServiceClient>>; orgId: string; userId: string; contactId: string; body: SubRecordBody }

async function resolve(req: NextRequest, tenantId: string): Promise<Resolved> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const service = await createServiceClient()
  const membership = await getMembership(service, user.id)
  if (!membership) return { error: NextResponse.json({ error: "No org" }, { status: 403 }) }

  const body = await req.json() as SubRecordBody
  const contactId = await resolveContactId(service, tenantId, membership.org_id)
  if (!contactId) return { error: NextResponse.json({ error: "Tenant not found" }, { status: 404 }) }

  return { service, orgId: membership.org_id, userId: user.id, contactId, body }
}

const respond = (r: SubRecordResult) =>
  r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status })

export async function POST(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolve(req, (await params).id)
  if ("error" in ctx) return ctx.error
  const challenge = await bankDetailStepUp(ctx.body, ctx.userId, ctx.contactId)
  if (challenge) return challenge
  return respond(await createSubRecord(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, ctx.body))
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolve(req, (await params).id)
  if ("error" in ctx) return ctx.error
  const challenge = await bankDetailStepUp(ctx.body, ctx.userId, ctx.contactId)
  if (challenge) return challenge
  return respond(await updateSubRecord(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, ctx.body))
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const ctx = await resolve(req, (await params).id)
  if ("error" in ctx) return ctx.error
  const challenge = await bankDetailStepUp(ctx.body, ctx.userId, ctx.contactId)
  if (challenge) return challenge
  return respond(await deleteSubRecord(ctx.service, ctx.orgId, ctx.contactId, ctx.userId, ctx.body))
}
