/**
 * app/api/maintenance/triage/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { triageMaintenanceRequest } from "@/lib/ai/maintenanceTriage"

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { title, description } = await req.json() as { title: string; description: string }
  if (!title?.trim() || !description?.trim()) {
    return NextResponse.json({ error: "title and description required" }, { status: 400 })
  }

  const result = await triageMaintenanceRequest(title, description)
  return NextResponse.json(result)
}
