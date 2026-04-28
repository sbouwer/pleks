"use client"

/**
 * components/layout/TopBar.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState } from "react"
import { ExternalLink, LogOut, Moon, Sun, User, UserCircle } from "lucide-react"
import { GlobalSearch } from "@/components/layout/GlobalSearch"
import { SyncIndicator } from "@/components/layout/SyncIndicator"
import { usePortalTheme } from "@/components/layout/PortalThemeProvider"
import { useUser } from "@/hooks/useUser"
import { useOrg } from "@/hooks/useOrg"
import { useRouter } from "next/navigation"
import { RoleSwitcher } from "@/components/role-switcher/RoleSwitcher"

interface TopbarProps {
  readonly settingsHref?: string
  readonly visitSiteHref?: string
  readonly visitSiteLabel?: string
}

export function Topbar({
  settingsHref = "/settings",
  visitSiteHref = "/",
  visitSiteLabel = "Visit site",
}: TopbarProps) {
  const { user } = useUser()
  const { displayName } = useOrg()
  const { theme, toggle } = usePortalTheme()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
  }

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 40,
      background: "color-mix(in oklch, var(--background) 94%, transparent)",
      backdropFilter: "saturate(140%) blur(8px)",
      borderBottom: "1px solid var(--rule)",
      height: 64, display: "flex", alignItems: "center",
      padding: "0 16px 0 20px", gap: 16, flexShrink: 0,
    }}>

      {/* Left: org name */}
      <span className="hidden sm:inline" style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-mute)" }}>
        {displayName}
      </span>

      {/* Centre: global search — desktop only */}
      <div className="absolute left-1/2 -translate-x-1/2 hidden lg:flex">
        <GlobalSearch />
      </div>

      {/* Right: actions */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
        <RoleSwitcher />
        <SyncIndicator />

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          className="pub-icon-btn"
          aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
        >
          {theme === "light" ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        {/* Visit site */}
        <a
          href={visitSiteHref}
          target="_blank"
          rel="noopener noreferrer"
          className="pub-icon-btn hidden sm:flex"
          aria-label={visitSiteLabel}
        >
          <ExternalLink size={15} />
        </a>

        {/* Profile */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setProfileOpen(p => !p)}
            className="pub-icon-btn pub-icon-btn--active"
            aria-label="Account menu"
          >
            <User size={15} />
          </button>

          {profileOpen && (
            <>
              {/* Backdrop */}
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setProfileOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 40, cursor: "default", background: "transparent", border: "none" }}
              />
              {/* Dropdown */}
              <div style={{
                position: "absolute", right: 0, top: 42, zIndex: 50, minWidth: 200,
                borderRadius: "var(--r-md)", border: "1px solid var(--rule)",
                background: "var(--paper-raised)", boxShadow: "var(--shadow-2)", padding: "4px 0",
              }}>
                <p style={{ padding: "8px 12px", borderBottom: "1px solid var(--rule)", margin: 0, fontSize: 12, color: "var(--ink-mute)" }}>
                  {user?.email}
                </p>
                <button
                  type="button"
                  onClick={() => { setProfileOpen(false); router.push(settingsHref) }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--ink)", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  <UserCircle size={14} style={{ color: "var(--ink-mute)" }} />
                  Settings
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", fontSize: 13, color: "var(--danger)", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer" }}
                >
                  <LogOut size={14} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
