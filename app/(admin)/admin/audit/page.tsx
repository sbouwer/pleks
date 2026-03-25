import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { formatDateShort } from "@/lib/reports/periods"

export default async function AdminAuditPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, org_id, table_name, record_id, action, changed_by, new_values, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  // Resolve org names
  const orgIds = [...new Set((entries ?? []).map((e) => e.org_id).filter(Boolean))]
  const { data: orgs } = orgIds.length > 0
    ? await supabase.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] }
  const orgMap = new Map((orgs ?? []).map((o) => [o.id, o.name]))

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">Audit Log</h1>
      <p className="text-xs text-muted-foreground">Cross-org audit trail. Last 100 entries.</p>

      <Card>
        <CardContent className="pt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 pr-2">Org</th>
                <th className="text-left py-2 pr-2">Table</th>
                <th className="text-left py-2 pr-2">Action</th>
                <th className="text-left py-2 pr-2">Details</th>
                <th className="text-left py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id} className="border-b border-border/50">
                  <td className="py-2 pr-2 text-xs">{orgMap.get(e.org_id) ?? e.org_id?.slice(0, 8)}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{e.table_name}</td>
                  <td className="py-2 pr-2 text-xs">{e.action}</td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground max-w-xs truncate">
                    {e.new_values ? JSON.stringify(e.new_values).slice(0, 80) : "—"}
                  </td>
                  <td className="py-2 text-xs">{formatDateShort(new Date(e.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
