/**
 * app/api/cron/owner-statement-gen/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { generateOwnerStatement } from "@/lib/statements/generateOwnerStatement"
import { startOfMonth, endOfMonth, subMonths } from "date-fns"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function GET(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const lastMonth = subMonths(new Date(), 1)
  const periodFrom = startOfMonth(lastMonth)
  const periodTo = endOfMonth(lastMonth)
  const periodFromStr = periodFrom.toISOString().split("T")[0]
  let generated = 0

  // Get all properties with owner_email
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id")
    .not("owner_email", "is", null)
    .is("deleted_at", null)
    logQueryError("GET properties", propertiesError)

  for (const property of properties || []) {
    // Skip if already generated
    const { data: existing, error: existingError } = await supabase
      .from("owner_statements")
      .select("id")
      .eq("property_id", property.id)
      .eq("period_month", periodFromStr)
      .limit(1)
    logQueryError("GET owner_statements", existingError)

    if (existing && existing.length > 0) continue

    await generateOwnerStatement(property.id, periodFrom, periodTo)
    generated++
  }

  return NextResponse.json({ ok: true, generated })
}
