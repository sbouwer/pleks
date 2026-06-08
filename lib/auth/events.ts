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

export async function logAuthEvent(params: LogAuthEventParams): Promise<void> {
  try {
    let deviceFingerprintId = params.deviceFingerprintId ?? null
    let deviceLabel = params.deviceLabel ?? null

    // On a successful auth event, record/refresh this device so "Active sessions" populates.
    // This is the only writer of device_fingerprints. Best-effort — never break event logging.
    if (params.success && !deviceFingerprintId) {
      try {
        const h = await headers()
        const ua = h.get("user-agent") ?? ""
        if (ua) {
          const device = await resolveDeviceFingerprint({
            userId: params.userId,
            userAgent: ua,
            acceptLanguage: h.get("accept-language") ?? "",
            ipCountry: params.ipCountry,
            ipCity: params.ipCity,
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
      ip_country:         params.ipCountry ?? null,
      ip_city:            params.ipCity ?? null,
      user_agent_hash:    params.userAgentHash ?? null,
      device_label:       deviceLabel,
      device_fingerprint: deviceFingerprintId,
      session_id:         params.sessionId ?? null,
      failure_reason:     params.failureReason ?? null,
      metadata:           params.metadata ?? {},
    })
  } catch (err) {
    // Auth events are observability — never let a logging failure break the auth flow
    console.error("[auth_events] insert failed:", err)
  }
}
