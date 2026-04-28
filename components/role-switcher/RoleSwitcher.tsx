"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import type { RoleMembership } from "@/lib/auth/roles"

const ROLE_ICONS: Record<string, string> = {
  tenant:              "🏠",
  landlord:            "🏢",
  supplier:            "🔧",
  contractor:          "🔧",
  owner:               "⚙️",
  property_manager:    "📋",
  agent:               "👤",
  accountant:          "📊",
  maintenance_manager: "🔨",
}

interface RoleSwitcherProps {
  readonly activeRole?: string
}

export function RoleSwitcher({ activeRole }: RoleSwitcherProps) {
  const [roles, setRoles] = useState<RoleMembership[]>([])
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/auth/available-roles")
      .then(r => r.ok ? r.json() : { roles: [] })
      .then((data: { roles: RoleMembership[] }) => {
        setRoles(data.roles)
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  if (!loaded || roles.length <= 1) return null

  const active = roles.find(r => r.role === activeRole) ?? roles[0]
  const others = roles.filter(r => !(r.role === active.role && r.scope_id === active.scope_id))

  async function switchTo(m: RoleMembership) {
    setOpen(false)
    setSwitching(true)
    try {
      const res = await fetch("/api/switch-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: m.role, scope_id: m.scope_id, org_id: m.org_id }),
      })
      if (res.ok || res.redirected) {
        // Hard navigate — role switch must reload session cookies
        globalThis.location.assign(res.url)
      }
    } catch {
      setSwitching(false)
    }
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        disabled={switching}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 6,
          border: "1px solid var(--rule)", background: "var(--surface-raised)",
          fontSize: 12, fontWeight: 500, color: "var(--ink-base)",
          cursor: switching ? "wait" : "pointer",
          transition: "background .15s, border-color .15s",
        }}
      >
        {switching ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <span>{ROLE_ICONS[active.role] ?? "👤"}</span>
        )}
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {active.label}
        </span>
        <ChevronDown className="size-3 opacity-60" />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 220,
          zIndex: 9999, borderRadius: 8,
          border: "1px solid var(--rule)", background: "var(--surface-raised)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", padding: "4px 0",
        }}>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase",
            color: "var(--ink-faint)", padding: "6px 12px 4px" }}>
            Switch workspace
          </p>
          {others.map(m => (
            <button
              key={`${m.role}:${m.scope_id}`}
              type="button"
              onPointerDown={e => { e.preventDefault(); switchTo(m) }}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 12px", textAlign: "left",
                fontSize: 13, color: "var(--ink-base)",
                background: "none", border: "none", cursor: "pointer",
                transition: "background .1s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
              onMouseLeave={e => (e.currentTarget.style.background = "none")}
            >
              <span>{ROLE_ICONS[m.role] ?? "👤"}</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
