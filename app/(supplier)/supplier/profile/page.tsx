/**
 * app/(supplier)/supplier/profile/page.tsx — Supplier profile (details, specialities, notif prefs)
 *
 * Route:  /supplier/profile
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   contractor_view via service, scoped to session.contractorId
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"

export default async function ContractorProfilePage() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()
  const { data: primary } = await service
    .from("contractor_view")
    .select("*, organisations(name)")
    .eq("id", session.contractorId)
    .maybeSingle()

  if (!primary) redirect("/login?role=supplier")

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl">My Profile</h1>

      <Card>
        <CardHeader><CardTitle className="text-sm">Details</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-semibold">{primary.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Company</p>
              <p className="font-semibold">{primary.company_name ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Email</p>
              <p className="font-semibold">{primary.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Phone</p>
              <p className="font-semibold">{primary.phone ?? "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Specialities</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {(primary.specialities as string[] ?? []).map((s: string) => (
              <Badge key={s} variant="secondary" className="capitalize">{s}</Badge>
            ))}
            {!(primary.specialities as string[] | null)?.length && (
              <p className="text-sm text-muted-foreground">No specialities listed.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm">Notification Preferences</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Email notifications</span>
            <span>{primary.notification_email ? "On" : "Off"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>SMS notifications</span>
            <span>{primary.notification_sms ? "On" : "Off"}</span>
          </div>
        </CardContent>
      </Card>

    </div>
  )
}
