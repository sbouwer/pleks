"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ContactCard, type PortalStatus } from "@/components/contacts/ContactCard"
import { CoTenantAvatars } from "@/components/contacts/CoTenantAvatars"
import { LeasePortalActions } from "./LeasePortalActions"
import { emailLeaseToTenant, inviteLandlordPortal } from "./actions"
import { inviteTenantPortal } from "@/lib/portal/inviteTenant"

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

  // Optimistic portal status overrides per tenant (tenantId → status)
  const [tenantPortalOverride, setTenantPortalOverride] = useState<Record<string, PortalStatus>>({})
  const [invitingTenantId, setInvitingTenantId] = useState<string | null>(null)

  // Optimistic owner portal status override
  const [ownerPortalOverride, setOwnerPortalOverride] = useState<PortalStatus>(null)
  const [invitingOwner, setInvitingOwner] = useState(false)

  const activeTenant = tenants[activeIdx] ?? null

  const tenantSubtitle = activeTenant
    ? `${activeTenant.entityType ?? "Individual"} · ${activeTenant.role}`
    : ""

  const ownerEntityLabel = landlord?.entityType
    ? landlord.entityType.charAt(0).toUpperCase() + landlord.entityType.slice(1).replaceAll("_", " ")
    : "Individual"
  const ownerSubtitle = landlord ? `${ownerEntityLabel} · Owner` : ""

  function handleSendWelcomePack() {
    startSendWelcome(async () => {
      const result = await emailLeaseToTenant(leaseId)
      if (result.error) toast.error(result.error)
      else toast.success("Welcome pack sent to tenant")
    })
  }

  async function handleTenantPortalInvite(tenantId: string) {
    setInvitingTenantId(tenantId)
    const result = await inviteTenantPortal(tenantId, leaseId)
    setInvitingTenantId(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Portal invite sent")
      setTenantPortalOverride(prev => ({ ...prev, [tenantId]: "invited" }))
    }
  }

  async function handleOwnerPortalInvite() {
    if (!landlord) return
    setInvitingOwner(true)
    const result = await inviteLandlordPortal(landlord.id)
    setInvitingOwner(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Owner portal invite sent")
      setOwnerPortalOverride("invited")
    }
  }

  const activeTenantPortalStatus = activeTenant
    ? (tenantPortalOverride[activeTenant.tenantId] ?? activeTenant.portalStatus)
    : null

  const ownerPortalStatus = ownerPortalOverride ?? landlord?.portalStatus ?? null

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
            allTenants={tenants}
            leaseId={leaseId}
            portalInviteSentAt={portalInviteSentAt}
            hasAuthUser={hasAuthUser}
          />
        )}
      </div>

      {/* Equal-height grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Owner card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Owner / Landlord</p>
            {managedBy && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {managedBy === "self-managed" ? "Self-managed" : `Managed by ${managedBy}`}
              </p>
            )}
          </div>
          {landlord ? (
            <ContactCard
              name={landlord.name}
              subtitle={ownerSubtitle}
              avatarVariant="blue"
              email={landlord.email}
              phone={landlord.phone}
              address={landlord.address}
              profileHref={`/landlords/${landlord.id}`}
              showInfo
              entityType={landlord.entityType}
              idOrRegNumber={landlord.idOrRegNumber}
              idOrRegLabel={landlord.idOrRegLabel}
              ficaVerified={landlord.ficaVerified}
              portalStatus={ownerPortalStatus}
              welcomePackSentAt={null}
              onSendPortalInvite={
                !invitingOwner && (!ownerPortalStatus || ownerPortalStatus === "none")
                  ? handleOwnerPortalInvite
                  : undefined
              }
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

        {/* ── Tenant card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
            {tenants.length === 1 ? "Tenant" : "Tenants"}
          </p>

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
                portalStatus={activeTenantPortalStatus}
                welcomePackSentAt={activeTenant.welcomePackSentAt}
                onSendWelcomePack={activeTenant.role === "Primary" && !sendingWelcome ? handleSendWelcomePack : undefined}
                onSendPortalInvite={
                  !invitingTenantId && (!activeTenantPortalStatus || activeTenantPortalStatus === "none")
                    ? () => handleTenantPortalInvite(activeTenant.tenantId)
                    : undefined
                }
                headerActions={tenants.length > 1 ? (
                  <CoTenantAvatars tenants={tenants} activeIdx={activeIdx} onSelect={setActiveIdx} />
                ) : undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
