/**
 * app/(dashboard)/settings/feedback/page.tsx — Org feedback inbox for org admins
 *
 * Route:  /settings/feedback
 * Auth:   gateway (org admin — owner or admin role)
 * Data:   feedback_submissions filtered by org_id via listFeedbackSubmissions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { listFeedbackSubmissions } from "@/lib/feedback/queries"
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox"

export default async function FeedbackInboxPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!gw.isAdmin) redirect("/settings")

  const submissions = await listFeedbackSubmissions({ orgId: gw.orgId })

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Feedback</h1>
        <p className="text-sm text-muted-foreground">Submissions from your team and portal users.</p>
      </div>
      <FeedbackInbox submissions={submissions} detailBasePath="/settings/feedback" />
    </div>
  )
}
