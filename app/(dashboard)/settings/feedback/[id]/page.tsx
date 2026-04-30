/**
 * app/(dashboard)/settings/feedback/[id]/page.tsx — Feedback submission detail for org admin
 *
 * Route:  /settings/feedback/[id]
 * Auth:   gateway (org admin — owner or admin role)
 * Data:   feedback_submissions + feedback_replies via getFeedbackSubmissionById
 */
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { gatewaySSR } from "@/lib/supabase/gateway"
import { getFeedbackSubmissionById } from "@/lib/feedback/queries"
import { FeedbackDetail } from "@/components/feedback/FeedbackDetail"

interface Props {
  params: Promise<{ id: string }>
}

export default async function FeedbackDetailPage({ params }: Props) {
  const { id } = await params
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  if (!gw.isAdmin) redirect("/settings")

  const submission = await getFeedbackSubmissionById(id)
  if (!submission || submission.org_id !== gw.orgId) notFound()

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        href="/settings/feedback"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feedback
      </Link>
      <FeedbackDetail submission={submission} isAdmin={gw.isAdmin} />
    </div>
  )
}
