import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatZAR } from "@/lib/constants"
import { MunicipalBillActions } from "./MunicipalBillActions"

export default async function MunicipalBillDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>
}) {
  const { billId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: bill } = await supabase
    .from("municipal_bills")
    .select("*, properties(name, address_line1), municipal_accounts(municipality_name, account_number)")
    .eq("id", billId)
    .single()

  if (!bill) notFound()

  const property = bill.properties as unknown as { name: string; address_line1: string } | null
  const account = bill.municipal_accounts as unknown as { municipality_name: string; account_number: string } | null
  const periodLabel = bill.billing_month
    ? new Date(bill.billing_month).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })
    : "Unknown period"

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            <Link href="/payments/municipal" className="hover:text-foreground">Municipal Bills</Link> &rsaquo; {periodLabel}
          </p>
          <h1 className="font-heading text-3xl">{account?.municipality_name || "Municipal Bill"} — {periodLabel}</h1>
          <p className="text-muted-foreground">{property?.name} · Account: {account?.account_number}</p>
        </div>
        <MunicipalBillActions billId={billId} extractionStatus={bill.extraction_status} paymentStatus={bill.payment_status} />
      </div>

      {/* Charges breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Charges</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {bill.charge_rates_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Rates</span><span>{formatZAR(bill.charge_rates_cents)}</span></div>}
            {bill.charge_water_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Water</span><span>{formatZAR(bill.charge_water_cents)}</span></div>}
            {bill.charge_sewerage_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Sewerage</span><span>{formatZAR(bill.charge_sewerage_cents)}</span></div>}
            {bill.charge_electricity_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Electricity</span><span>{formatZAR(bill.charge_electricity_cents)}</span></div>}
            {bill.charge_refuse_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Refuse</span><span>{formatZAR(bill.charge_refuse_cents)}</span></div>}
            {bill.charge_vat_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span>{formatZAR(bill.charge_vat_cents)}</span></div>}
            {bill.charge_levies_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Levies</span><span>{formatZAR(bill.charge_levies_cents)}</span></div>}
            {bill.charge_penalties_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground text-danger">Penalties</span><span className="text-danger">{formatZAR(bill.charge_penalties_cents)}</span></div>}
            {bill.charge_other_cents > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Other</span><span>{formatZAR(bill.charge_other_cents)}</span></div>}
            <div className="flex justify-between font-medium pt-2 border-t border-border">
              <span>Current Charges</span>
              <span>{formatZAR(bill.total_current_charges_cents || 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Account Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Previous Balance</span><span>{formatZAR(bill.previous_balance_cents || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payments Received</span><span className="text-success">-{formatZAR(bill.payments_received_cents || 0)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Current Charges</span><span>{formatZAR(bill.total_current_charges_cents || 0)}</span></div>
            <div className="flex justify-between font-medium pt-2 border-t border-border">
              <span>Total Due</span>
              <span className="font-heading text-lg">{formatZAR(bill.total_amount_due_cents || 0)}</span>
            </div>
            {bill.due_date && (
              <div className="flex justify-between"><span className="text-muted-foreground">Due Date</span><span>{bill.due_date}</span></div>
            )}
            {bill.arrears_cents > 0 && (
              <div className="flex justify-between text-danger"><span>Arrears</span><span>{formatZAR(bill.arrears_cents)}</span></div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Meter readings */}
      {(bill.water_consumption_kl || bill.electricity_consumption_kwh) && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Meter Readings</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            {bill.water_consumption_kl && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Water: {bill.water_reading_previous} → {bill.water_reading_current}</span>
                <span>{bill.water_consumption_kl} kL</span>
              </div>
            )}
            {bill.electricity_consumption_kwh && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Electricity: {bill.electricity_reading_previous} → {bill.electricity_reading_current}</span>
                <span>{bill.electricity_consumption_kwh} kWh</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Extraction info */}
      {bill.extraction_notes && (
        <Card className="mt-6">
          <CardHeader><CardTitle className="text-lg">Extraction Notes</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{bill.extraction_notes}</p>
            {bill.extraction_confidence !== null && (
              <p className="text-xs text-muted-foreground mt-1">Confidence: {Math.round((bill.extraction_confidence || 0) * 100)}%</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
