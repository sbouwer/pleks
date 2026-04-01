import Link from "next/link"
import { Phone, Mail, MessageCircle } from "lucide-react"
import { getInitials } from "@/lib/leases/tenantDisplay"

interface TenantContact {
  tenantId: string
  name: string
  initials: string
  phone: string | null
  email: string | null
  role: "Primary tenant" | "Co-tenant"
}

interface TenantCardsProps {
  primary: TenantContact
  coTenants: TenantContact[]
}

function TenantCard({ tenant }: { tenant: TenantContact }) {
  const initials = tenant.initials || "?"
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
        {tenant.role}
      </p>

      <Link
        href={`/tenants/${tenant.tenantId}`}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand"
        >
          {initials}
        </div>
        <p className="font-medium hover:underline">{tenant.name}</p>
      </Link>

      {(tenant.phone || tenant.email) && (
        <div className="mt-3 space-y-1.5 border-t pt-3">
          {tenant.phone && (
            <a
              href={`tel:${tenant.phone}`}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {tenant.phone}
            </a>
          )}
          {tenant.email && (
            <a
              href={`mailto:${tenant.email}`}
              className="flex items-center gap-2 truncate text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {tenant.email}
            </a>
          )}
        </div>
      )}

      {/* Quick action buttons */}
      <div className="mt-3 flex gap-2">
        {tenant.phone && (
          <>
            <a
              href={`tel:${tenant.phone}`}
              className="flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Phone className="h-3 w-3" /> Call
            </a>
            <a
              href={`https://wa.me/${tenant.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <MessageCircle className="h-3 w-3" /> WhatsApp
            </a>
          </>
        )}
        {tenant.email && (
          <a
            href={`mailto:${tenant.email}`}
            className="flex flex-1 items-center justify-center gap-1 rounded-md border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Mail className="h-3 w-3" /> Email
          </a>
        )}
      </div>
    </div>
  )
}

export function TenantCards({ primary, coTenants }: TenantCardsProps) {
  return (
    <div className="space-y-3">
      <TenantCard tenant={primary} />
      {coTenants.map((ct) => (
        <TenantCard key={ct.tenantId} tenant={ct} />
      ))}
    </div>
  )
}

/** Helper to build a TenantContact from raw data. */
export function buildTenantContact(
  tenantId: string,
  contacts: {
    first_name?: string | null
    last_name?: string | null
    company_name?: string | null
    entity_type?: string | null
    primary_email?: string | null
    primary_phone?: string | null
    email?: string | null
    phone?: string | null
  } | null,
  role: "Primary tenant" | "Co-tenant",
): TenantContact {
  const p = {
    id: tenantId,
    firstName: contacts?.first_name,
    lastName: contacts?.last_name,
    companyName: contacts?.company_name,
    entityType: contacts?.entity_type,
  }
  const isOrg = contacts?.entity_type === "organisation"
  const name = (isOrg && contacts?.company_name)
    ? contacts.company_name
    : `${contacts?.first_name ?? ""} ${contacts?.last_name ?? ""}`.trim() || "Unknown"

  return {
    tenantId,
    name,
    initials: getInitials(p),
    phone: contacts?.primary_phone ?? contacts?.phone ?? null,
    email: contacts?.primary_email ?? contacts?.email ?? null,
    role,
  }
}
