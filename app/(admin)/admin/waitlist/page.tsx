import { requireAdminAuth } from "@/lib/admin/auth"
import { createServiceClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateShort } from "@/lib/reports/periods"
import { WaitlistExport } from "./WaitlistExport"

export default async function AdminWaitlistPage() {
  await requireAdminAuth()
  const supabase = await createServiceClient()

  const { data: entries, count } = await supabase
    .from("waitlist")
    .select("email, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })

  const rows = entries ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl">Waitlist</h1>
        <WaitlistExport entries={rows} />
      </div>

      <p className="text-sm text-muted-foreground">Total entries: {count ?? rows.length}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All entries</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2">Email</th>
                <th className="text-left py-2">Role</th>
                <th className="text-left py-2">Signed up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="py-2">{w.email}</td>
                  <td className="py-2 capitalize text-xs">{w.role ?? "—"}</td>
                  <td className="py-2 text-xs">{formatDateShort(new Date(w.created_at))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
