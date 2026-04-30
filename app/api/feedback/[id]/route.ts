/**
 * app/api/feedback/[id]/route.ts — Get a single feedback submission with replies
 *
 * Route:  GET /api/feedback/[id]
 * Auth:   Submitter, org admin (owner/admin in user_orgs for the submission's org), or platform admin
 * Data:   feedback_submissions + feedback_replies via service client
 */
import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { getFeedbackSubmissionById } from "@/lib/feedback/queries"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  const submission = await getFeedbackSubmissionById(id)
  if (!submission) return Response.json({ error: "Not found" }, { status: 404 })

  // Platform admin bypass
  if (await isAdminAuthenticated()) return Response.json(submission)

  // Submitter access
  if (submission.submitter_id === user.id) return Response.json(submission)

  // Org admin access (owner role or is_admin flag)
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
    return Response.json(submission)
  }

  return Response.json({ error: "Forbidden" }, { status: 403 })
}
