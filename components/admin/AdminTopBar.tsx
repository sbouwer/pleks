/**
 * components/admin/AdminTopBar.tsx — Admin top bar with breadcrumb and sign-out
 *
 * Auth:   Rendered inside admin layout (auth-gated)
 * Notes:  Breadcrumb "admin / Page Title" left; sign-out right.
 *         Client component for interactive sign-out and pathname detection.
 */
"use client"

import { usePathname, useRouter } from "next/navigation"
import { LogOut } from "lucide-react"

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

export function AdminTopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const pageLabel = getPageLabel(pathname ?? "")

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
    }}>
      {/* Breadcrumb */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          color: "var(--ink-mute)",
          fontSize: 12,
          fontFamily: "var(--mono)",
          letterSpacing: "0.04em",
        }}>
          admin
        </span>
        <span style={{ color: "var(--ink-faint)" }}>/</span>
        <span style={{ color: "var(--ink)", fontSize: 14, fontWeight: 600 }}>
          {pageLabel}
        </span>
      </div>

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
    </header>
  )
}
