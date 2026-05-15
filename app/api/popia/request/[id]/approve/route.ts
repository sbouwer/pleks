/**
 * app/api/popia/request/[id]/approve/route.ts — Agency approves a data-subject request
 *
 * Route:  POST /api/popia/request/:id/approve
 * Auth:   Agency staff (org member, is_admin = true for erasure/nuke) + MFA-fresh
 * Data:   data_subject_requests (UPDATE), popia_exports (INSERT via export.ts),
 *         erasure cascade via erasure.ts
 * Notes:  D-POPIA-10: erasure and nuke approvals require MFA-fresh (BUILD_62).
 *         Soft fallback: MFA check skipped pre-BUILD_62 (grep: requireMfaFresh).
 *         Execution is inline — approve triggers the export or erasure synchronously.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { transitionRequestStatus } from "@/lib/popia/requests"
import { generateExport } from "@/lib/popia/export"
import { executeErasure } from "@/lib/popia/erasure"
import type { DataSubjectRequest } from "@/lib/popia/requests"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    notes?: string
    include_ai_narrative?: boolean
  }

  const db = createServiceClient()
  const { data: request, error } = await (await db)
    .from("data_subject_requests")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 })
  }

  // Must be org staff
  const { data: membership } = await (await db)
    .from("user_orgs")
    .select("is_admin, role")
    .eq("user_id", user.id)
    .eq("org_id", request.org_id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const dsr = request as DataSubjectRequest

  // Destructive actions require admin role (D-POPIA-10)
  if (["erasure", "nuke"].includes(dsr.request_type) && !membership.is_admin) {
    return NextResponse.json({ error: "Admin role required for erasure/nuke approval" }, { status: 403 })
  }

  // requireMfaFresh goes here when BUILD_62 ships — soft placeholder
  // const mfaOk = await requireMfaFresh(user.id, "popia_approve")
  // if (!mfaOk) return NextResponse.json({ error: "mfa_required" }, { status: 403 })

  // Transition to approved
  await transitionRequestStatus(id, "approved", {
    actor_user_id: user.id,
    notes: body.notes,
  })

  let result: Record<string, unknown> = {}

  try {
    if (dsr.request_type === "access" || dsr.request_type === "portability") {
      const popia_export = await generateExport(dsr, user.id, {
        include_ai_narrative: body.include_ai_narrative ?? false,
      })
      result = { export: popia_export }
      await transitionRequestStatus(id, "completed", { actor_user_id: user.id })
    } else if (dsr.request_type === "erasure" || dsr.request_type === "nuke") {
      const erasureResult = await executeErasure(dsr, user.id)
      result = { erasure: erasureResult }
      await transitionRequestStatus(id, "completed", { actor_user_id: user.id })
    } else {
      // For objection, restriction, correction, consent_withdrawal — mark completed
      // (manual execution by agency outside the system, or handled by separate workflow)
      await transitionRequestStatus(id, "completed", { actor_user_id: user.id })
    }
  } catch (err) {
    console.error(`[popia/approve] execution failed for ${id}:`, err)
    return NextResponse.json({ error: "Approval recorded but execution failed — check logs" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...result })
}
