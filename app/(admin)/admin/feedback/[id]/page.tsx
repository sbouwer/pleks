/**
 * app/(admin)/admin/feedback/[id]/page.tsx — Platform admin feedback detail view
 *
 * Route:  /admin/feedback/[id]
 * Auth:   pleks_admin_token cookie == ADMIN_SECRET
 * Data:   feedback_submissions + feedback_replies via getFeedbackSubmissionById
 */
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { getFeedbackSubmissionById } from "@/lib/feedback/queries"
import { FeedbackDetail } from "@/components/feedback/FeedbackDetail"

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdminFeedbackDetailPage({ params }: Props) {
  const { id } = await params

  const cookieStore = await cookies()
  const token = cookieStore.get("pleks_admin_token")?.value
  if (!token || token !== process.env.ADMIN_SECRET) redirect("/admin/login")

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
