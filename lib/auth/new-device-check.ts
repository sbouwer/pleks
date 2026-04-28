/**
 * lib/auth/new-device-check.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createServiceClient } from "@/lib/supabase/server"
import { sendLoginNotificationEmail } from "./login-notification-email"
import { logAuthEvent } from "./events"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.pleks.co.za"

interface NotifyParams {
  userId: string
  deviceFingerprintId: string
  eventId: string
}

export async function maybeNotifyNewDevice(params: NotifyParams): Promise<void> {
  const { userId, deviceFingerprintId, eventId } = params

  try {
    const db = await createServiceClient()

    // Check if this device has been notified in the last 30 days
    const { data: existing, error: existingErr } = await db
      .from("login_notifications_sent")
      .select("id, last_notified_at, notification_count")
      .eq("user_id", userId)
      .eq("device_fingerprint", deviceFingerprintId)
      .maybeSingle()

    if (existingErr) {
      console.error("[new-device-check] lookup failed:", existingErr.message)
      return
    }

    if (existing) {
      const daysSince = (Date.now() - new Date(existing.last_notified_at).getTime()) / 86_400_000
      if (daysSince < 30) return // Already notified recently, skip
    }

    // Fetch user email and the auth event details
    const [userRes, eventRes] = await Promise.all([
      db.auth.admin.getUserById(userId),
      db
        .from("auth_events")
        .select("created_at, device_label, ip_city, ip_country, auth_method")
        .eq("id", eventId)
        .single(),
    ])

    if (eventRes.error || !eventRes.data) return

    const authUser = userRes.data.user
    const email = authUser?.email
    if (!authUser || !email) return

    const event = eventRes.data
    const displayName =
      (authUser.user_metadata?.full_name as string | undefined) ??
      (authUser.user_metadata?.first_name as string | undefined) ??
      email.split("@")[0]

    await sendLoginNotificationEmail({
      to: email,
      userName: displayName,
      deviceLabel: event.device_label ?? "Unknown device",
      city: event.ip_city,
      country: event.ip_country,
      method: event.auth_method,
      timeAgo: "just now",
      revokeUrl: `${APP_URL}/settings/security/sessions?revoke=${deviceFingerprintId}`,
    })

    // Upsert the notification record
    await db
      .from("login_notifications_sent")
      .upsert(
        {
          user_id:            userId,
          device_fingerprint: deviceFingerprintId,
          last_notified_at:   new Date().toISOString(),
          notification_count: (existing?.notification_count ?? 0) + 1,
        },
        { onConflict: "user_id,device_fingerprint" }
      )

    // Emit auth event for observability
    await logAuthEvent({
      userId,
      eventType: "new_device_detected",
      success: true,
      deviceFingerprintId,
      metadata: {
        notification_sent: true,
        previous_notifications: existing?.notification_count ?? 0,
      },
    })
  } catch (err) {
    console.error("[new-device-check] failed:", err)
  }
}
