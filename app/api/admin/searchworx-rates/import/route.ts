/**
 * app/api/admin/searchworx-rates/import/route.ts — upload a Searchworx price-list export as rate observations
 *
 * Route:  POST /api/admin/searchworx-rates/import
 * Auth:   isAdminAuthenticated() (ADMIN_SECRET HMAC — never exposed to agents)
 * Data:   inserts searchworx_rate_observations via importPriceList; audit_log row under PLATFORM_ORG_ID
 * Notes:  ADDENDUM_14V §3.2a / §7 step 5. Body: { filename, csv, vendor_effective_date (YYYY-MM-DD) }.
 *         The upload records EVIDENCE only — it never writes searchworx_rates; the daily searchworx-rate-sync
 *         cron decides whether a rate moves (§3.3). A list with any rejected line commits nothing (422).
 *         Audit (ruled 2026-10-01): audit_log.org_id is NOT NULL and a price list has no customer org, so the
 *         platform act is attributed to PLATFORM_ORG_ID — never a literal. record_id is this import's id,
 *         which every observation it wrote carries in raw.import_id.
 */
import { randomUUID } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import { isAdminAuthenticated } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { importPriceList } from "@/lib/searchworx/rates/importPriceList"
import { recordAudit } from "@/lib/audit/recordAudit"
import { PLATFORM_ORG_ID } from "@/lib/comms/platform-org"

const MAX_CSV_BYTES = 512 * 1024
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const filename = typeof body?.filename === "string" ? body.filename.trim().slice(0, 200) : ""
  const csv = typeof body?.csv === "string" ? body.csv : ""
  const vendorEffectiveDate = typeof body?.vendor_effective_date === "string" ? body.vendor_effective_date : ""
  if (!filename || !csv || !ISO_DATE.test(vendorEffectiveDate)) {
    return NextResponse.json({ error: "filename, csv and vendor_effective_date (YYYY-MM-DD) are required" }, { status: 400 })
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "price list is larger than 512 KB — not a Searchworx export" }, { status: 413 })
  }

  const db = await createServiceClient()
  const importId = randomUUID()
  let result
  try {
    result = await importPriceList(db, { csv, filename, vendorEffectiveDate, importId })
  } catch (e) {
    console.error("[admin/searchworx-rates/import] observation insert failed:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "observations could not be written — nothing was imported" }, { status: 500 })
  }

  const { report } = result
  const summary = {
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    recorded: result.ok ? result.recorded : 0,
    mapped: report.mapped.map((m) => ({ product_key: m.productKey, cents: m.cents, confidence: m.confidence, line: m.line })),
    unmapped: report.unmapped.map((u) => ({ name: u.name, cents: u.cents, line: u.line })),
    rejected: report.rejected,
    stale_on_arrival: result.ok && result.staleOnArrival
      ? { vendor_effective_date: result.staleOnArrival.vendorEffectiveDate, age_days: result.staleOnArrival.ageDays, stale_after_days: result.staleOnArrival.staleAfterDays }
      : null,
  }

  if (result.ok) {
    await recordAudit(db, {
      orgId: PLATFORM_ORG_ID,
      action: "INSERT",
      table: "searchworx_rate_observations",
      recordId: importId,
      after: {
        action: "searchworx_pricelist_import",
        filename,
        vendor_effective_date: vendorEffectiveDate,
        recorded: result.recorded,
        unmapped: report.unmapped.length,
      },
    })
  }

  return NextResponse.json(summary, { status: result.ok ? 200 : 422 })
}
