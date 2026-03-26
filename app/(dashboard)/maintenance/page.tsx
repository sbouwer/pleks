import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { Wrench, Plus, AlertTriangle } from "lucide-react"

const URGENCY_COLORS: Record<string, string> = {
  emergency: "text-danger",
  urgent: "text-warning",
  routine: "text-muted-foreground",
  cosmetic: "text-muted-foreground",
}

const STATUS_MAP: Record<string, "pending" | "active" | "completed" | "arrears" | "scheduled"> = {
  pending_review: "pending",
  approved: "scheduled",
  pending_landlord: "pending",
  work_order_sent: "scheduled",
  acknowledged: "scheduled",
  in_progress: "active",
  pending_completion: "pending",
  completed: "completed",
  closed: "completed",
  rejected: "arrears",
  cancelled: "arrears",
}

export default async function MaintenancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: requests } = await supabase
    .from("maintenance_requests")
    .select("id, title, category, urgency, status, work_order_number, created_at, units(unit_number, properties(name))")
    .order("created_at", { ascending: false })

  const list = requests || []
  const emergencies = list.filter((r) => r.urgency === "emergency" && !["completed", "closed", "cancelled"].includes(r.status))

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-3xl">Maintenance</h1>
          {list.length > 0 && (
            <p className="text-sm text-muted-foreground mt-1">{list.length} requests</p>
          )}
        </div>
        <Button render={<Link href="/maintenance/new" />}>
          <Plus className="h-4 w-4 mr-1" /> Log Request
        </Button>
      </div>

      {emergencies.length > 0 && (
        <Card className="mb-4 border-danger/30 bg-danger-bg">
          <CardContent className="flex items-center gap-3 pt-4">
            <AlertTriangle className="h-5 w-5 text-danger" />
            <p className="text-sm font-medium">{emergencies.length} emergency request{emergencies.length > 1 ? "s" : ""} require immediate attention</p>
          </CardContent>
        </Card>
      )}

      {list.length === 0 ? (
        <EmptyState icon={<Wrench className="h-8 w-8 text-muted-foreground" />} title="No maintenance requests" description="Log a maintenance request to get started." />
      ) : (
        <div className="space-y-2">
          {list.map((req) => {
            const unit = req.units as unknown as { unit_number: string; properties: { name: string } } | null
            return (
              <Link key={req.id} href={`/maintenance/${req.id}`}>
                <Card className="hover:border-brand/50 transition-colors cursor-pointer">
                  <CardContent className="flex items-center justify-between pt-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{req.title}</p>
                        {req.work_order_number && (
                          <span className="text-xs text-muted-foreground">{req.work_order_number}</span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {unit ? `${unit.unit_number}, ${unit.properties.name}` : ""}
                        {req.category && ` · ${req.category}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {req.urgency && (
                        <span className={`text-xs font-medium uppercase ${URGENCY_COLORS[req.urgency] || ""}`}>
                          {req.urgency}
                        </span>
                      )}
                      <StatusBadge status={STATUS_MAP[req.status] || "pending"} />
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
