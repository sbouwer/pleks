import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { addDays, format } from "date-fns"

export async function GET(req: Request) {
  const cronSecret = req.headers.get("x-cron-secret") || new URL(req.url).searchParams.get("secret")
  if (cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const collectionDate = addDays(new Date(), 2)
  const collectionDay = collectionDate.getDate()
  let submitted = 0

  // Get active mandates with matching billing day
  const { data: mandates } = await supabase
    .from("debicheck_mandates")
    .select("id, org_id, lease_id, unit_id, amount_cents, peach_mandate_id, billing_day, first_collection_date")
    .in("status", ["authenticated", "active"])
    .eq("billing_day", collectionDay)
    .lte("first_collection_date", collectionDate.toISOString().split("T")[0])

  for (const mandate of mandates || []) {
    // Find open invoice for this lease this month
    const monthStart = new Date(collectionDate.getFullYear(), collectionDate.getMonth(), 1)
    const { data: invoice } = await supabase
      .from("rent_invoices")
      .select("id, status")
      .eq("lease_id", mandate.lease_id)
      .gte("period_from", monthStart.toISOString().split("T")[0])
      .in("status", ["open", "partial", "overdue"])
      .limit(1)
      .maybeSingle()

    if (!invoice) continue

    // Check no collection already scheduled for this invoice
    const { data: existing } = await supabase
      .from("debicheck_collections")
      .select("id")
      .eq("mandate_id", mandate.id)
      .eq("rent_invoice_id", invoice.id)
      .in("status", ["scheduled", "submitted"])
      .limit(1)

    if (existing && existing.length > 0) continue

    const merchantTxnId = `PLK-COL-${mandate.id.slice(0, 8)}-${format(collectionDate, "yyyyMM")}`

    await supabase.from("debicheck_collections").insert({
      org_id: mandate.org_id,
      mandate_id: mandate.id,
      lease_id: mandate.lease_id,
      rent_invoice_id: invoice.id,
      peach_merchant_txn_id: merchantTxnId,
      amount_cents: mandate.amount_cents,
      collection_date: collectionDate.toISOString().split("T")[0],
      description: `Rent ${format(collectionDate, "MMM yyyy")}`,
      status: "scheduled",
    })

    // TODO: Submit to Peach Payments API when credentials are configured
    submitted++
  }

  return NextResponse.json({ ok: true, submitted })
}
