import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { formatZAR } from "@/lib/constants"
import { InvoiceActions } from "./InvoiceActions"

const STATUS_MAP: Record<string, "pending" | "completed" | "arrears" | "scheduled"> = {
  submitted: "pending",
  under_review: "pending",
  approved: "scheduled",
  pending_payment: "pending",
  paid: "completed",
  rejected: "arrears",
  owner_direct_recorded: "completed",
}

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>
}) {
  const { invoiceId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: invoice } = await supabase
    .from("supplier_invoices")
    .select("*, contractor_view(first_name, last_name, company_name, email, phone, vat_number), properties(name, address_line1), maintenance_requests(title, work_order_number)")
    .eq("id", invoiceId)
    .single()

  if (!invoice) notFound()

  const contractor = invoice.contractor_view as unknown as { first_name: string; last_name: string; company_name: string | null; email: string; phone: string; vat_number: string | null } | null
  const property = invoice.properties as unknown as { name: string; address_line1: string } | null
  const request = invoice.maintenance_requests as unknown as { title: string; work_order_number: string } | null

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/payments" className="hover:text-foreground">Payments</Link> &rsaquo; Invoice
          </p>
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-3xl">{invoice.description}</h1>
            <StatusBadge status={STATUS_MAP[invoice.status] || "pending"} />
          </div>
          {request && (
            <p className="text-muted-foreground">Related to: {request.work_order_number} — {request.title}</p>
          )}
        </div>
        <InvoiceActions invoiceId={invoiceId} status={invoice.status} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {invoice.invoice_number && (
              <div className="flex justify-between"><span className="text-muted-foreground">Invoice #</span><span>{invoice.invoice_number}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Date</span><span>{invoice.invoice_date}</span></div>
            {invoice.due_date && (
              <div className="flex justify-between"><span className="text-muted-foreground">Due</span><span>{invoice.due_date}</span></div>
            )}
            <div className="flex justify-between"><span className="text-muted-foreground">Amount (excl. VAT)</span><span>{formatZAR(invoice.amount_excl_vat_cents)}</span></div>
            {invoice.vat_amount_cents > 0 && (
              <div className="flex justify-between"><span className="text-muted-foreground">VAT (15%)</span><span>{formatZAR(invoice.vat_amount_cents)}</span></div>
            )}
            <div className="flex justify-between border-t border-border pt-2">
              <span className="font-medium">Total</span>
              <span className="font-heading text-lg">{formatZAR(invoice.amount_incl_vat_cents)}</span>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payment Source</span><span className="capitalize">{invoice.payment_source.replaceAll("_", " ")}</span></div>
            {invoice.payment_reference && (
              <div className="flex justify-between"><span className="text-muted-foreground">EFT Ref</span><span>{invoice.payment_reference}</span></div>
            )}
            {invoice.paid_at && (
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span><span>{new Date(invoice.paid_at).toLocaleDateString("en-ZA")}</span></div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Contractor</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            {contractor ? (
              <>
                <p className="font-medium">{contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim()}</p>
                <p className="text-muted-foreground">{contractor.email} · {contractor.phone}</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT Registered</span>
                  <span>{contractor.vat_number ? `Yes — ${contractor.vat_number}` : "No"}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No contractor linked.</p>
            )}
            {property && (
              <div className="pt-2 border-t border-border">
                <p className="text-muted-foreground mb-1">Property</p>
                <p>{property.name} — {property.address_line1}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
