/**
 * app/(dashboard)/settings/templates/page.tsx — Templates (renamed from Documents) category page
 *
 * Route:  /settings/templates  (tabs: ?tab=templates|notices|leases)
 * Auth:   gatewaySSR + layout guard (documents capability + Steward+ tier)
 * Data:   document_templates (system + org) split by comms_class + real org branding + the agent's
 *         active signature (injected into correspondence previews).
 * Notes:  BUILD_70 Phase 1. comms_class is the SSOT discriminator: service → System notices (view +
 *         flavour), correspondence → editable Templates (signed), statutory → Templates view-only
 *         (Pleks-master; customisation + DocuSeal signing land in Phase 3). A system master is hidden
 *         once the org has a "Customise" copy (customised_from) — one visible version. "leases" passes
 *         through to the guarded lease editor.
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getReportBranding } from "@/lib/reports/reportBranding"
import { getUserSignature } from "@/app/(dashboard)/settings/profile/getSignature"
import { DetailPageLayout } from "@/components/detail/DetailPageLayout"
import { CategoryTabs } from "@/components/settings/CategoryTabs"
import { TEMPLATE_TABS } from "./tabs"
import type { DocumentTemplate, LetterheadBranding, AgentSignature } from "./types"
import { TemplatesManager } from "./TemplatesManager"
import { SystemNoticesPanel } from "./SystemNoticesPanel"
import { LeasesPanel } from "./LeasesPanel"

export const metadata = { title: "Templates" }

const TEMPLATE_COLS =
  "id, scope, template_type, name, description, category, body_html, subject, whatsapp_body, body_variants, legal_flag, merge_fields, usage_count, last_used_at, is_deletable, created_at, comms_class, customised_from"

export default async function TemplatesPage({ searchParams }: Readonly<{ searchParams: Promise<{ tab?: string }> }>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId, userId } = gw

  const { tab } = await searchParams
  const active = TEMPLATE_TABS.some((t) => t.id === tab) ? tab! : "templates"

  const { data: rawTemplates, error: templatesError } = await db
    .from("document_templates")
    .select(TEMPLATE_COLS)
    .or(`scope.eq.system,org_id.eq.${orgId}`)
    .order("scope", { ascending: true })
    .order("category", { ascending: true })
    .order("name", { ascending: true })
  if (templatesError) console.error("TemplatesPage templates:", templatesError.message)
  const all: DocumentTemplate[] = (rawTemplates ?? []) as DocumentTemplate[]

  // One visible version: hide a system master once the org has a "Customise" copy of it.
  const customisedFrom = new Set(all.map((t) => t.customised_from).filter(Boolean) as string[])
  const visible = all.filter((t) => !(t.scope === "system" && customisedFrom.has(t.id)))

  const service = visible.filter((t) => t.comms_class === "service")
  const letters = visible.filter((t) => t.comms_class !== "service") // correspondence + statutory

  // Real org branding for the letterhead (no PII — firm/logo/FFC/address/accent only).
  const branding = await getReportBranding(orgId)
  const { data: ffcRow, error: ffcError } = await db
    .from("organisations").select("ppra_ffc_number").eq("id", orgId).maybeSingle()
  if (ffcError) console.error("TemplatesPage ffc:", ffcError.message)
  const letterhead: LetterheadBranding = {
    orgName: branding.org_name,
    logoUrl: branding.logo_url,
    ffcNumber: (ffcRow as { ppra_ffc_number: string | null } | null)?.ppra_ffc_number ?? null,
    address: branding.address,
    accentColor: branding.accent_color,
  }

  // The sending agent's active full signature — injected into correspondence previews (BUILD_70).
  const sig = await getUserSignature(db, userId)
  const agentSignature: AgentSignature = { signedUrl: sig?.signedUrl ?? null }

  const editable = letters.filter((t) => t.comms_class === "correspondence").length

  return (
    <DetailPageLayout
      category="Settings"
      backHref="/settings"
      title="Templates"
      sub="See exactly what goes out — your branded letters & emails, plus the service messages Pleks sends automatically."
      facts={[
        { k: "Editable", v: String(editable) },
        { k: "System notices", v: String(service.length) },
        { k: "Branding", v: "Applied", tone: "ok" },
      ]}
      tabs={<CategoryTabs tabs={TEMPLATE_TABS} current={active} />}
      fill
    >
      {active === "templates" && <TemplatesManager templates={letters} branding={letterhead} agentSignature={agentSignature} />}
      {active === "notices" && <SystemNoticesPanel templates={service} branding={letterhead} />}
      {active === "leases" && <LeasesPanel />}
    </DetailPageLayout>
  )
}
