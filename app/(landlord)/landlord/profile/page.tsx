import { createServiceClient } from "@/lib/supabase/server"
import { getLandlordSession } from "@/lib/portal/getLandlordSession"

export default async function LandlordProfilePage() {
  const session = await getLandlordSession()
  const service = await createServiceClient()

  const { data: org } = await service
    .from("organisations")
    .select("name, email, phone")
    .eq("id", session.orgId)
    .single()

  return (
    <div className="max-w-md space-y-6">
      <h1 className="font-heading text-3xl">Profile</h1>

      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Your account</p>
        <div>
          <p className="text-muted-foreground text-xs mb-0.5">Name</p>
          <p className="font-medium">{session.displayName}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs mb-0.5">Managed by</p>
          <p>{org?.name ?? "Your managing agent"}</p>
          {org?.email && <p className="text-muted-foreground">{org.email}</p>}
          {org?.phone && <p className="text-muted-foreground">{org.phone}</p>}
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Password</p>
        <p className="text-muted-foreground">
          To change your password, use the password reset link on the login page.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-2 text-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">Need help?</p>
        <p className="text-muted-foreground">
          Contact your managing agent for any changes to your property details, lease terms, or account access.
        </p>
        {org?.email && (
          <a href={`mailto:${org.email}`} className="text-brand hover:underline text-sm">
            {org.email}
          </a>
        )}
      </div>
    </div>
  )
}
