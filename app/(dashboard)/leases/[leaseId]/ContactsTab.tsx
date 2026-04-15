"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Phone, Mail, MessageCircle, MapPin, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react"
import { LeasePortalActions } from "./LeasePortalActions"

export interface TenantContactInfo {
  id: string
  name: string
  role: string
  email: string | null
  phone: string | null
  entityType: string | null
  tenantId: string
}

export interface LandlordContactInfo {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
}

interface ContactsTabProps {
  tenants: TenantContactInfo[]
  landlord: LandlordContactInfo | null
  leaseId: string
  portalInviteSentAt: string | null
  hasAuthUser: boolean
  primaryTenantId: string | null
}

const PILL_PAGE = 2

const AVATAR_SIZE: Record<string, string> = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
  lg: "h-10 w-10 text-sm",
}

function Avatar({ name, size = "md" }: { readonly name: string; readonly size?: "sm" | "md" | "lg" }) {
  const sz = AVATAR_SIZE[size] ?? AVATAR_SIZE.md
  return (
    <div className={`${sz} shrink-0 rounded-full bg-brand/20 font-semibold text-brand flex items-center justify-center`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}

function ContactRow({ icon, label, value }: { readonly icon: React.ReactNode; readonly label: string; readonly value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value || <span className="text-muted-foreground">—</span>}</p>
      </div>
      {value && (label === "Phone" || label === "Email") && (
        <a
          href={label === "Phone" ? `tel:${value}` : `mailto:${value}`}
          className="text-xs text-brand hover:underline shrink-0"
        >
          {label === "Phone" ? "Call" : "Email"}
        </a>
      )}
    </div>
  )
}

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

  return (
    <div>
      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="outline" size="sm" render={<Link href={`/leases/${leaseId}?tab=contacts#edit-tenants`} />}>
          Edit tenants
        </Button>
      </div>

      {/* Equal-height grid: cards are direct children so CSS Grid stretches them */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Left: Tenant card ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          {/* Pill switcher */}
          {tenants.length > 0 && (
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/40">
              {canGoBack && (
                <button
                  type="button"
                  onClick={() => setPageStart((p) => p - PILL_PAGE)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Previous tenants"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex gap-2 flex-1 flex-wrap">
                {visiblePills.map((t, i) => {
                  const realIdx = pageStart + i
                  const isActive = activeIdx === realIdx
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setActiveIdx(realIdx)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-colors ${
                        isActive
                          ? "bg-brand text-brand-dim border-brand"
                          : "border-border text-muted-foreground hover:border-brand/50 hover:text-foreground"
                      }`}
                    >
                      <Avatar name={t.name} size="sm" />
                      <span className="font-medium">{t.name}</span>
                      <span className="opacity-60">{t.role}</span>
                    </button>
                  )
                })}
              </div>
              {canGoForward && (
                <button
                  type="button"
                  onClick={() => setPageStart((p) => p + PILL_PAGE)}
                  className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Next tenants"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* Tenant details — fixed min-height so pill switch doesn't shift layout */}
          <div className="min-h-[200px]">
            {activeTenant ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <Avatar name={activeTenant.name} size="lg" />
                  <div>
                    <p className="font-semibold">{activeTenant.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {activeTenant.entityType ?? "Individual"} · {activeTenant.role}
                    </p>
                  </div>
                  {activeTenant.tenantId && (
                    <Link href={`/tenants/${activeTenant.tenantId}`} className="ml-auto text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                <ContactRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={activeTenant.phone} />
                <ContactRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={activeTenant.email} />
                <ContactRow icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" value={activeTenant.phone} />
                <ContactRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={null} />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No tenant linked.</p>
            )}
          </div>

          {/* Portal actions — separated at bottom of tenant card */}
          {primaryTenantId && (
            <div className="mt-4 pt-4 border-t border-border/40">
              <LeasePortalActions
                tenantId={primaryTenantId}
                leaseId={leaseId}
                portalInviteSentAt={portalInviteSentAt}
                hasAuthUser={hasAuthUser}
              />
            </div>
          )}
        </div>

        {/* ── Right: Owner card (stretches to match left via CSS Grid) ── */}
        <div className="rounded-xl border bg-card p-4 flex flex-col">
          {landlord ? (
            <>
              {/* Two-row split-aligned owner name */}
              <div className="mb-4 pb-3 border-b border-border/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={landlord.name} size="lg" />
                    <p className="font-semibold truncate">{landlord.name}</p>
                  </div>
                  <p className="text-xs text-muted-foreground shrink-0">owner</p>
                </div>
                {landlord.company && (
                  <div className="mt-0.5 pl-[52px]">
                    <p className="text-xs text-muted-foreground truncate">{landlord.company}</p>
                  </div>
                )}
              </div>

              <ContactRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={landlord.phone} />
              <ContactRow icon={<Mail className="h-3.5 w-3.5" />} label="Email" value={landlord.email} />
              <ContactRow icon={<MessageCircle className="h-3.5 w-3.5" />} label="WhatsApp" value={landlord.phone} />
              <ContactRow icon={<MapPin className="h-3.5 w-3.5" />} label="Address" value={null} />
              {landlord.id && (
                <div className="mt-3">
                  <Link href={`/landlords/${landlord.id}`} className="text-xs text-brand hover:underline">
                    View landlord profile →
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center min-h-[200px]">
              <p className="text-sm text-muted-foreground">No owner linked to this property.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
