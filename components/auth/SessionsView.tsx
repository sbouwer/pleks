"use client"

/**
 * components/auth/SessionsView.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Monitor, Smartphone, Loader2, AlertCircle } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface AuthEvent {
  id: string
  event_type: string
  auth_method: string | null
  device_label: string | null
  device_fingerprint: string | null
  ip_city: string | null
  ip_country: string | null
  created_at: string
  success: boolean
}

interface DeviceFingerprint {
  id: string
  label: string
  last_seen_at: string
  last_ip_city: string | null
  last_ip_country: string | null
  revoked_at: string | null
}

interface Props {
  readonly userId: string
  readonly selfOnly?: boolean
  /** Rendered inside a settings category tab — drop the centered standalone-page chrome + own heading. */
  readonly embedded?: boolean
}

function deviceIcon(label: string | null) {
  const l = (label ?? "").toLowerCase()
  if (l.includes("iphone") || l.includes("android") || l.includes("mobile")) {
    return <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
  }
  return <Monitor className="h-4 w-4 shrink-0 text-muted-foreground" />
}

export function SessionsView({ userId: _userId, selfOnly: _selfOnly, embedded }: Props) {
  const [events, setEvents] = useState<AuthEvent[]>([])
  const [devices, setDevices] = useState<DeviceFingerprint[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [showAllEvents, setShowAllEvents] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    Promise.all([
      supabase
        .from("auth_events")
        .select("id,event_type,auth_method,device_label,device_fingerprint,ip_city,ip_country,created_at,success")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("device_fingerprints")
        .select("id,label,last_seen_at,last_ip_city,last_ip_country,revoked_at")
        .is("revoked_at", null)
        .order("last_seen_at", { ascending: false }),
    ]).then(([eventsRes, devicesRes]) => {
      if (eventsRes.error) console.error("SessionsView auth_events:", eventsRes.error.message)
      if (devicesRes.error) console.error("SessionsView device_fingerprints:", devicesRes.error.message)
      if (eventsRes.data) setEvents(eventsRes.data)
      if (devicesRes.data) setDevices(devicesRes.data)
      setLoading(false)
    })
  }, [])

  async function revokeDevice(deviceId: string) {
    setRevoking(deviceId)
    try {
      const res = await fetch("/api/auth/revoke-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceFingerprintId: deviceId }),
      })
      if (res.ok) {
        setDevices(prev => prev.filter(d => d.id !== deviceId))
      }
    } finally {
      setRevoking(null)
    }
  }

  async function revokeAll() {
    setRevoking("all")
    try {
      const res = await fetch("/api/auth/revoke-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revokeAll: true }),
      })
      if (res.ok) {
        setDevices([])
      }
    } finally {
      setRevoking(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className={embedded ? "max-w-2xl space-y-8" : "mx-auto max-w-2xl space-y-8 px-4 py-8"}>
      {!embedded && (
        <div>
          <h1 className="font-heading text-2xl mb-1">Your sign-in activity</h1>
          <p className="text-sm text-muted-foreground">
            Manage sessions and review your recent login history.
          </p>
        </div>
      )}

      {/* Active devices */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Active sessions
          </h2>
          {devices.length > 1 && (
            <button
              onClick={revokeAll}
              disabled={revoking === "all"}
              className="text-xs text-danger hover:underline"
            >
              {revoking === "all" ? "Revoking..." : "Revoke all other sessions"}
            </button>
          )}
        </div>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        ) : (
          <div className="rounded-lg border border-rule bg-surface-raised divide-y divide-rule">
            {devices.map(device => (
              <div key={device.id} className="flex items-start gap-3 p-4">
                {deviceIcon(device.label)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{device.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[device.last_ip_city, device.last_ip_country].filter(Boolean).join(", ")}
                    {" · "}
                    Last seen {formatDistanceToNow(new Date(device.last_seen_at), { addSuffix: true })}
                  </div>
                </div>
                <button
                  onClick={() => revokeDevice(device.id)}
                  disabled={revoking === device.id}
                  className="text-xs text-danger hover:underline shrink-0"
                >
                  {revoking === device.id ? "Revoking..." : "Revoke"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent activity */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Recent activity
        </h2>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <div className="divide-y divide-border rounded-[var(--r-button)] border border-border">
            {(showAllEvents ? events : events.slice(0, 5)).map(event => (
              <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                {!event.success && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />}
                {event.success && <div className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm leading-tight">
                    {formatEventType(event.event_type)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[event.device_label, event.ip_city, event.ip_country].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">
                  {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                </div>
              </div>
            ))}
            {events.length > 5 && (
              <button
                type="button"
                onClick={() => setShowAllEvents((v) => !v)}
                className="w-full px-4 py-2.5 text-xs font-medium text-primary transition-colors hover:bg-muted/40"
              >
                {showAllEvents ? "Show less" : `Show ${events.length - 5} more`}
              </button>
            )}
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Not you?{" "}
        <a href="mailto:security@pleks.co.za" className="hover:underline">
          Contact us at security@pleks.co.za
        </a>
      </p>
    </div>
  )
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    login_success: "Signed in",
    login_failure: "Failed sign-in attempt",
    logout: "Signed out",
    password_changed: "Password changed",
    totp_enrolled: "Authenticator enrolled",
    totp_unenrolled: "Authenticator removed",
    totp_verified: "Two-factor verified",
    passkey_enrolled: "Passkey enrolled",
    passkey_verified: "Signed in with passkey",
    step_up_verified: "Security confirmation",
    session_revoked: "Session revoked",
    new_device_detected: "New device detected",
    role_switched: "Switched workspace",
  }
  return map[type] ?? type.replaceAll("_", " ")
}
