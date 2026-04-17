"use server"

import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { Resend } from "resend"

export async function uploadPropertyDocument(formData: FormData) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId } = gw

  const propertyId = formData.get("property_id") as string
  const documentType = formData.get("document_type") as string
  const expiryDate = formData.get("expiry_date") as string || null
  const notes = formData.get("notes") as string || null
  const file = formData.get("file") as File

  if (!file || !propertyId || !documentType) {
    return { error: "Missing required fields" }
  }

  // Get org_id
  const { data: property } = await db
    .from("properties")
    .select("org_id")
    .eq("id", propertyId)
    .single()

  if (!property) return { error: "Property not found" }

  const orgId = property.org_id
  const sanitizedName = file.name.replaceAll(/[^a-zA-Z0-9.-]/g, "_")
  const storagePath = `${orgId}/${propertyId}/${documentType}/${Date.now()}-${sanitizedName}`

  const { error: uploadError } = await db.storage
    .from("property-documents")
    .upload(storagePath, file, { cacheControl: "3600", upsert: false })

  if (uploadError) return { error: uploadError.message }

  const { error: dbError } = await db.from("property_documents").insert({
    org_id: orgId,
    property_id: propertyId,
    name: file.name,
    document_type: documentType,
    storage_path: storagePath,
    file_size: file.size,
    mime_type: file.type,
    expiry_date: expiryDate,
    notes,
    uploaded_by: userId,
  })

  if (dbError) return { error: dbError.message }

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function deletePropertyDocument(documentId: string, propertyId: string) {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, userId, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  const { data: doc } = await db
    .from("property_documents")
    .select("storage_path, org_id")
    .eq("id", documentId)
    .single()

  if (!doc) return { error: "Document not found" }

  // Delete from storage
  await db.storage.from("property-documents").remove([doc.storage_path])

  // Delete record
  await db.from("property_documents").delete().eq("id", documentId)

  // Audit
  await db.from("audit_log").insert({
    org_id: doc.org_id,
    table_name: "property_documents",
    record_id: documentId,
    action: "DELETE",
    changed_by: userId,
  })

  revalidatePath(`/properties/${propertyId}`)
  return { success: true }
}

export async function getDocumentSignedUrl(storagePath: string) {
  const gw = await gateway()
  if (!gw) return null
  const { db } = gw

  const { data } = await db.storage
    .from("property-documents")
    .createSignedUrl(storagePath, 3600)

  return data?.signedUrl || null
}

// ─── Document editor actions ─────────────────────────────────────────────────

/**
 * Resolve merge fields in a template body using real or sample values.
 */
function resolveMergeFields(
  body: string,
  values: Record<string, string>
): string {
  let resolved = body
  for (const [key, value] of Object.entries(values)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value)
  }
  return resolved
}

export async function sendDocument(
  formData: FormData
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId, email: agentEmail } = gw

  const templateId = formData.get("template_id") as string | null
  const leaseId = formData.get("lease_id") as string | null
  const recipientEmail = formData.get("recipient_email") as string
  const subject = (formData.get("subject") as string) || "Document from Pleks"
  const bodyHtml = formData.get("body_html") as string

  if (!recipientEmail || !bodyHtml) {
    return { error: "Recipient email and body are required" }
  }

  // 1. Create job row
  const { data: job, error: jobError } = await db
    .from("document_generation_jobs")
    .insert({
      org_id: orgId,
      user_id: userId,
      template_id: templateId,
      lease_id: leaseId,
      status: "generating",
      recipient_email: recipientEmail,
      subject,
    })
    .select("id")
    .single()

  if (jobError) return { error: jobError.message }

  // 2. Resolve merge field values from lease context
  const mergeValues: Record<string, string> = {
    "today": new Date().toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    "agent.name": agentEmail,
  }

  if (leaseId) {
    const { data: lease } = await db
      .from("leases")
      .select(
        "id, rent_cents, tenants(full_name), units(unit_number, properties(name))"
      )
      .eq("id", leaseId)
      .eq("org_id", orgId)
      .single()

    if (lease) {
      const leaseData = lease as unknown as {
        rent_cents: number
        tenants: { full_name: string } | null
        units: { unit_number: string; properties: { name: string } | null } | null
      }
      mergeValues["tenant.full_name"] = leaseData.tenants?.full_name ?? ""
      mergeValues["unit.number"] = leaseData.units?.unit_number ?? ""
      mergeValues["property.name"] = leaseData.units?.properties?.name ?? ""
      mergeValues["lease.rent_amount"] = `R ${(leaseData.rent_cents / 100).toFixed(2)}`
    }
  }

  const resolvedHtml = resolveMergeFields(bodyHtml, mergeValues)

  // 3. Send via Resend
  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: "Pleks <noreply@pleks.co.za>",
    to: recipientEmail,
    subject,
    html: resolvedHtml,
  })

  if (sendError) {
    await db
      .from("document_generation_jobs")
      .update({ status: "failed" })
      .eq("id", job.id)
    return { error: sendError.message }
  }

  // 4. Mark job sent + create lease_documents record
  await db
    .from("document_generation_jobs")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", job.id)

  if (leaseId) {
    // lease_documents requires doc_type, title, storage_path — email sends don't produce
    // a file, so we only log to communication_log for the audit trail.

    // 5. Communication log
    await db.from("communication_log").insert({
      org_id: orgId,
      lease_id: leaseId,
      channel: "email",
      direction: "outbound",
      subject,
      body: resolvedHtml,
      sent_to_email: recipientEmail,
      sent_by: userId,
      status: "sent",
    })
  }

  revalidatePath("/documents")
  return {}
}

