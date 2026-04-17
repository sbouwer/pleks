import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { TemplatesClient } from "./TemplatesClient"

export interface DocumentTemplate {
  id: string
  scope: "system" | "organisation"
  template_type: "letter" | "email" | "whatsapp"
  name: string
  description: string | null
  category: string
  body_html: string | null
  subject: string | null
  whatsapp_body: string | null
  body_variants: Record<string, string> | null
  legal_flag: "wet_ink_only" | "aes_recommended" | null
  merge_fields: string[] | null
  usage_count: number
  last_used_at: string | null
  is_deletable: boolean
  created_at: string
}

export default async function TemplatesPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const { data: rawTemplates } = await db
    .from("document_templates")
    .select(
      "id, scope, template_type, name, description, category, body_html, subject, whatsapp_body, body_variants, legal_flag, merge_fields, usage_count, last_used_at, is_deletable, created_at"
    )
    .or(`scope.eq.system,org_id.eq.${orgId}`)
    .order("scope", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true })

  const templates: DocumentTemplate[] = (rawTemplates ?? []) as DocumentTemplate[]

  const { data: rawFavourites } = await db
    .from("template_favourites")
    .select("template_id")
    .eq("user_id", gw.userId)

  const favouriteIds = new Set(
    (rawFavourites ?? []).map((f: { template_id: string }) => f.template_id)
  )

  const { data: rawOrg } = await db
    .from("organisations")
    .select(
      "custom_template_path, custom_template_filename, custom_template_uploaded_at, tier"
    )
    .eq("id", orgId)
    .single()

  const orgCustomLease = rawOrg as {
    custom_template_path: string | null
    custom_template_filename: string | null
    custom_template_uploaded_at: string | null
    tier: string | null
  } | null

  return (
    <TemplatesClient
      templates={templates}
      favouriteIds={Array.from(favouriteIds)}
      orgTier={orgCustomLease?.tier ?? null}
      customTemplatePath={orgCustomLease?.custom_template_path ?? null}
      customTemplateFilename={orgCustomLease?.custom_template_filename ?? null}
      customTemplateUploadedAt={
        orgCustomLease?.custom_template_uploaded_at ?? null
      }
    />
  )
}
