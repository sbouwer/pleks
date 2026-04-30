/**
 * app/(admin)/admin/feedback/[id]/page.tsx — Platform admin feedback detail view
 *
 * Route:  /admin/feedback/[id]
 * Auth:   pleks_admin_token cookie == ADMIN_SECRET
 * Data:   feedback_submissions + feedback_replies via getFeedbackSubmissionById
 */
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireAdminAuth } from "@/lib/admin/auth"
import { getFeedbackSubmissionById } from "@/lib/feedback/queries"
import { FeedbackDetail } from "@/components/feedback/FeedbackDetail"

export default async function AdminFeedbackDetailPage({ params }: Readonly<{ params: Promise<{ id: string }> }>) {
  const { id } = await params
  await requireAdminAuth()

  const submission = await getFeedbackSubmissionById(id)
  if (!submission) notFound()

  return (
    <div className="max-w-2xl space-y-4">
      <Link
        href="/admin/feedback"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to feedback inbox
      </Link>
      <FeedbackDetail submission={submission} isAdmin />
    </div>
  )
}
