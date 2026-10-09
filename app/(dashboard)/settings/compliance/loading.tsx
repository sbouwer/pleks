/**
 * app/(dashboard)/settings/compliance/loading.tsx — the Compliance page's own skeleton
 *
 * Route:  /settings/compliance
 * Notes:  Mirrors the SSR paint: a DetailPageLayout category header (no pill, no facts, one sub line, no tabs, no
 *         action) and nothing under it. ComplianceSettingsClient returns null until its organisation read resolves in
 *         an effect, so no body is reserved.
 */
import { SkDetailHeader } from "@/components/ui/page-skeleton"

export default function ComplianceSettingsLoading() {
  return <SkDetailHeader pill={false} facts={0} sub={1} actions={0} />
}
