/**
 * app/(dashboard)/help/page.tsx — Help Centre index (BUILD_68)
 *
 * Route:  /help
 * Auth:   authenticated agent (ROUTE_MANIFEST "/help" → AGENT_ROLES, AAL1-accessible).
 * Data:   lib/help/help-data.ts (typed corpus, role-scoped). No DB (D-HELP-01).
 * Notes:  Phase 1 serves the AGENT role — /help lives in the agent (dashboard) group whose layout
 *         is agent-only, so widening to tenant/landlord/supplier (D-HELP-17/OQ1) needs its own
 *         home + a locked-routing decision. The component is role-aware so that rollout drops in.
 *         Coexists with /help/fitscore-report (D-HELP-19). Back-link resolves from PORTAL_DEFAULTS.
 */
import { HelpCentre } from "@/components/help/HelpCentre"
import { PORTAL_DEFAULTS } from "@/lib/auth/decisions"

export default function HelpPage() {
  return <HelpCentre role="agent" backHref={PORTAL_DEFAULTS.agent} />
}
