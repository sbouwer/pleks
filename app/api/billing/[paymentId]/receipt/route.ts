import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

function formatZAR(cents: number): string {
  return "R\u00a0" + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function row(label: string, value: string): string {
  return (
    "<tr>" +
    "<td style=\"padding:6px 0;color:#6b7280;font-size:13px;width:140px\">" + label + "</td>" +
    "<td style=\"padding:6px 0;font-size:13px;text-align:right\">" + value + "</td>" +
    "</tr>"
  )
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ paymentId: string }> },
) {
  const { paymentId } = await params

  // Auth check
  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const supabase = await createServiceClient()

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, org_id, amount_cents, payment_date, payment_method, reference, receipt_number, lease_id, tenant_id, invoice_id, created_at")
    .eq("id", paymentId)
    .single()

  if (paymentError || !payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 })
  }

  const [orgRes, tenantRes, invoiceRes, leaseRes] = await Promise.all([
    supabase.from("organisations").select("name, phone, email, address").eq("id", payment.org_id).maybeSingle(),
    payment.tenant_id
      ? supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type, email").eq("id", payment.tenant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    payment.invoice_id
      ? supabase.from("rent_invoices").select("invoice_number, due_date, total_amount_cents").eq("id", payment.invoice_id).maybeSingle()
      : Promise.resolve({ data: null }),
    payment.lease_id
      ? supabase.from("leases").select("units(unit_number, properties(name, address_line1, suburb, city))").eq("id", payment.lease_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const org = orgRes.data
  const tenant = tenantRes.data
  const invoice = invoiceRes.data
  const leaseData = leaseRes.data as { units: { unit_number: string; properties: { name: string; address_line1: string | null; suburb: string | null; city: string | null } | null } | null } | null

  let tenantName = "Tenant"
  if (tenant) {
    tenantName = tenant.entity_type === "company"
      ? (tenant.company_name ?? "")
      : ((tenant.first_name ?? "") + " " + (tenant.last_name ?? "")).trim()
  }

  const unit = leaseData?.units
  const property = unit?.properties
  const propertyAddress = [property?.name, property?.address_line1, property?.suburb, property?.city].filter(Boolean).join(", ")
  let unitLabel = propertyAddress
  if (unit?.unit_number) {
    unitLabel = "Unit " + unit.unit_number + (propertyAddress ? " · " + propertyAddress : "")
  }

  const methodLabel: Record<string, string> = {
    eft: "EFT", debicheck: "DebiCheck", cash: "Cash", card: "Card", bank_recon_matched: "Bank recon",
  }
  const method = methodLabel[payment.payment_method] ?? payment.payment_method

  const payDate = new Date(payment.payment_date).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
  const receiptNo = payment.receipt_number ?? "N/A"

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Receipt ${receiptNo}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; min-height: 100vh; display: flex; justify-content: center; padding: 40px 20px; }
  .page { background: #fff; width: 100%; max-width: 520px; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; }
  .header { background: #1d2939; padding: 28px 32px; }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { color: #fff; font-size: 18px; font-weight: 700; letter-spacing: -0.5px; }
  .receipt-label { color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .receipt-no { color: #fff; font-size: 13px; margin-top: 2px; font-family: monospace; }
  .amount-block { margin-top: 24px; }
  .amount-label { color: #9ca3af; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
  .amount { color: #34d399; font-size: 40px; font-weight: 700; margin-top: 4px; letter-spacing: -1px; }
  .body { padding: 28px 32px; }
  .section { margin-bottom: 24px; }
  .section-title { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #9ca3af; margin-bottom: 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; }
  .divider { height: 1px; background: #f3f4f6; margin: 20px 0; }
  .footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: center; }
  .footer-note { font-size: 11px; color: #9ca3af; }
  @media print {
    body { background: white; padding: 0; }
    .page { box-shadow: none; border-radius: 0; max-width: 100%; }
    .footer-actions { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-top">
      <div>
        <div class="logo">${org?.name ?? "Pleks"}</div>
        ${org?.email ? '<div style="color:#9ca3af;font-size:12px;margin-top:2px">' + org.email + '</div>' : ""}
      </div>
      <div style="text-align:right">
        <div class="receipt-label">Receipt</div>
        <div class="receipt-no">${receiptNo}</div>
      </div>
    </div>
    <div class="amount-block">
      <div class="amount-label">Amount paid</div>
      <div class="amount">${formatZAR(payment.amount_cents)}</div>
    </div>
  </div>

  <div class="body">
    <div class="section">
      <div class="section-title">Payment details</div>
      <table>
        ${row("Date", payDate)}
        ${row("Method", method)}
        ${payment.reference ? row("Reference", payment.reference) : ""}
        ${invoice ? row("Invoice", invoice.invoice_number ?? "—") : ""}
        ${invoice ? row("Invoice due", new Date(invoice.due_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })) : ""}
        ${invoice ? row("Invoice total", formatZAR(invoice.total_amount_cents)) : ""}
      </table>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-title">Received from</div>
      <table>
        ${row("Tenant", tenantName)}
        ${unitLabel ? row("Property", unitLabel) : ""}
        ${tenant?.email ? row("Email", tenant.email) : ""}
      </table>
    </div>
  </div>

  <div class="footer">
    <span class="footer-note">Generated by Pleks · ${new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</span>
    <div class="footer-actions" style="display:flex;gap:8px">
      <button onclick="window.print()" style="background:#1d2939;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:12px;cursor:pointer">Print / Save PDF</button>
    </div>
  </div>
</div>
</body>
</html>`

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}
