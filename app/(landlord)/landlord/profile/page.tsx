/**
 * app/(landlord)/landlord/profile/page.tsx — Landlord portal profile: account name, managing agent details, contact
 *
 * Route:  /landlord/profile
 * Auth:   getLandlordSession (token-gated landlord portal)
 * Data:   createServiceClient — organisations for managing agent info
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { DetailCard } from "@/components/detail/DetailCard"
import { logQueryError } from "@/lib/supabase/logQueryError"

export default async function LandlordProfilePage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: org, error: orgError } = await service
    .from("organisations")
    .select("name, email, phone")
    .eq("id", session.orgId)
    .single()
    logQueryError("LandlordProfilePage organisations", orgError)

  return (
    <div className="space-y-4">
      <ResourcePageHeader eyebrow="Landlord" title="Profile" headline="Your account & managing agent" />

      <div className="max-w-md space-y-4">
        <DetailCard title="Your account">
          <div className="space-y-3 text-sm">
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Name</p>
              <p className="font-medium text-foreground">{session.displayName}</p>
            </div>
            <div>
              <p className="mb-0.5 text-xs text-muted-foreground">Managed by</p>
              <p className="text-foreground">{org?.name ?? "Your managing agent"}</p>
              {org?.email && <p className="text-muted-foreground">{org.email}</p>}
              {org?.phone && <p className="text-muted-foreground">{org.phone}</p>}
            </div>
          </div>
        </DetailCard>

        <DetailCard title="Password">
          <p className="text-sm text-muted-foreground">
            To change your password, use the password reset link on the login page.
          </p>
        </DetailCard>

        <DetailCard title="Need help?">
          <p className="text-sm text-muted-foreground">
            Contact your managing agent for any changes to your property details, lease terms, or account access.
          </p>
          {org?.email && (
            <a href={`mailto:${org.email}`} className="text-sm hover:underline">
              {org.email}
            </a>
          )}
        </DetailCard>
      </div>
    </div>
  )
}
