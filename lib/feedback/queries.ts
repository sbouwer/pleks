/**
 * lib/feedback/queries.ts — Server-side query helpers for feedback_submissions and feedback_replies
 *
 * Auth:   Server-only — callers must verify auth before invoking
 * Data:   feedback_submissions + feedback_replies via service client (bypasses RLS)
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { BugContext } from "@/lib/feedback/bug-context"
import { logQueryError } from "@/lib/supabase/logQueryError"

export type FeedbackStatus   = "open" | "in_progress" | "resolved" | "wont_fix"
export type FeedbackCategory = "bug" | "feature" | "general" | "billing" | "ux" | "praise"
export type FeedbackRole     = "landlord" | "tenant" | "supplier" | "agent"

export interface FeedbackSubmission {
  id:          string
  org_id:      string
  submitter_id: string
  role:        FeedbackRole
  category:    FeedbackCategory
  subject:     string
  body:        string
  rating:      number | null
  status:      FeedbackStatus
  admin_note:  string | null
  created_at:  string
  updated_at:  string
}

export interface FeedbackReply {
  id:             string
  submission_id:  string
  author_id:      string
  body:           string
  is_admin_reply: boolean
  created_at:     string
}

/**
 * Resolves the org + role for a feedback/bug submitter from their auth user id.
 * Shared by /api/feedback and /api/feedback/bug. Checks membership tables in
 * priority order: agent (user_orgs) → tenant → landlord → supplier (contractor).
 * Returns null if the user belongs to no org (caller should 403).
 */
export async function resolveSubmitterContext(
  userId: string
): Promise<{ orgId: string; role: FeedbackRole } | null> {
  const service = await createServiceClient()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
    logQueryError("resolveSubmitterContext user_orgs", membershipError)
  if (membership) return { orgId: (membership as { org_id: string }).org_id, role: "agent" }

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .select("org_id")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
    logQueryError("resolveSubmitterContext tenants", tenantError)
  if (tenant) return { orgId: (tenant as { org_id: string }).org_id, role: "tenant" }

  const { data: landlord, error: landlordError } = await service
    .from("landlords")
    .select("org_id")
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle()
    logQueryError("resolveSubmitterContext landlords", landlordError)
  if (landlord) return { orgId: (landlord as { org_id: string }).org_id, role: "landlord" }

  const { data: contractor, error: contractorError } = await service
    .from("contractors")
    .select("org_id")
    .eq("auth_user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
    logQueryError("resolveSubmitterContext contractors", contractorError)
  if (contractor) return { orgId: (contractor as { org_id: string }).org_id, role: "supplier" }

  return null
}

export async function createFeedbackSubmission(data: {
  orgId:       string
  submitterId: string
  role:        FeedbackRole
  category:    FeedbackCategory
  subject:     string
  body:        string
  rating?:     number | null
}): Promise<FeedbackSubmission | null> {
  const service = await createServiceClient()
  const { data: result, error } = await service
    .from("feedback_submissions")
    .insert({
      org_id:       data.orgId,
      submitter_id: data.submitterId,
      role:         data.role,
      category:     data.category,
      subject:      data.subject,
      body:         data.body,
      rating:       data.rating ?? null,
    })
    .select()
    .single()
  if (error) {
    console.error("createFeedbackSubmission failed:", error.message)
    return null
  }
  return result as FeedbackSubmission
}

export async function listFeedbackSubmissions(opts: {
  orgId?:       string
  submitterId?: string
  status?:      FeedbackStatus
  limit?:       number
}): Promise<FeedbackSubmission[]> {
  const service = await createServiceClient()
  let query = service
    .from("feedback_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100)
  if (opts.orgId)       query = query.eq("org_id", opts.orgId)
  if (opts.submitterId) query = query.eq("submitter_id", opts.submitterId)
  if (opts.status)      query = query.eq("status", opts.status)
  const { data, error } = await query
  if (error) {
    console.error("listFeedbackSubmissions failed:", error.message)
    return []
  }
  return (data ?? []) as FeedbackSubmission[]
}

export async function getFeedbackSubmissionById(
  id: string
): Promise<(FeedbackSubmission & { replies: FeedbackReply[]; bugContext: BugContext | null }) | null> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("feedback_submissions")
    .select("*, feedback_replies(*), bug_context(*)")
    .eq("id", id)
    .single()
  if (error) {
    console.error("getFeedbackSubmissionById failed:", error.message)
    return null
  }
  const { feedback_replies: replies, bug_context: bugCtx, ...submission } =
    data as FeedbackSubmission & {
      feedback_replies: FeedbackReply[]
      bug_context: BugContext[] | BugContext | null
    }
  const bugContext = Array.isArray(bugCtx) ? (bugCtx[0] ?? null) : (bugCtx ?? null)
  return { ...submission, replies: replies ?? [], bugContext }
}

export async function updateFeedbackStatus(
  id:        string,
  status:    FeedbackStatus,
  adminNote?: string | null
): Promise<boolean> {
  const service = await createServiceClient()
  const { error } = await service
    .from("feedback_submissions")
    .update({ status, ...(adminNote !== undefined && { admin_note: adminNote }) })
    .eq("id", id)
  if (error) {
    console.error("updateFeedbackStatus failed:", error.message)
    return false
  }
  return true
}

export async function addFeedbackReply(data: {
  submissionId:  string
  authorId:      string
  body:          string
  isAdminReply:  boolean
}): Promise<FeedbackReply | null> {
  const service = await createServiceClient()
  const { data: result, error } = await service
    .from("feedback_replies")
    .insert({
      submission_id:  data.submissionId,
      author_id:      data.authorId,
      body:           data.body,
      is_admin_reply: data.isAdminReply,
    })
    .select()
    .single()
  if (error) {
    console.error("addFeedbackReply failed:", error.message)
    return null
  }
  return result as FeedbackReply
}

export async function getTodayFeedbackDigest(): Promise<FeedbackSubmission[]> {
  const service = await createServiceClient()
  const since = new Date()
  since.setUTCHours(0, 0, 0, 0)
  const { data, error } = await service
    .from("feedback_submissions")
    .select("*")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
  if (error) {
    console.error("getTodayFeedbackDigest failed:", error.message)
    return []
  }
  return (data ?? []) as FeedbackSubmission[]
}
