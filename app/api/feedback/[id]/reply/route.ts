/**
 * app/api/feedback/[id]/reply/route.ts — Add a reply to a feedback submission
 *
 * Route:  POST /api/feedback/[id]/reply
 * Auth:   Submitter (non-admin reply) or platform admin / org admin (admin reply)
 * Data:   feedback_replies via service client
 * Notes:  Admin reply triggers feedback.reply email to submitter.
 */
import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { getFeedbackSubmissionById, addFeedbackReply } from "@/lib/feedback/queries"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const submission = await getFeedbackSubmissionById(id)
  if (!submission) return Response.json({ error: "Not found" }, { status: 404 })

  // Determine if this is an admin reply (platform admin or org admin with is_admin flag)
  let isAdminReply = await isAdminAuthenticated()

  if (!isAdminReply) {
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("user_orgs")
      .select("role, is_admin")
      .eq("user_id", user.id)
      .eq("org_id", submission.org_id)
      .is("deleted_at", null)
      .maybeSingle()
    const m = membership as { role: string; is_admin: boolean } | null
    if (m && (m.role === "owner" || m.is_admin === true)) {
      isAdminReply = true
    }
  }

  // Non-admin must be the submitter
  if (!isAdminReply && submission.submitter_id !== user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 })
  }

  let parsed: Record<string, unknown>
  try { parsed = await req.json() as Record<string, unknown> }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { body } = parsed
  if (typeof body !== "string" || body.trim().length < 5 || body.trim().length > 5000) {
    return Response.json({ error: "Reply must be 5–5000 characters" }, { status: 400 })
  }

  const reply = await addFeedbackReply({
    submissionId:  id,
    authorId:      user.id,
    body:          body.trim(),
    isAdminReply,
  })
  if (!reply) return Response.json({ error: "Failed to save reply" }, { status: 500 })

  return Response.json({ ok: true, reply }, { status: 201 })
}
