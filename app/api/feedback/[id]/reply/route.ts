/**
 * app/api/feedback/[id]/reply/route.ts — Add a reply to a feedback submission
 *
 * Route:  POST /api/feedback/[id]/reply
 * Auth:   Submitter (non-admin reply) or platform admin / org admin (admin reply)
 * Data:   feedback_replies via service client
 * Notes:  Admin reply triggers feedback.reply email to submitter.
 */
import { NextRequest } from "next/server"
import { cookies } from "next/headers"
import { createClient, createServiceClient } from "@/lib/supabase/server"
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

  // Determine if this is an admin reply
  const cookieStore = await cookies()
  const adminToken = cookieStore.get("pleks_admin_token")?.value
  const isPlatformAdmin = !!adminToken && adminToken === process.env.ADMIN_SECRET

  let isAdminReply = isPlatformAdmin

  if (!isPlatformAdmin) {
    // Check if org admin
    const service = await createServiceClient()
    const { data: membership } = await service
      .from("user_orgs")
      .select("role")
      .eq("user_id", user.id)
      .eq("org_id", submission.org_id)
      .is("deleted_at", null)
      .maybeSingle()
    if (membership && ["owner", "admin"].includes((membership as { role: string }).role)) {
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
