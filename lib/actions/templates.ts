"use server"

/**
 * lib/actions/templates.ts — document-template CRUD, system-template customisation, favourites, WhatsApp prefs, custom-lease upload
 *
 * Auth:   requireAgentWriteAccess("send_manual_comm") (uploadCustomLease uses "create_lease");
 *         mutating template ops additionally require the "documents" capability (hasCapability)
 * Data:   document_templates, user_template_favourites, org_whatsapp_template_preferences, organisations;
 *         custom leases upload to the "lease-templates" storage bucket
 * Notes:  customiseSystemTemplate forks a system master into an org-owned editable copy; statutory
 *         masters are not customisable yet (BUILD_70)
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import { revalidatePath } from "next/cache"

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

export async function setWhatsAppTone(
  templateId: string,
  tone: string
): Promise<{ error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  if (!(await hasCapability(gw, "documents"))) throw new Error("Documents access is required")
  const { db, orgId } = gw

  const { error } = await db
    .from("org_whatsapp_template_preferences")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- upsert keyed on onConflict (org_id,template_id) with org_id: orgId from requireAgentWriteAccess — cannot merge into another org's row
    .upsert(
      { org_id: orgId, template_id: templateId, tone_variant: tone },
      { onConflict: "org_id,template_id" }
    )

  if (error) return { error: error.message }
  return {}
}

