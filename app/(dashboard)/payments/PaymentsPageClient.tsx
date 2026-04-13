"use client"

import { useState, useTransition } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { BatchPaymentEntry } from "@/components/payments/BatchPaymentEntry"
import { CreditCard, Plus, List, LayoutList, MessageSquare, Loader2 } from "lucide-react"
import { formatZAR } from "@/lib/constants"
import { OPERATIONAL_QUERY_KEYS, STALE_TIME } from "@/lib/queries/portfolio"
import { fetchPaymentsAction } from "@/lib/queries/portfolioActions"
import { relativeTime } from "@/lib/utils"
import { toast } from "sonner"
import { sendBulkRentReminders } from "./actions"

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears"> = {
  submitted: "pending",
  under_review: "pending",
  approved: "active",
  pending_payment: "pending",
  paid: "completed",
  rejected: "arrears",
  disputed: "arrears",
  owner_direct_recorded: "completed",
}

interface Props { orgId: string }

export function PaymentsPageClient({ orgId }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const queryKey = OPERATIONAL_QUERY_KEYS.payments(orgId)
  const { data: list = [], dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: () => fetchPaymentsAction(orgId),
    staleTime: STALE_TIME.payments,
  })
  const [mode, setMode] = useState<"single" | "batch">("batch")
  const [sendingReminders, startSendReminders] = useTransition()

  function handleSendReminders() {
    startSendReminders(async () => {
      const result = await sendBulkRentReminders()
      if (result.error) {
        toast.error(result.error)
      } else if (result.sent === 0) {
        toast.info(result.skipped > 0 ? "SMS reminders require Steward tier or higher" : "No tenants with outstanding rent found")
      } else {
        toast.success(`Sent ${result.sent} reminder${result.sent === 1 ? "" : "s"}`)
      }
    })
  }

  const pendingReview = list.filter((i) => ["submitted", "under_review"].includes(i.status))
  const unpaid = list.filter((i) => ["approved", "pending_payment"].includes(i.status))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {pendingReview.length} pending review &middot; {unpaid.length} approved unpaid
            </p>
          )}
          {dataUpdatedAt > 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span>Updated {relativeTime(new Date(dataUpdatedAt))}</span>
              <button
                onClick={() => queryClient.invalidateQueries({ queryKey })}
                className="text-brand hover:underline"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleSendReminders} disabled={sendingReminders}>
            {sendingReminders ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
            Send reminders
          </Button>
          {/* Mode toggle */}
          <div className="flex items-center border border-border rounded-md overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMode("batch")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${mode === "batch" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutList className="size-3.5" /> Quick entry
            </button>
            <button
              type="button"
              onClick={() => setMode("single")}
              className={`flex items-center gap-1.5 px-3 py-1.5 transition-colors ${mode === "single" ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="size-3.5" /> Invoices
            </button>
          </div>
          <Button render={<Link href="/payments/invoices/new" />}>
            <Plus className="h-4 w-4 mr-1" /> Add Invoice
          </Button>
        </div>
      </div>

      {/* Batch rent payment entry */}
      {mode === "batch" && (
        <Card className="mb-6">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-4">
              Record received rent payments against open invoices. Amounts pre-fill from outstanding balances — edit if needed.
            </p>
            <BatchPaymentEntry />
          </CardContent>
        </Card>
      )}

      {/* Supplier invoice list */}
      {mode === "single" && (
        list.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-8 w-8 text-muted-foreground" />}
            title="No invoices yet"
            description="Invoices from contractors and suppliers will appear here."
          />
        ) : (
          <div className="space-y-2">
            {list.map((inv) => {
              const contractor = inv.contractor_view as unknown as { first_name: string; last_name: string; company_name: string | null } | null
              const property = inv.properties as unknown as { name: string } | null

              return (
                <Link key={inv.id} href={`/payments/invoices/${inv.id}`}>
                  <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                    <CardContent className="flex items-center justify-between pt-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{inv.description}</p>
                          {inv.invoice_number && (
                            <span className="text-xs text-muted-foreground">{inv.invoice_number}</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {contractor ? contractor.company_name || `${contractor.first_name} ${contractor.last_name}`.trim() : "Unknown"}
                          {property ? ` · ${property.name}` : ""}
                          {` · ${inv.invoice_date}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-heading">{formatZAR(inv.amount_incl_vat_cents)}</span>
                        <StatusBadge status={STATUS_MAP[inv.status] || "pending"} />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
