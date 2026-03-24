import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { FileText } from "lucide-react"
import { formatZAR } from "@/lib/constants"

const EXTRACTION_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  pending: "pending",
  extracting: "pending",
  extracted: "active",
  needs_review: "pending",
  confirmed: "completed",
  failed: "arrears",
}

export default async function MunicipalBillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: bills } = await supabase
    .from("municipal_bills")
    .select("id, billing_month, total_amount_due_cents, extraction_status, payment_status, original_filename, properties(name), municipal_accounts(municipality_name)")
    .order("created_at", { ascending: false })
    .limit(50)

  const list = bills || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-3xl">Municipal Bills</h1>
      </div>

      {list.length === 0 ? (
        <EmptyState icon={FileText} title="No municipal bills" description="Upload a municipal bill PDF from a property's page to start tracking." />
      ) : (
        <div className="space-y-2">
          {list.map((bill) => {
            const property = bill.properties as unknown as { name: string } | null
            const account = bill.municipal_accounts as unknown as { municipality_name: string } | null

            return (
              <Link key={bill.id} href={`/payments/municipal/${bill.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <p className="font-medium">{property?.name || "—"} — {account?.municipality_name || "Municipality"}</p>
                      <p className="text-sm text-muted-foreground">
                        {bill.billing_month ? new Date(bill.billing_month).toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : bill.original_filename}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-heading">{formatZAR(bill.total_amount_due_cents || 0)}</span>
                      <StatusBadge status={bill.payment_status === "paid" ? "paid" : EXTRACTION_MAP[bill.extraction_status] || "pending"} />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
