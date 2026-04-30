/**
 * app/api/feedback/route.ts — Create a new feedback submission
 *
 * Route:  POST /api/feedback
 * Auth:   Any authenticated Supabase user — resolves role + org from session tables
 * Data:   feedback_submissions via service client
 * Notes:  Rate-limited to 5 submissions per user per 24 hours.
 *         Role is resolved server-side (user_orgs → tenants → landlords → contractors).
 */
import { NextRequest } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { isFeedbackRateLimited } from "@/lib/feedback/rate-limit"
import { createFeedbackSubmission, type FeedbackCategory, type FeedbackRole } from "@/lib/feedback/queries"

const VALID_CATEGORIES = new Set<FeedbackCategory>(["bug", "feature", "general", "billing", "ux", "praise"])

async function resolveSubmitterContext(
  userId: string
): Promise<{ orgId: string; role: FeedbackRole } | null> {
  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
  if (membership) return { orgId: (membership as { org_id: string }).org_id, role: "agent" }

  const { data: tenant } = await service
    .from("tenants")
    .select("org_id")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
  if (tenant) return { orgId: (tenant as { org_id: string }).org_id, role: "tenant" }

  const { data: landlord } = await service
    .from("landlords")
    .select("org_id")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
  if (landlord) return { orgId: (landlord as { org_id: string }).org_id, role: "landlord" }

  const { data: contractor } = await service
    .from("contractors")
    .select("org_id")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
  if (contractor) return { orgId: (contractor as { org_id: string }).org_id, role: "supplier" }

  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 })

  if (await isFeedbackRateLimited(user.id)) {
    return Response.json({ error: "Rate limit exceeded — 5 submissions per 24 hours" }, { status: 429 })
  }

  const ctx = await resolveSubmitterContext(user.id)
  if (!ctx) return Response.json({ error: "Forbidden" }, { status: 403 })

  let parsed: Record<string, unknown>
  try { parsed = await req.json() as Record<string, unknown> }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { category, subject, body, rating } = parsed

  if (!VALID_CATEGORIES.has(category as FeedbackCategory)) {
    return Response.json({ error: "Invalid category" }, { status: 400 })
  }
  if (typeof subject !== "string" || subject.trim().length < 3 || subject.trim().length > 200) {
    return Response.json({ error: "Subject must be 3–200 characters" }, { status: 400 })
  }
  if (typeof body !== "string" || body.trim().length < 10 || body.trim().length > 5000) {
    return Response.json({ error: "Body must be 10–5000 characters" }, { status: 400 })
  }
  if (rating !== undefined && rating !== null) {
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return Response.json({ error: "Rating must be an integer 1–5" }, { status: 400 })
    }
  }

  const result = await createFeedbackSubmission({
    orgId:       ctx.orgId,
    submitterId: user.id,
    role:        ctx.role,
    category:    category as FeedbackCategory,
    subject:     subject.trim(),
    body:        body.trim(),
    rating:      typeof rating === "number" ? rating : null,
  })

  if (!result) return Response.json({ error: "Failed to save feedback" }, { status: 500 })
  return Response.json({ ok: true, id: result.id }, { status: 201 })
}
