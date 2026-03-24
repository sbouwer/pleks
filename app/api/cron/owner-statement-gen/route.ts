import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { generateOwnerStatement } from "@/lib/statements/generateOwnerStatement"
import { startOfMonth, endOfMonth, subMonths } from "date-fns"

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
  const { data: properties } = await supabase
    .from("properties")
    .select("id")
    .not("owner_email", "is", null)
    .is("deleted_at", null)

  for (const property of properties || []) {
    // Skip if already generated
    const { data: existing } = await supabase
      .from("owner_statements")
      .select("id")
      .eq("property_id", property.id)
      .eq("period_month", periodFromStr)
      .limit(1)

    if (existing && existing.length > 0) continue

    await generateOwnerStatement(property.id, periodFrom, periodTo)
    generated++
  }

  return NextResponse.json({ ok: true, generated })
}
