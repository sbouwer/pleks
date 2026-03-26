import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatDateShort } from "@/lib/reports/periods"
import { LeaseRequestActions } from "./LeaseRequestActions"

interface LeaseRequest {
  id: string
  org_id: string
  submitted_by: string
  template_path: string
  notes: string | null
  status: string
  created_at: string
}

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
  in_progress: "secondary",
}

export default async function AdminLeaseRequestsPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  const { data: requests } = await supabase
    .from("custom_lease_requests")
    .select("id, org_id, submitted_by, template_path, notes, status, created_at")
    .order("created_at", { ascending: false })

  // Resolve org names
  const orgIds = [
    ...new Set((requests ?? []).map((r: LeaseRequest) => r.org_id).filter(Boolean)),
  ]
  const { data: orgs } =
    orgIds.length > 0
      ? await supabase.from("organisations").select("id, name").in("id", orgIds)
      : { data: [] }

  const orgMap = new Map(
    (orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name])
  )

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Lease Template Requests</h1>
      <p className="text-xs text-muted-foreground">
        Custom lease template requests from organisations.
      </p>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-2">Org</th>
                <th className="text-left py-2 pr-2">Submitted</th>
                <th className="text-left py-2 pr-2">Template</th>
                <th className="text-left py-2 pr-2">Status</th>
                <th className="text-left py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(requests ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    No requests yet.
                  </td>
                </tr>
              )}
              {(requests ?? []).map((r: LeaseRequest) => (
                <tr key={r.id} className="border-b border-border/50">
                  <td className="py-2 pr-2 text-xs">
                    <a
                      href={`/admin/orgs/${r.org_id}`}
                      className="text-brand hover:underline"
                    >
                      {orgMap.get(r.org_id) ?? r.org_id.slice(0, 8)}
                    </a>
                  </td>
                  <td className="py-2 pr-2 text-xs">
                    {formatDateShort(new Date(r.created_at))}
                    <span className="block text-muted-foreground">
                      {r.submitted_by.slice(0, 8)}...
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs font-mono max-w-[200px] truncate">
                    {r.template_path}
                  </td>
                  <td className="py-2 pr-2">
                    <Badge variant={statusVariant[r.status] ?? "secondary"}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <LeaseRequestActions
                      requestId={r.id}
                      currentStatus={r.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
