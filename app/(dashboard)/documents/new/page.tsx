import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { DocumentEditorClient } from "./DocumentEditorClient"
import type { DocumentTemplate } from "@/app/(dashboard)/settings/communication/templates/page"

interface LeaseContext {
  leaseId: string
  tenantName: string
  unitNumber: string
  propertyName: string
  rentCents: number
}

interface SignatureContext {
  storagePath: string
  signedUrl: string | null
}

interface PageProps {
  searchParams: Promise<{
    template?: string
    lease?: string
    property?: string
  }>
}

export default async function NewDocumentPage({ searchParams }: PageProps) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const params = await searchParams
  const templateId = params.template ?? null
  const leaseId = params.lease ?? null

  // Load all org + system templates for the selector
  const { data: rawTemplates } = await db
    .from("document_templates")
    .select(
      "id, scope, template_type, name, description, category, body_html, subject, whatsapp_body, body_variants, legal_flag, merge_fields, usage_count, last_used_at, is_deletable, created_at"
    )
    .or(`scope.eq.system,org_id.eq.${orgId}`)
    .in("template_type", ["letter", "email"])
    .order("name", { ascending: true })

  const allTemplates: DocumentTemplate[] = (rawTemplates ?? []) as DocumentTemplate[]

  // Load selected template if provided
  let selectedTemplate: DocumentTemplate | null = null
  if (templateId) {
    selectedTemplate = allTemplates.find((t) => t.id === templateId) ?? null
  }

  // Load lease context if provided
  let leaseContext: LeaseContext | null = null
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
        id: string
        rent_cents: number
        tenants: { full_name: string } | null
        units: { unit_number: string; properties: { name: string } | null } | null
      }
      leaseContext = {
        leaseId: leaseData.id,
        tenantName: leaseData.tenants?.full_name ?? "Unknown tenant",
        unitNumber: leaseData.units?.unit_number ?? "",
        propertyName: leaseData.units?.properties?.name ?? "",
        rentCents: leaseData.rent_cents,
      }
    }
  }

  // Load active signature
  const { data: rawSig } = await db
    .from("user_signatures")
    .select("storage_path")
    .eq("user_id", gw.userId)
    .eq("is_active", true)
    .maybeSingle()

  let signatureContext: SignatureContext | null = null
  if (rawSig?.storage_path) {
    const { data: signed } = await db.storage
      .from("signatures")
      .createSignedUrl(rawSig.storage_path, 3600)
    signatureContext = {
      storagePath: rawSig.storage_path,
      signedUrl: signed?.signedUrl ?? null,
    }
  }

  // Load org name for letterhead
  const { data: org } = await db
    .from("organisations")
    .select("name, brand_logo_path, brand_accent_color")
    .eq("id", orgId)
    .single()

  const orgName = (org as { name: string } | null)?.name ?? "Your Organisation"
  const agentName = gw.email

  return (
    <div>
      <div className="mb-4">
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <span>Documents</span>
          <span>/</span>
          <span className="text-foreground font-medium">New document</span>
        </nav>
      </div>

      <DocumentEditorClient
        allTemplates={allTemplates}
        selectedTemplate={selectedTemplate}
        leaseContext={leaseContext}
        signatureContext={signatureContext}
        orgName={orgName}
        agentName={agentName}
      />
    </div>
  )
}
