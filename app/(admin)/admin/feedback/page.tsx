/**
 * app/(admin)/admin/feedback/page.tsx — Platform admin feedback inbox (all orgs)
 *
 * Route:  /admin/feedback
 * Auth:   pleks_admin_token cookie == ADMIN_SECRET
 * Data:   feedback_submissions (all orgs) via listFeedbackSubmissions
 */
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { listFeedbackSubmissions } from "@/lib/feedback/queries"
import { FeedbackInbox } from "@/components/feedback/FeedbackInbox"

export default async function AdminFeedbackPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  if (!token || token !== process.env.ADMIN_SECRET) redirect("/admin/login")

  const submissions = await listFeedbackSubmissions({ limit: 200 })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Feedback — all orgs</h1>
        <p className="text-sm text-muted-foreground">
          {submissions.length} submission{submissions.length === 1 ? "" : "s"} total.
        </p>
      </div>
      <FeedbackInbox
        submissions={submissions}
        detailBasePath="/admin/feedback"
        showRole
      />
    </div>
  )
}
