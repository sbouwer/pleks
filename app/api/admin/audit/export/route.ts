/**
 * app/api/admin/audit/export/route.ts — Queues an async audit log CSV export job
 *
 * Route:  POST /api/admin/audit/export
 * Auth:   requireAdminAuth() — HMAC pleks_admin_token cookie
 * Notes:  Inserts a row into audit_exports; the process-audit-exports cron does the work.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"

export async function POST(req: NextRequest) {
  await requireAdminAuth()

  const body = await req.json().catch(() => ({}))
  const { start, end, action, table } = body as {
    start?: string; end?: string; action?: string[]; table?: string[]
  }

  const cookieStore = await cookies()
  const requestedBy = cookieStore.get("pleks_admin_token")?.value?.slice(0, 16) ?? "admin"

  const db = await createServiceClient()
  const { data, error } = await db
    .from("audit_exports")
    .insert({
      requested_by: requestedBy,
      filter_params: {
        startDate: start ?? null,
        endDate:   end ?? null,
        action:    action ?? [],
        tableName: table ?? [],
      },
    })
    .select("id")
    .single()

  if (error) {
    console.error("[audit/export] insert failed:", error.message)
    return NextResponse.json({ error: "Failed to queue export" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, jobId: data.id })
}
