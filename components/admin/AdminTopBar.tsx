/**
 * components/admin/AdminTopBar.tsx — Admin top bar with breadcrumb, dark mode, and sign-out
 *
 * Auth:   Rendered inside admin layout (auth-gated)
 * Notes:  Client component for pathname detection, dark mode toggle, and sign-out.
 *         ExportNotificationBadge is passed as children from the server layout.
 */
"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut, Moon, Sun } from "lucide-react"
import { useEffect, useState } from "react"

const PAGE_LABELS: Record<string, string> = {
  "/admin":                 "Dashboard",
  "/admin/orgs":            "Organisations",
  "/admin/subscriptions":   "Subscriptions",
  "/admin/waitlist":        "Waitlist",
  "/admin/contact-leads":   "Contact leads",
  "/admin/feedback":        "Feedback",
  "/admin/lease-requests":  "Lease requests",
  "/admin/platform-health": "Platform health",
  "/admin/site-content":    "Site content",
  "/admin/prime-rate":      "Prime rate",
  "/admin/audit":           "Audit log",
}

function getPageLabel(pathname: string): string {
  if (PAGE_LABELS[pathname]) return PAGE_LABELS[pathname]
  for (const [prefix, label] of Object.entries(PAGE_LABELS)) {
    if (prefix !== "/admin" && pathname.startsWith(prefix + "/")) return label
  }
  return "Admin"
}

function applyTheme(isDark: boolean) {
  document.querySelector(".pleks-portal")?.setAttribute("data-theme", isDark ? "dark" : "light")
}

export function AdminTopBar({ children }: Readonly<{ children?: React.ReactNode }>) {
  const pathname = usePathname()
  const router   = useRouter()
  const pageLabel = getPageLabel(pathname ?? "")

  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("pleks-admin-theme")
    const isDark = saved === "dark"
    setDark(isDark)
    applyTheme(isDark)
  }, [])

  function toggleDark() {
    const next = !dark
    setDark(next)
    localStorage.setItem("pleks-admin-theme", next ? "dark" : "light")
    applyTheme(next)
  }

  async function handleSignOut() {
    await fetch("/api/admin/logout", { method: "POST" })
    router.push("/admin/login")
  }

  return (
    <header style={{
      height: 56,
      background: "var(--paper-raised)",
      borderBottom: "1px solid var(--rule)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 28px",
      flexShrink: 0,
      gap: 12,
    }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ color: "var(--ink-mute)", fontSize: 12, fontFamily: "var(--mono)", letterSpacing: "0.04em" }}>
          admin
        </span>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
          {pageLabel}
        </span>
      </div>

      {/* Right cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
        {/* Export badge slot (server component injected by layout) */}
        {children}

        {/* Dark mode toggle */}
        <button
          type="button"
          onClick={toggleDark}
          aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          title={dark ? "Light mode" : "Dark mode"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 32,
            height: 32,
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--rule)",
            background: "transparent",
            color: "var(--ink-mute)",
            cursor: "pointer",
          }}
        >
          {dark ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          aria-label="Sign out"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 12px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--rule)",
            background: "transparent",
            color: "var(--ink-mute)",
            cursor: "pointer",
            fontFamily: "var(--sans)",
            fontSize: 12,
          }}
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>
    </header>
  )
}
