/**
 * app/(dashboard)/settings/my-feedback/page.tsx — User's own feedback submissions
 *
 * Route:  /settings/my-feedback
 * Auth:   gateway (any authenticated dashboard user)
 * Data:   feedback_submissions filtered by submitter_id via listFeedbackSubmissions
 */
import { redirect } from "next/navigation"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { listFeedbackSubmissions } from "@/lib/feedback/queries"
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox"

export default async function MyFeedbackPage() {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")

  const submissions = await listFeedbackSubmissions({ submitterId: gw.userId })

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My feedback</h1>
        <p className="text-sm text-muted-foreground">Submissions you&apos;ve sent to the Pleks team.</p>
      </div>
      <FeedbackInbox submissions={submissions} detailBasePath="/settings/feedback" />
    </div>
  )
}
