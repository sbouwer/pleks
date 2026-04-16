"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useDemoData, useDemoAction } from "@/lib/demo/DemoContext"
import { Star, Plus } from "lucide-react"

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="size-3 fill-amber-400 text-amber-400" />
      <span className="text-xs font-medium">{rating.toFixed(1)}</span>
    </div>
  )
}

const TRADE_COLORS: Record<string, string> = {
  Plumbing:   "bg-blue-500/10 text-blue-600",
  Electrical: "bg-yellow-500/10 text-yellow-600",
  Gardening:  "bg-green-500/10 text-green-600",
  Painting:   "bg-purple-500/10 text-purple-600",
}

export default function DemoSuppliersPage() {
  const { data } = useDemoData()
  const { showDemoToast } = useDemoAction()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{data.suppliers.length} contractors</p>
        </div>
        <button
          onClick={showDemoToast}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data.suppliers.map((supplier) => {
          const tradeColor = TRADE_COLORS[supplier.trade] ?? "bg-muted text-muted-foreground"

          return (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={showDemoToast}>
              <CardContent className="pt-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{supplier.company}</p>
                    <p className="text-xs text-muted-foreground">{supplier.contact}</p>
                  </div>
                  <Badge className={`border-0 text-xs ${tradeColor}`}>{supplier.trade}</Badge>
                </div>

                {/* Contact */}
                <p className="text-xs text-muted-foreground">{supplier.phone}</p>

                {/* Stats */}
                <div className="flex items-center justify-between border-t pt-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Jobs done</p>
                    <p className="text-sm font-semibold">{supplier.jobs_completed}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-sm font-semibold">{supplier.pending_jobs}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Rating</p>
                    <RatingStars rating={supplier.avg_rating} />
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">VAT</p>
                    <p className="text-xs font-medium">{supplier.vat_registered ? "Yes" : "No"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
