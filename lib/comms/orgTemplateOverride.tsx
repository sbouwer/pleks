/**
 * lib/comms/orgTemplateOverride.tsx — BUILD_70 Phase 2b: org-customised correspondence body override
 *
 * Notes:  If the org has "Customised" the (non-statutory) correspondence template for this registry key,
 *         return its branded HTML — body_html resolved with mergeValues, wrapped in the email layout.
 *         Else null → the caller renders the React-Email default unchanged. OPT-IN: only runs when the
 *         caller passes mergeValues, so every existing send is untouched. Statutory keys NEVER override
 *         (that's the Phase-3 DocuSeal path); the helper double-guards on comms_class too.
 */
import { render } from "@react-email/components"
import type { SupabaseClient } from "@supabase/supabase-js"
import { EmailLayout, type OrgBranding } from "@/lib/comms/templates/layout"
import { resolveMergeFields } from "@/lib/pdf/documentLetter"

export async function resolveOrgCorrespondenceHtml(
  db: SupabaseClient,
  orgId: string,
  templateKey: string,
  mergeValues: Record<string, string>,
  branding: OrgBranding,
): Promise<string | null> {
  const { data, error } = await db
    .from("document_templates")
    .select("body_html, comms_class")
    .eq("org_id", orgId)
    .eq("scope", "organisation")
    .eq("template_key", templateKey)
    .not("body_html", "is", null)
    .limit(1)
    .maybeSingle()
  if (error || !data || data.comms_class === "statutory" || !data.body_html) return null

  const body = resolveMergeFields(data.body_html as string, mergeValues)
  return render(
    <EmailLayout preview="" branding={branding}>
      <div dangerouslySetInnerHTML={{ __html: body }} />
    </EmailLayout>,
  )
}
