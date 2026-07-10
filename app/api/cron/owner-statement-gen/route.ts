/**
 * app/api/cron/owner-statement-gen/route.ts — generate last month's owner statements + notify owners
 *
 * Route:  GET /api/cron/owner-statement-gen
 * Auth:   x-cron-secret header — runs from the daily orchestrator on the 2nd of each month
 * Data:   properties, owner_statements via service client; generateOwnerStatement; sendEmail (statement.ready)
 * Notes:  One statement per property-with-owner_email per month (idempotent — skips if already generated).
 *         On a NEW statement, emails the owner a statement.ready notice linking to the tokenised
 *         /owner/statement/[token] view (owners need no portal account; portal_token + 90-day expiry are
 *         DB defaults). Notification only — the financials stay behind the secure link. Sends are
 *         best-effort: a failed email never blocks generation (settled + counted, not thrown).
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { generateOwnerStatement } from "@/lib/statements/generateOwnerStatement"
import { buildStatementReadyElement } from "@/lib/statements/statementReadyEmail"
import { sendEmail, buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { requireCronAuth } from "@/lib/cron/auth"
import { addCalendarMonths, fmtZA, monthEnd, monthStart, saTodayISO } from "@/lib/dates"
import { APP_URL } from "@/lib/env"

export async function GET(req: Request) {
  // Dropped the `?secret=` query-param fallback: secrets in URLs leak into access logs, proxy logs, and
  // browser history. Nothing invoked it that way (the daily orchestrator passes the header in-process,
  // and the cPanel crons use -H "x-cron-secret"), so this closes the hole without breaking a caller.
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createServiceClient()
  // Calendar dates: date-fns startOfMonth is LOCAL midnight, and slicing that in UTC named the last day
  // of the month BEFORE the one being statemented.
  const periodFrom = addCalendarMonths(monthStart(saTodayISO()), -1)
  const periodTo = monthEnd(periodFrom)
  const periodFromStr = periodFrom
  const statementMonth = fmtZA(periodFrom, { month: "long", year: "numeric" })
  let generated = 0
  const sends: Promise<unknown>[] = []   // best-effort owner notices — collected + settled, never thrown

  // All properties with an owner email on file.
  const { data: properties, error: propertiesError } = await supabase
    .from("properties")
    .select("id, name, org_id, owner_email, owner_name")
    .not("owner_email", "is", null)
    .is("deleted_at", null)
  logQueryError("owner-statement-gen properties", propertiesError)

  for (const property of properties || []) {
    // Skip if this property's statement for the period already exists (idempotent).
    const { data: existing, error: existingError } = await supabase
      .from("owner_statements")
      .select("id")
      .eq("property_id", property.id)
      .eq("period_month", periodFromStr)
      .limit(1)
    logQueryError("owner-statement-gen owner_statements", existingError)

    if (existing && existing.length > 0) continue

    const statement = await generateOwnerStatement(property.id, periodFrom, periodTo)
    if (!statement) continue
    generated++

    // Notify the owner that their statement is ready (statement.ready) — tokenised, no portal account needed.
    const ownerEmail = property.owner_email as string | null
    const portalToken = statement.portal_token as string | null
    if (ownerEmail && portalToken) {
      const branding = buildBranding(await fetchOrgSettings(property.org_id as string))
      const propertyLabel = (property.name as string) || "your property"
      sends.push(
        sendEmail({
          orgId: property.org_id as string,
          templateKey: "statement.ready",
          to: { email: ownerEmail, name: (property.owner_name as string) ?? ownerEmail },
          subject: `Your ${statementMonth} statement for ${propertyLabel} is ready`,
          emailElement: buildStatementReadyElement({
            branding,
            ownerName: (property.owner_name as string) ?? "there",
            propertyLabel,
            statementMonth,
            statementUrl: `${APP_URL}/owner/statement/${portalToken}`,
          }),
        }),
      )
    }
  }

  const settled = await Promise.allSettled(sends)
  const notified = settled.filter((s) => s.status === "fulfilled").length
  const failed = settled.length - notified
  for (const s of settled) {
    if (s.status === "rejected") console.error("owner-statement-gen notify failed:", s.reason)
  }

  return NextResponse.json({ ok: true, generated, notified, failed })
}
