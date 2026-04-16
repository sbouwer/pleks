"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ContactCard, type PortalStatus } from "@/components/contacts/ContactCard"
import { LeasePortalActions } from "./LeasePortalActions"
import { emailLeaseToTenant } from "./actions"

export interface TenantContactInfo {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
  address?: string | null
  entityType: string | null
  tenantId: string
  ficaVerified: boolean | null
  idOrRegNumber: string | null
  idOrRegLabel: string
  portalStatus: "none" | "invited" | "active" | null
  welcomePackSentAt: string | null
}

export interface LandlordContactInfo {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
  address?: string | null
  entityType: string | null
  ficaVerified: boolean | null
  idOrRegNumber: string | null
  idOrRegLabel: string
  portalStatus: PortalStatus
}

interface ContactsTabProps {
  readonly tenants: TenantContactInfo[]
  readonly landlord: LandlordContactInfo | null
  readonly leaseId: string
  readonly propertyId: string | null
  readonly managedBy?: string | null
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
  readonly primaryTenantId: string | null
}

const AVATAR_VARIANT: Record<string, "brand" | "blue"> = {
  Primary: "brand",
}

export function ContactsTab({
  tenants,
  landlord,
  leaseId,
  propertyId,
  managedBy,
  portalInviteSentAt,
  hasAuthUser,
  primaryTenantId,
}: ContactsTabProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [sendingWelcome, startSendWelcome] = useTransition()

  const activeTenant = tenants[activeIdx] ?? null

  const tenantSubtitle = activeTenant
    ? `${activeTenant.entityType ?? "Individual"} · ${activeTenant.role}`
    : ""

  const ownerSubtitle = landlord?.company ?? "Self-managed"

  function handleSendWelcomePack() {
    startSendWelcome(async () => {
      const result = await emailLeaseToTenant(leaseId)
      if (result.error) toast.error(result.error)
      else toast.success("Welcome pack sent to tenant")
    })
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        {activeTenant && (
          <Button variant="outline" size="sm" render={<Link href={`/tenants/${activeTenant.tenantId}`} />}>
            Edit tenant
          </Button>
        )}
        {primaryTenantId && (
          <LeasePortalActions
            tenantId={primaryTenantId}
            leaseId={leaseId}
            portalInviteSentAt={portalInviteSentAt}
            hasAuthUser={hasAuthUser}
          />
        )}
      </div>

      {/* Equal-height grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Tenant card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          {/* Header row: section label + co-tenant avatar circles */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              {tenants.length === 1 ? "Tenant" : "Tenants"}
            </p>
            {tenants.length > 1 && (
              <div className="flex items-center gap-1.5">
                {tenants.map((t, i) => {
                  const isActive = activeIdx === i
                  const variant = AVATAR_VARIANT[t.role] ?? "blue"
                  const avatarCls = variant === "brand"
                    ? "bg-brand/20 text-brand"
                    : "bg-blue-100 text-blue-700"
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveIdx(i)}
                      title={`${t.name} · ${t.role}`}
                      className={`h-7 w-7 rounded-full text-[10px] font-bold flex items-center justify-center transition-all ${avatarCls} ${
                        isActive
                          ? "ring-2 ring-brand ring-offset-1 ring-offset-card"
                          : "opacity-50 hover:opacity-80"
                      }`}
                    >
                      {t.name.slice(0, 2).toUpperCase()}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Card body */}
          <div className="flex-1">
            {activeTenant ? (
              <ContactCard
                name={activeTenant.name}
                subtitle={tenantSubtitle}
                avatarVariant={AVATAR_VARIANT[activeTenant.role] ?? "blue"}
                email={activeTenant.email}
                phone={activeTenant.phone}
                address={activeTenant.address}
                profileHref={`/tenants/${activeTenant.tenantId}`}
                showInfo
                entityType={activeTenant.entityType}
                idOrRegNumber={activeTenant.idOrRegNumber}
                idOrRegLabel={activeTenant.idOrRegLabel}
                ficaVerified={activeTenant.ficaVerified}
                portalStatus={activeTenant.portalStatus}
                welcomePackSentAt={activeTenant.welcomePackSentAt}
                onSendWelcomePack={activeTenant.role === "Primary" && !sendingWelcome ? handleSendWelcomePack : undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            )}
          </div>
        </div>

        {/* ── Owner card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Owner / Landlord</p>
          {landlord ? (
            <ContactCard
              name={landlord.name}
              subtitle={ownerSubtitle}
              avatarVariant="blue"
              email={landlord.email}
              phone={landlord.phone}
              address={landlord.address}
              managedBy={managedBy}
              profileHref={`/landlords/${landlord.id}`}
              showInfo
              entityType={landlord.entityType}
              idOrRegNumber={landlord.idOrRegNumber}
              idOrRegLabel={landlord.idOrRegLabel}
              ficaVerified={landlord.ficaVerified}
              portalStatus={landlord.portalStatus}
              welcomePackSentAt={null}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[220px]">
              <p className="text-sm text-muted-foreground">
                No owner linked.{" "}
                {propertyId && (
                  <Link href={`/properties/${propertyId}`} className="text-brand hover:underline">
                    Link here
                  </Link>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
