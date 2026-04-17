"use server"

import { gateway } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"

export async function createDocumentTemplate(
  formData: FormData
): Promise<{ error?: string; id?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
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
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/settings/communication/templates")
  return { id: data.id }
}

export async function updateDocumentTemplate(
  id: string,
  formData: FormData
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
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

  revalidatePath("/settings/communication/templates")
  return {}
}

export async function deleteDocumentTemplate(
  id: string
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { error } = await db
    .from("document_templates")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId)
    .eq("scope", "organisation")
    .eq("is_deletable", true)

  if (error) return { error: error.message }

  revalidatePath("/settings/communication/templates")
  return {}
}

export async function duplicateTemplateToOrg(
  templateId: string
): Promise<{ error?: string; id?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
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

  revalidatePath("/settings/communication/templates")
  return { id: data.id }
}

export async function toggleFavourite(
  templateId: string
): Promise<{ error?: string; favourited: boolean }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated", favourited: false }
  const { db, userId } = gw

  const { data: existing } = await db
    .from("template_favourites")
    .select("id")
    .eq("user_id", userId)
    .eq("template_id", templateId)
    .maybeSingle()

  if (existing) {
    await db
      .from("template_favourites")
      .delete()
      .eq("user_id", userId)
      .eq("template_id", templateId)
    return { favourited: false }
  }

  await db.from("template_favourites").insert({
    user_id: userId,
    template_id: templateId,
  })

  return { favourited: true }
}

export async function setWhatsAppOptIn(
  templateId: string,
  optedIn: boolean
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { error } = await db
    .from("whatsapp_template_prefs")
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
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db, orgId } = gw

  const { error } = await db
    .from("whatsapp_template_prefs")
    .upsert(
      { org_id: orgId, template_id: templateId, tone },
      { onConflict: "org_id,template_id" }
    )

  if (error) return { error: error.message }
  return {}
}

export async function uploadCustomLease(
  formData: FormData
): Promise<{ error?: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
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
    })
    .eq("id", orgId)

  if (updateError) return { error: updateError.message }

  revalidatePath("/settings/communication/templates")
  return {}
}
