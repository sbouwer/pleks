/**
 * app/(supplier)/supplier/profile/page.tsx — Supplier profile (details, specialities, notif prefs)
 *
 * Route:  /supplier/profile
 * Auth:   getSupplierSession (Supabase-auth contractor — ADDENDUM_00M)
 * Data:   contractor_view via service, scoped to session.contractorId
 */
import { createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { getSupplierSession } from "@/lib/portal/getSupplierSession"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function ContractorProfilePage() {
  const session = await getSupplierSession()
  if (!session) redirect("/login?role=supplier")

  const service = await createServiceClient()
  const { data: primary, error: primaryError } = await service
    .from("contractor_view")
    .select("*, organisations(name)")
    .eq("id", session.contractorId)
    .maybeSingle()
    logQueryError("ContractorProfilePage contractor_view", primaryError)

  if (!primary) redirect("/login?role=supplier")

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Supplier" title="My profile" headline="Your details & preferences" />

      <DetailCard title="Details">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-semibold text-foreground">{primary.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Company</p>
            <p className="font-semibold text-foreground">{primary.company_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-semibold text-foreground">{primary.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-semibold text-foreground">{primary.phone ?? "—"}</p>
          </div>
        </div>
      </DetailCard>

      <DetailCard title="Specialities">
        <div className="flex flex-wrap gap-2">
          {(primary.specialities as string[] ?? []).map((s: string) => (
            <span key={s} className="rounded-[var(--r-button)] border border-border bg-muted px-2 py-0.5 text-xs capitalize text-muted-foreground">{s}</span>
          ))}
          {!(primary.specialities as string[] | null)?.length && (
            <p className="text-sm text-muted-foreground">No specialities listed.</p>
          )}
        </div>
      </DetailCard>

      <DetailCard title="Notification preferences">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Email notifications</span>
            <span className="text-foreground">{primary.notification_email ? "On" : "Off"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">SMS notifications</span>
            <span className="text-foreground">{primary.notification_sms ? "On" : "Off"}</span>
          </div>
        </div>
      </DetailCard>
    </div>
  )
}
