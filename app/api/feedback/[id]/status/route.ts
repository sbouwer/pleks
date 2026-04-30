/**
 * app/api/feedback/[id]/status/route.ts — Update feedback submission status
 *
 * Route:  PATCH /api/feedback/[id]/status
 * Auth:   Org admin (owner/admin for submission's org) or platform admin
 * Data:   feedback_submissions via service client
 */
import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getFeedbackSubmissionById, updateFeedbackStatus, type FeedbackStatus } from "@/lib/feedback/queries"

const VALID_STATUSES: FeedbackStatus[] = ["open", "in_progress", "resolved", "wont_fix"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const submission = await getFeedbackSubmissionById(id)
  if (!submission) return Response.json({ error: "Not found" }, { status: 404 })

  // Platform admin bypass
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("pleks_admin_token")?.value
  const isPlatformAdmin = !!adminToken && adminToken === process.env.ADMIN_SECRET

  if (!isPlatformAdmin) {
    // Require org admin
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("user_orgs")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", submission.org_id)
      .is("deleted_at", null)
      .maybeSingle()
    if (!membership || !["owner", "admin"].includes((membership as { role: string }).role)) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  let parsed: Record<string, unknown>
  try { parsed = await req.json() as Record<string, unknown> }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { status, adminNote } = parsed

  if (!VALID_STATUSES.includes(status as FeedbackStatus)) {
    return Response.json({ error: "Invalid status" }, { status: 400 })
  }
  if (adminNote !== undefined && adminNote !== null && typeof adminNote !== "string") {
    return Response.json({ error: "adminNote must be a string or null" }, { status: 400 })
  }

  const ok = await updateFeedbackStatus(
    id,
    status as FeedbackStatus,
    adminNote as string | null | undefined
  )
  if (!ok) return Response.json({ error: "Update failed" }, { status: 500 })
  return Response.json({ ok: true })
}
