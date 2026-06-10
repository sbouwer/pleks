/**
 * lib/auth/events.ts — Write-only auth event logger into auth_events table
 *
 * Notes: fire-and-forget — errors are swallowed so a logging failure never
 *        blocks the auth flow that called it. On a SUCCESSFUL event it also
 *        resolves/refreshes the caller's device_fingerprints row (from the
 *        request UA + IP) so Settings → Security "Active sessions" populates —
 *        the only place that writes device_fingerprints. Best-effort: a headers()
 *        or fingerprint failure must never break event logging.
 */
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveDeviceFingerprint } from "@/lib/auth/device"
import { sendSecurityNotificationEmail, type SecurityEventType } from "@/lib/auth/security-notification-email"

type AuthEventType =
  | "login_success" | "login_failure" | "logout"
  | "password_changed" | "email_changed"
  | "totp_enrolled" | "totp_unenrolled" | "totp_verified" | "totp_failed"
  | "passkey_enrolled" | "passkey_unenrolled" | "passkey_verified" | "passkey_failed"
  | "step_up_challenged" | "step_up_verified" | "step_up_failed"
  | "session_revoked" | "new_device_detected" | "recovery_used" | "role_switched"
  | "tenant_portal_login" | "landlord_portal_login" | "supplier_portal_login" | "agent_portal_login"

type AuthMethod = "password" | "magic_link" | "totp" | "passkey" | "recovery_code" | "oauth" | "admin"

interface LogAuthEventParams {
  userId: string
  eventType: AuthEventType
  success: boolean
  orgId?: string | null
  authMethod?: AuthMethod
  activeRole?: string
  aal?: "aal1" | "aal2"
  ipHash?: string
  ipCountry?: string
  ipCity?: string
  userAgentHash?: string
  deviceLabel?: string
  deviceFingerprintId?: string
  sessionId?: string
  failureReason?: string
  metadata?: Record<string, unknown>
}

// Sensitive events that ALSO send a Pleks-branded security email (after the auth_events row is written).
const SECURITY_NOTIFY = new Set<AuthEventType>([
  "password_changed", "totp_enrolled", "totp_unenrolled", "passkey_enrolled", "passkey_unenrolled", "recovery_used",
])

/**
 * Fire the Pleks-branded security email for a sensitive event. STRICTLY after the auth_events insert, own
 * try/catch (a slow/failing email must never sit upstream of the record-of-truth), timeout-bounded so a hung
 * send can't stall the awaited auth action. Reuses the device/geo logAuthEvent already resolved — no extra
 * lookups beyond the recipient's email/name. Best-effort: errors AND timeouts are swallowed.
 */
async function notifySecurityEvent(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  params: LogAuthEventParams,
  deviceLabel: string | null,
  ipCity: string | null,
  ipCountry: string | null,
): Promise<void> {
  try {
    const [{ data: u }, { data: profile }] = await Promise.all([
      db.auth.admin.getUserById(params.userId),
      db.from("user_profiles").select("full_name").eq("id", params.userId).maybeSingle(),
    ])
    const email = u.user?.email
    if (!email) return
    const location = [ipCity, ipCountry].filter(Boolean).join(", ") || null
    const send = sendSecurityNotificationEmail({
      to: email,
      userName: profile?.full_name ?? "there",
      eventType: params.eventType as SecurityEventType,
      deviceLabel,
      location,
    }).catch((e) => console.error("[auth_events] security notification send error:", e))
    const timeout = new Promise<void>((resolve) => { setTimeout(resolve, 4000) })
    await Promise.race([send, timeout])
  } catch (e) {
    console.error("[auth_events] security notification failed:", e)
  }
}

export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
  try {
    let deviceFingerprintId = params.deviceFingerprintId ?? null
    let deviceLabel = params.deviceLabel ?? null
    let ipCountry = params.ipCountry ?? null
    let ipCity = params.ipCity ?? null

    // On a successful auth event, record/refresh this device so "Active sessions" populates, and
    // derive geo from Vercel's edge headers. This is the only writer of device_fingerprints + the
    // only geo source. Best-effort — never break event logging. (Edge geo headers are absent on
    // localhost, so Location stays empty in dev; populated in prod/preview.)
    if (params.success && !deviceFingerprintId) {
      try {
        const h = await headers()
        const ua = h.get("user-agent") ?? ""
        if (ua) {
          ipCountry = ipCountry ?? h.get("x-vercel-ip-country")
          const cityRaw = h.get("x-vercel-ip-city")
          if (!ipCity && cityRaw) ipCity = decodeURIComponent(cityRaw)
          const device = await resolveDeviceFingerprint({
            userId: params.userId,
            userAgent: ua,
            acceptLanguage: h.get("accept-language") ?? "",
            ipCountry: ipCountry ?? undefined,
            ipCity: ipCity ?? undefined,
          })
          deviceFingerprintId = device.fingerprintId
          deviceLabel = deviceLabel ?? device.label
        }
      } catch (e) {
        console.error("[auth_events] device fingerprint resolve failed:", e)
      }
    }

    const db = await createServiceClient()
    await db.from("auth_events").insert({
      user_id:            params.userId,
      org_id:             params.orgId ?? null,
      event_type:         params.eventType,
      success:            params.success,
      auth_method:        params.authMethod ?? null,
      active_role:        params.activeRole ?? null,
      aal:                params.aal ?? null,
      ip_hash:            params.ipHash ?? null,
      ip_country:         ipCountry,
      ip_city:            ipCity,
      user_agent_hash:    params.userAgentHash ?? null,
      device_label:       deviceLabel,
      device_fingerprint: deviceFingerprintId,
      session_id:         params.sessionId ?? null,
      failure_reason:     params.failureReason ?? null,
      metadata:           params.metadata ?? {},
    })

    // Notify SECOND — strictly after the record-of-truth insert (condition: log first, notify second).
    if (params.success && SECURITY_NOTIFY.has(params.eventType)) {
      await notifySecurityEvent(db, params, deviceLabel, ipCity, ipCountry)
    }
  } catch (err) {
    // Auth events are observability — never let a logging failure break the auth flow
    console.error("[auth_events] insert failed:", err)
  }
}
