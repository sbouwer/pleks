/**
 * app/(help)/help/page.tsx — Help Centre index, all authenticated roles (BUILD_68, OQ1 = A)
 *
 * Route:  /help
 * Auth:   any authenticated role (ROUTE_MANIFEST "/help" → all roles, AAL1). The (help) route
 *         group carries NO agent chrome (no Sidebar / PortfolioPrefetcher / agent MfaGuard) —
 *         that's why it lives here, not in (dashboard) which is agent-only.
 * Data:   lib/help/help-data.ts (typed corpus, role-scoped). No DB (D-HELP-01).
 * Notes:  Active role resolved from the session (resolveUserMembership), never identity-in-URL
 *         (D-HELP-10); back-link target derives from PORTAL_DEFAULTS[role]. /help/fitscore-report
 *         stays agent-only under its own (more-specific) manifest rule and keeps its URL — it's
 *         stamped into generated screening PDFs (AttestationCard). Coexists by prefix (D-HELP-19).
 */
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { resolveUserMembership, SovereignMembershipViolation } from "@/lib/auth/membership"
import { PORTAL_DEFAULTS } from "@/lib/auth/decisions"
import { HelpCentre } from "@/components/help/HelpCentre"
import type { HelpRole } from "@/lib/help/help-data"

export default async function HelpPage() {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    userId = (await supabase.auth.getUser()).data.user?.id ?? null
  } catch { /* expired token mid-flow → treat as signed out */ }
  if (!userId) redirect("/login")

  // Resolve the session's active role to scope content (D-HELP-02). Default to "tenant" for an
  // authenticated user without a workspace membership (e.g. an applicant) so the help page never
  // 500s and they still get the general entries.
  let role: HelpRole = "tenant"
  try {
    const m = await resolveUserMembership(userId)
    if (m?.portalClass) role = m.portalClass as HelpRole
  } catch (e) {
    if (!(e instanceof SovereignMembershipViolation)) {
      console.error("[help] role resolution failed:", e instanceof Error ? e.message : "unknown")
    }
  }

  return <HelpCentre role={role} backHref={PORTAL_DEFAULTS[role]} />
}