export async function generateDocumentPdf(
  formData: FormData
): Promise<{ error?: string; printUrl?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const templateId = formData.get("template_id") as string | null
  const leaseId = formData.get("lease_id") as string | null
  const subject = (formData.get("subject") as string) || null
  const bodyHtml = formData.get("body_html") as string
  const existingJobId = (formData.get("job_id") as string) || null

  if (!bodyHtml) return { error: "Document body is required" }

  let jobId: string

  if (existingJobId) {
    const { error } = await db
      .from("document_generation_jobs")
      .update({ body_html: bodyHtml, subject, status: "draft" })
      .eq("id", existingJobId)
      .eq("org_id", orgId)
    if (error) return { error: error.message }
    jobId = existingJobId
  } else {
    const { data, error } = await db
      .from("document_generation_jobs")
      .insert({
        org_id: orgId,
        user_id: userId,
        template_id: templateId,
        lease_id: leaseId,
        subject,
        body_html: bodyHtml,
        status: "draft",
      })
      .select("id")
      .single()
    if (error || !data) return { error: error?.message ?? "Failed to save draft" }
    jobId = data.id
  }

  revalidatePath("/documents")
  return { printUrl: `/api/documents/${jobId}/print?print=1` }
}

export async function saveDraftDocument(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId, userId } = gw

  const templateId = formData.get("template_id") as string | null
  const leaseId = formData.get("lease_id") as string | null
  const subject = (formData.get("subject") as string) || null
  const bodyHtml = formData.get("body_html") as string
  const recipientEmail = (formData.get("recipient_email") as string) || null
  const existingJobId = (formData.get("job_id") as string) || null

  if (existingJobId) {
    const { error } = await db
      .from("document_generation_jobs")
      .update({
        template_id: templateId,
        lease_id: leaseId,
        subject,
        body_html: bodyHtml,
        recipient_email: recipientEmail,
        status: "draft",
      })
      .eq("id", existingJobId)
      .eq("org_id", orgId)

    if (error) return { error: error.message }
    return { id: existingJobId }
  }

  const { data, error } = await db
    .from("document_generation_jobs")
    .insert({
      org_id: orgId,
      user_id: userId,
      template_id: templateId,
      lease_id: leaseId,
      subject,
      body_html: bodyHtml,
      recipient_email: recipientEmail,
      status: "draft",
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/documents")
  return { id: data.id }
}

// ── WhatsApp CS window lookup ─────────────────────────────────────────────────

export async function getActiveCsWindow(leaseId: string): Promise<{
  isActive: boolean
  expiresAt: string | null
}> {
  const gw = await gateway()
  if (!gw) return { isActive: false, expiresAt: null }
  const { db } = gw

  const { data, error } = await db
    .from("whatsapp_cs_windows")
    .select("expires_at")
    .eq("lease_id", leaseId)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== "PGRST116") {
    console.error("getActiveCsWindow failed:", error.message)
  }

  return {
    isActive: !!data,
    expiresAt: data?.expires_at ?? null,
  }
}
