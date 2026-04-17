"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { ContactCard, type PortalStatus } from "@/components/contacts/ContactCard"
import { CoTenantAvatars } from "@/components/contacts/CoTenantAvatars"
import { LeasePortalActions } from "./LeasePortalActions"
import { inviteLandlordPortal } from "./actions"
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
  readonly orgId: string
  readonly propertyId: string | null
  readonly managedBy?: string | null
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
  readonly primaryTenantId: string | null
  readonly portfolioOverviewSentAt: string | null
  readonly portfolioOverviewOutdated: boolean
  readonly premiumEnabled: boolean
  readonly orgTier: string | null
  readonly subscriptionStatus: string | null
  readonly premiumSlotsUsed: number
  readonly tenantDisplayText: string
}

const AVATAR_VARIANT: Record<string, "brand" | "blue"> = {
  Primary: "brand",
}

// ── Owner card ────────────────────────────────────────────────────────────────

interface OwnerCardProps {
  readonly landlord: LandlordContactInfo
  readonly subtitle: string
  readonly orgId: string
  readonly portfolioOverviewSentAt: string | null
  readonly portfolioOverviewOutdated: boolean
}

function OwnerCard({ landlord, subtitle, orgId, portfolioOverviewSentAt, portfolioOverviewOutdated }: OwnerCardProps) {
  const [portalOverride, setPortalOverride] = useState<PortalStatus>(null)
  const [inviting, setInviting] = useState(false)

  const portalStatus = portalOverride ?? landlord.portalStatus

  function handleWelcomePack() {
    window.open(`/api/reports/welcome-pack?orgId=${encodeURIComponent(orgId)}&landlordId=${encodeURIComponent(landlord.id)}`, "_blank")
  }

  async function handlePortalInvite() {
    setInviting(true)
    const result = await inviteLandlordPortal(landlord.id)
    setInviting(false)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Owner portal invite sent")
      setPortalOverride("invited")
    }
  }

  return (
    <ContactCard
      name={landlord.name}
      subtitle={subtitle}
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
      portalStatus={portalStatus}
      welcomePackLabel="Portfolio overview"
      welcomePackSentAt={portfolioOverviewSentAt}
      welcomePackOutdated={portfolioOverviewOutdated}
      onSendWelcomePack={handleWelcomePack}
      onSendPortalInvite={
        !inviting && (!portalStatus || portalStatus === "none") ? handlePortalInvite : undefined
      }
    />
  )
}

// ── Tenant card ───────────────────────────────────────────────────────────────

interface TenantCardProps {
  readonly tenants: TenantContactInfo[]
  readonly leaseId: string
  readonly activeIdx: number
  readonly onActiveChange: (idx: number) => void
}

function TenantCard({ tenants, leaseId, activeIdx, onActiveChange }: TenantCardProps) {
  const [portalOverrides, setPortalOverrides] = useState<Record<string, PortalStatus>>({})
  const [invitingId, setInvitingId] = useState<string | null>(null)

  const activeTenant = tenants[activeIdx] ?? null
  const subtitle = activeTenant
    ? `${activeTenant.entityType ?? "Individual"} · ${activeTenant.role}`
    : ""
  const portalStatus = activeTenant
    ? (portalOverrides[activeTenant.tenantId] ?? activeTenant.portalStatus)
    : null

  if (!activeTenant) return <p className="text-sm text-muted-foreground">No tenant linked.</p>

  async function handlePortalInvite() {
    const { tenantId } = activeTenant
    setInvitingId(tenantId)
    const result = await inviteTenantPortal(tenantId, leaseId)
    setInvitingId(null)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Portal invite sent")
      setPortalOverrides(prev => ({ ...prev, [tenantId]: "invited" }))
    }
  }

  function handleWelcomePack() {
    window.open(
      `/api/reports/tenant-welcome-pack?leaseId=${encodeURIComponent(leaseId)}&tenantId=${encodeURIComponent(activeTenant.tenantId)}`,
      "_blank",
    )
  }

  return (
    <ContactCard
      name={activeTenant.name}
      subtitle={subtitle}
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
      portalStatus={portalStatus}
      welcomePackSentAt={activeTenant.welcomePackSentAt}
      onSendWelcomePack={handleWelcomePack}
      onSendPortalInvite={
        !invitingId && (!portalStatus || portalStatus === "none") ? handlePortalInvite : undefined
      }
      headerActions={tenants.length > 1 ? (
        <CoTenantAvatars tenants={tenants} activeIdx={activeIdx} onSelect={onActiveChange} />
      ) : undefined}
    />
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export function ContactsTab({
  tenants,
  landlord,
  leaseId,
  orgId,
  propertyId,
  managedBy,
  portalInviteSentAt,
  hasAuthUser,
  primaryTenantId,
  portfolioOverviewSentAt,
  portfolioOverviewOutdated,
  premiumEnabled,
  orgTier,
  subscriptionStatus,
  premiumSlotsUsed,
  tenantDisplayText,
}: ContactsTabProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const activeTenant = tenants[activeIdx] ?? null

  const ownerEntityLabel = landlord?.entityType
    ? landlord.entityType.charAt(0).toUpperCase() + landlord.entityType.slice(1).replaceAll("_", " ")
    : "Individual"
  const ownerSubtitle = landlord ? `${ownerEntityLabel} · Owner` : ""

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
            premiumEnabled={premiumEnabled}
            orgTier={orgTier}
            subscriptionStatus={subscriptionStatus}
            premiumSlotsUsed={premiumSlotsUsed}
            leaseLabel={tenantDisplayText}
          />
        )}
      </div>

      {/* Equal-height grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Owner section ── */}
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
            <OwnerCard
              landlord={landlord}
              subtitle={ownerSubtitle}
              orgId={orgId}
              portfolioOverviewSentAt={portfolioOverviewSentAt}
              portfolioOverviewOutdated={portfolioOverviewOutdated}
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

        {/* ── Tenant section ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
            {tenants.length === 1 ? "Tenant" : "Tenants"}
          </p>
          <div className="flex-1">
            <TenantCard
              tenants={tenants}
              leaseId={leaseId}
              activeIdx={activeIdx}
              onActiveChange={setActiveIdx}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
