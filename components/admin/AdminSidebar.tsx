/**
 * components/admin/AdminSidebar.tsx — Admin left sidebar with grouped nav sections
 *
 * Auth:   Rendered inside the admin layout (auth-gated by proxy + requireAdminAuth)
 * Notes:  Dark ink background matching the design system. Active item: amber left bar.
 *         Server component — badge counts fetched here and passed to nav items inline.
 */
import Link from "next/link"
import { headers } from "next/headers"
import { AccentBracket } from "@/components/ui/AccentBracket"
import { RoleBadge } from "./RoleBadge"
import { createServiceClient } from "@/lib/supabase/server"

interface InboxCounts {
  feedback: number
  lease_requests: number
  contact_leads: number
}

async function getInboxCounts(): Promise<InboxCounts> {
  const db = await createServiceClient()
  const [fbRes, lrRes, clRes] = await Promise.all([
    db.from("feedback_submissions").select("id", { count: "exact", head: true }).in("status", ["open", "in_progress"]),
    db.from("custom_lease_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("contact_leads").select("id", { count: "exact", head: true }).eq("status", "new"),
  ])
  return {
    feedback:       fbRes.count ?? 0,
    lease_requests: lrRes.count ?? 0,
    contact_leads:  clRes.count ?? 0,
  }
}

async function getCurrentPath(): Promise<string> {
  try {
    const h = await headers()
    return h.get("x-pathname") ?? h.get("x-invoke-path") ?? h.get("x-next-url") ?? ""
  } catch {
    return ""
  }
}

function NavBadge({ count }: Readonly<{ count: number }>) {
  if (count === 0) return null
  return (
    <span style={{
      fontFamily: "var(--mono)",
      fontSize: 10,
      fontWeight: 600,
      background: "var(--amber)",
      color: "var(--ink)",
      padding: "1px 6px",
      borderRadius: 999,
      minWidth: 18,
      textAlign: "center",
    }}>
      {count}
    </span>
  )
}

function isActive(href: string, pathname: string): boolean {
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/"
  return pathname === href || pathname.startsWith(href + "/")
}

const GROUP_TITLE_STYLE: React.CSSProperties = {
  padding: "0 12px 6px",
  fontFamily: "var(--mono)",
  fontSize: "9.5px",
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: "oklch(0.62 0.005 260)",
  fontWeight: 500,
  margin: 0,
}

function NavItem({ href, label, badge, external, pathname }: Readonly<{
  href: string; label: string; badge?: number; external?: boolean; pathname: string
}>) {
  const active = !external && isActive(href, pathname)
  return (
    <li>
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 12px 6px 18px",
          marginBottom: 1,
          fontSize: 13,
          color: active ? "var(--paper)" : "oklch(0.78 0.005 260)",
          fontWeight: active ? 500 : 400,
          borderRadius: 4,
          position: "relative",
          textDecoration: "none",
          background: active ? "oklch(0.22 0.015 260)" : "transparent",
        }}
      >
        {active && (
          <span style={{
            position: "absolute",
            left: 0,
            top: 6,
            bottom: 6,
            width: 2,
            background: "var(--amber)",
            borderRadius: 1,
          }} />
        )}
        <span style={{ flex: 1 }}>{label}</span>
        {badge !== undefined && <NavBadge count={badge} />}
      </Link>
    </li>
  )
}

export async function AdminSidebar() {
  const [pathname, counts] = await Promise.all([getCurrentPath(), getInboxCounts()])

  return (
    <aside style={{
      background: "var(--ink)",
      color: "var(--paper)",
      width: 232,
      flexShrink: 0,
      display: "flex",
      flexDirection: "column",
      borderRight: "1px solid oklch(0.30 0.012 260)",
      minHeight: "100vh",
    }}>
      {/* Brand */}
      <div style={{
        height: 56,
        padding: "0 18px",
        display: "flex",
        alignItems: "center",
        borderBottom: "1px solid oklch(0.30 0.012 260)",
      }}>
        <Link
          href="/admin"
          style={{
            fontFamily: "var(--sans)",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "baseline",
            color: "var(--paper)",
            textDecoration: "none",
            fontSize: 18,
          }}
          aria-label="Pleks admin"
        >
          plek<AccentBracket>s</AccentBracket>
        </Link>
      </div>

      {/* Role identity */}
      <div style={{
        padding: "14px 18px 8px",
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "0.16em",
        textTransform: "uppercase",
        color: "oklch(0.62 0.005 260)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span>Operator</span>
        <RoleBadge label="PLATFORM" />
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, overflowY: "auto", padding: "4px 8px 16px" }}>
        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>Overview</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin" label="Dashboard" pathname={pathname} />
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>Customers</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin/orgs"          label="Organisations"  pathname={pathname} />
            <NavItem href="/admin/subscriptions" label="Subscriptions"  pathname={pathname} />
            <NavItem href="/admin/waitlist"       label="Waitlist"      pathname={pathname} />
            <NavItem href="/admin/contact-leads"  label="Contact leads" pathname={pathname} badge={counts.contact_leads} />
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>Operations</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin/feedback"       label="Feedback"       pathname={pathname} badge={counts.feedback} />
            <NavItem href="/admin/lease-requests" label="Lease requests" pathname={pathname} badge={counts.lease_requests} />
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>Platform</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin/platform-health"          label="Health"  pathname={pathname} />
            <NavItem href="https://sentry.io"               label="Errors"  pathname={pathname} external />
            <NavItem href="https://uptime.betterstack.com"  label="Uptime"  pathname={pathname} external />
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>Content</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin/site-content" label="Site content" pathname={pathname} />
            <NavItem href="/admin/prime-rate"   label="Prime rate"   pathname={pathname} />
          </ul>
        </div>

        <div style={{ marginTop: 14 }}>
          <p style={GROUP_TITLE_STYLE}>System</p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            <NavItem href="/admin/audit" label="Audit log" pathname={pathname} />
          </ul>
        </div>
      </nav>
    </aside>
  )
}
