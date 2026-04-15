"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ContactCard, type PortalStatus } from "@/components/contacts/ContactCard"
import { LeasePortalActions } from "./LeasePortalActions"

export interface TenantContactInfo {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
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
  readonly portalInviteSentAt: string | null
  readonly hasAuthUser: boolean
  readonly primaryTenantId: string | null
}

const PILL_PAGE = 3

export function ContactsTab({
  tenants,
  landlord,
  leaseId,
  portalInviteSentAt,
  hasAuthUser,
  primaryTenantId,
}: ContactsTabProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [pageStart, setPageStart] = useState(0)

  const activeTenant = tenants[activeIdx] ?? null
  const visiblePills = tenants.slice(pageStart, pageStart + PILL_PAGE)
  const canGoBack = pageStart > 0
  const canGoForward = pageStart + PILL_PAGE < tenants.length

  const tenantSubtitle = activeTenant
    ? `${activeTenant.entityType ?? "Individual"} · ${activeTenant.role}`
    : ""

  const ownerSubtitle = landlord?.company ?? "Self-managed"

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<Link href={`/leases/${leaseId}?tab=contacts#edit-tenants`} />}>
          Edit tenants
        </Button>
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
          {/* Pill switcher (only when multiple tenants) */}
          {tenants.length > 1 && (
            <div className="flex items-center gap-1 mb-4 pb-3 border-b border-border/40">
              {canGoBack && (
                <button
                  type="button"
                  onClick={() => setPageStart((p) => p - PILL_PAGE)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Previous tenants"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex gap-1 flex-1 flex-wrap">
                {visiblePills.map((t, i) => {
                  const realIdx = pageStart + i
                  const isActive = activeIdx === realIdx
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveIdx(realIdx)}
                      className={`px-3 py-1 text-xs font-medium transition-colors border-b-2 ${
                        isActive
                          ? "border-brand text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t.name}
                    </button>
                  )
                })}
              </div>
              {canGoForward && (
                <button
                  type="button"
                  onClick={() => setPageStart((p) => p + PILL_PAGE)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  aria-label="Next tenants"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Card body */}
          <div className="flex-1 min-h-[220px]">
            {activeTenant ? (
              <ContactCard
                name={activeTenant.name}
                subtitle={tenantSubtitle}
                avatarVariant="brand"
                email={activeTenant.email}
                phone={activeTenant.phone}
                profileHref={`/tenants/${activeTenant.tenantId}`}
                showInfo
                entityType={activeTenant.entityType}
                idOrRegNumber={activeTenant.idOrRegNumber}
                idOrRegLabel={activeTenant.idOrRegLabel}
                ficaVerified={activeTenant.ficaVerified}
                portalStatus={activeTenant.portalStatus}
                welcomePackSentAt={activeTenant.welcomePackSentAt}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            )}
          </div>
        </div>

        {/* ── Owner card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          {landlord ? (
            <ContactCard
              name={landlord.name}
              subtitle={ownerSubtitle}
              avatarVariant="blue"
              email={landlord.email}
              phone={landlord.phone}
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
              <p className="text-sm text-muted-foreground">No owner linked to this property.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
