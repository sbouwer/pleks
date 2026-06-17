"use server"

/**
 * lib/actions/templates.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { revalidatePath } from "next/cache"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function createDocumentTemplate(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const name = formData.get("name") as string
  const category = formData.get("category") as string
  const bodyHtml = formData.get("body_html") as string
  const templateType = (formData.get("template_type") as string) || "letter"
  const subject = (formData.get("subject") as string) || null
  const description = (formData.get("description") as string) || null

  if (!name || !category) return { error: "Name and category are required" }

  const { data, error } = await db
    .from("document_templates")
    .insert({
      org_id: orgId,
      scope: "organisation",
      template_type: templateType,
      name,
      category,
      body_html: bodyHtml || null,
      subject,
      description,
      comms_class: "correspondence", // agency-authored templates are always editable correspondence (BUILD_70)
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/settings/templates")
  return { id: data.id }
}

/** "Customise" a system template → an org-owned editable copy linked back to the master (BUILD_70).
 *  Same name (no "(copy)") + same comms_class; the loader hides the master once a customisation exists,
 *  so the agent only ever sees one version. Statutory masters are NOT customisable here (Phase 3 / legal). */
export async function customiseSystemTemplate(
  templateId: string
): Promise<{ error?: string; id?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const { data: source, error: fetchError } = await db
    .from("document_templates").select("*").eq("id", templateId).eq("scope", "system").single()
  if (fetchError || !source) return { error: "Template not found" }
  if (source.comms_class === "statutory") return { error: "Statutory templates can't be customised yet" }

  const { data, error } = await db
    .from("document_templates")
    .insert({
      org_id: orgId,
      scope: "organisation",
      template_type: source.template_type,
      name: source.name,
      category: source.category,
      body_html: source.body_html,
      subject: source.subject,
      description: source.description,
      whatsapp_body: source.whatsapp_body,
      body_variants: source.body_variants,
      merge_fields: source.merge_fields,
      legal_flag: source.legal_flag,
      comms_class: source.comms_class,
      customised_from: source.id,
      template_key: source.template_key, // inherit the auto-send link so the override picks up this copy
      is_deletable: true,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/settings/templates")
  return { id: data.id }
}

export async function updateDocumentTemplate(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const name = formData.get("name") as string
  const category = formData.get("category") as string
  const bodyHtml = formData.get("body_html") as string
  const subject = (formData.get("subject") as string) || null
  const description = (formData.get("description") as string) || null

  const { error } = await db
    .from("document_templates")
    .update({ name, category, body_html: bodyHtml || null, subject, description })
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("scope", "organisation")

  if (error) return { error: error.message }

  revalidatePath("/settings/templates")
  return {}
}

export async function deleteDocumentTemplate(
  id: string
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId, isAdmin } = gw
  if (!isAdmin) return { error: "Admin access required" }

  const { error } = await db
    .from("document_templates")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("scope", "organisation")
    .eq("is_deletable", true)

  if (error) return { error: error.message }

  revalidatePath("/settings/templates")
  return {}
}

export async function duplicateTemplateToOrg(
  templateId: string
): Promise<{ error?: string; id?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const { data: source, error: fetchError } = await db
    .from("document_templates")
    .select("*")
    .eq("id", templateId)
    .single()

  if (fetchError || !source) return { error: "Template not found" }

  const { data, error } = await db
    .from("document_templates")
    .insert({
      org_id: orgId,
      scope: "organisation",
      template_type: source.template_type,
      name: `${source.name} (copy)`,
      category: source.category,
      body_html: source.body_html,
      subject: source.subject,
      description: source.description,
      whatsapp_body: source.whatsapp_body,
      body_variants: source.body_variants,
      merge_fields: source.merge_fields,
      legal_flag: source.legal_flag,
      is_deletable: true,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/settings/templates")
  return { id: data.id }
}

export async function toggleFavourite(
  templateId: string
): Promise<{ error?: string; favourited: boolean }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, userId } = gw

  const { data: existing, error: existingError } = await db
    .from("user_template_favourites")
    .select("user_id")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .maybeSingle()
    logQueryError("toggleFavourite user_template_favourites", existingError)

  if (existing) {
    await db
      .from("user_template_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("template_id", templateId)
    return { favourited: false }
  }

  await db.from("user_template_favourites").insert({
    user_id: userId,
    template_id: templateId,
  })

  return { favourited: true }
}

export async function setWhatsAppOptIn(
  templateId: string,
  optedIn: boolean
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const { error } = await db
    .from("org_whatsapp_template_preferences")
    .upsert(
      { org_id: orgId, template_id: templateId, opted_in: optedIn },
      { onConflict: "org_id,template_id" }
    )

  if (error) return { error: error.message }
  return {}
}

export async function setWhatsAppTone(
  templateId: string,
  tone: string
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const { error } = await db
    .from("org_whatsapp_template_preferences")
    .upsert(
      { org_id: orgId, template_id: templateId, tone_variant: tone },
      { onConflict: "org_id,template_id" }
    )

  if (error) return { error: error.message }
  return {}
}

export async function uploadCustomLease(
  formData: FormData
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("create_lease")
  const { db, orgId } = gw

  const file = formData.get("file") as File | null
  if (!file) return { error: "No file provided" }

  if (file.size > 10 * 1024 * 1024) return { error: "File must be under 10MB" }

  const allowedTypes = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]
  if (!allowedTypes.includes(file.type)) {
    return { error: "Only PDF or DOCX files are accepted" }
  }

  const ext = file.name.split(".").pop() ?? "pdf"
  const storagePath = `${orgId}/custom-lease/${Date.now()}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await db.storage
    .from("lease-templates")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) return { error: uploadError.message }

  const { error: updateError } = await db
    .from("organisations")
    .update({
      custom_template_path: storagePath,
      custom_template_filename: file.name,
      custom_template_uploaded_at: new Date().toISOString(),
      custom_template_active: true,
    })
    .eq("id", orgId)

  if (updateError) return { error: updateError.message }

  revalidatePath("/settings/templates")
  return {}
}
