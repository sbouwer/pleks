"use client"

import { useState, useTransition, useEffect, useRef } from "react"
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

const AVATAR_MAX = 4

function CoTenantAvatars({
  tenants,
  activeIdx,
  onSelect,
}: {
  readonly tenants: TenantContactInfo[]
  readonly activeIdx: number
  readonly onSelect: (i: number) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const visible = tenants.slice(0, AVATAR_MAX)
  const overflow = tenants.slice(AVATAR_MAX)

  return (
    <div ref={ref} className="flex items-center gap-1 relative">
      {visible.map((t, i) => {
        const isActive = activeIdx === i
        const avatarCls = AVATAR_VARIANT[t.role] === "brand" ? "bg-brand/20 text-brand" : "bg-blue-100 text-blue-700"
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(i)}
            title={`${t.name} · ${t.role}`}
            className={`h-6 w-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-all ${avatarCls} ${
              isActive ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : "opacity-50 hover:opacity-80"
            }`}
          >
            {t.name.slice(0, 2).toUpperCase()}
          </button>
        )
      })}
      {overflow.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            className={`h-6 w-6 rounded-full text-[9px] font-bold flex items-center justify-center transition-all bg-muted text-muted-foreground hover:bg-muted/80 ${
              activeIdx >= AVATAR_MAX ? "ring-2 ring-brand ring-offset-1 ring-offset-card" : ""
            }`}
          >
            +{overflow.length}
          </button>
          {open && (
            <div className="absolute right-0 top-7 z-20 min-w-[160px] rounded-lg border border-border bg-card shadow-md py-1">
              {overflow.map((t, i) => {
                const realIdx = AVATAR_MAX + i
                const isActive = activeIdx === realIdx
                const avatarCls = AVATAR_VARIANT[t.role] === "brand" ? "bg-brand/20 text-brand" : "bg-blue-100 text-blue-700"
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onSelect(realIdx); setOpen(false) }}
                    className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-muted transition-colors ${isActive ? "text-brand font-semibold" : ""}`}
                  >
                    <span className={`h-5 w-5 shrink-0 rounded-full text-[9px] font-bold flex items-center justify-center ${avatarCls}`}>
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate">{t.name}</span>
                    <span className="text-[10px] text-muted-foreground/70 shrink-0">{t.role}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
                portalStatus={activeTenant.portalStatus}
                welcomePackSentAt={activeTenant.welcomePackSentAt}
                onSendWelcomePack={activeTenant.role === "Primary" && !sendingWelcome ? handleSendWelcomePack : undefined}
                headerActions={tenants.length > 1 ? (
                  <CoTenantAvatars tenants={tenants} activeIdx={activeIdx} onSelect={setActiveIdx} />
                ) : undefined}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            )}
          </div>
        </div>

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
