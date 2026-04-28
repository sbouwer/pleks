"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import type { RoleMembership } from "@/lib/auth/roles"

interface MembershipWithIcon extends RoleMembership {
  icon: string
}

export function RoleSelectorClient({ memberships }: { memberships: MembershipWithIcon[] }) {
  const [pending, startTransition] = useTransition()
  const [selecting, setSelecting] = useState<string | null>(null)

  function handleSelect(m: MembershipWithIcon) {
    setSelecting(`${m.role}:${m.scope_id}`)
    startTransition(async () => {
      try {
        const res = await fetch("/api/switch-role", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: m.role, scope_id: m.scope_id, org_id: m.org_id }),
        })
        if (!res.ok) {
          toast.error("Could not switch workspace")
          setSelecting(null)
          return
        }
        // Follow the redirect the server returns
        window.location.href = res.url
      } catch {
        toast.error("Could not switch workspace")
        setSelecting(null)
      }
    })
  }

  // Group memberships by role scope
  const groups: { label: string; items: MembershipWithIcon[] }[] = []
  const agentItems   = memberships.filter(m => m.scope === "org")
  const tenantItems  = memberships.filter(m => m.scope === "tenant")
  const landlordItems = memberships.filter(m => m.scope === "landlord")
  const supplierItems = memberships.filter(m => m.scope === "supplier")

  if (agentItems.length)    groups.push({ label: "Agent workspace",    items: agentItems })
  if (tenantItems.length)   groups.push({ label: "Tenancies",          items: tenantItems })
  if (landlordItems.length) groups.push({ label: "Landlord workspace", items: landlordItems })
  if (supplierItems.length) groups.push({ label: "Supplier workspace", items: supplierItems })

  return (
    <div className="space-y-6">
      {groups.map(group => (
        <div key={group.label}>
          {groups.length > 1 && (
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2 px-1">
              {group.label}
            </p>
          )}
          <div className="space-y-2">
            {group.items.map(m => {
              const key = `${m.role}:${m.scope_id}`
              const isSelecting = selecting === key
              return (
                <button
                  key={key}
                  type="button"
                  disabled={pending}
                  onClick={() => handleSelect(m)}
                  className="w-full flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <span className="text-2xl leading-none">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{m.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{m.org_name}</p>
                  </div>
                  <span className="text-brand text-sm font-medium shrink-0">
                    {isSelecting ? "Entering…" : "Enter →"}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
