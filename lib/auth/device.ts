import crypto from "crypto"
import { createServiceClient } from "@/lib/supabase/server"

export interface DeviceInfo {
  fingerprintId: string
  isNew: boolean
  label: string
  fingerprintHash: string
}

function deriveLabel(userAgent: string): string {
  const ua = userAgent.toLowerCase()
  let browser = "Browser"
  let os = ""

  if (ua.includes("chrome") && !ua.includes("edg") && !ua.includes("opr")) browser = "Chrome"
  else if (ua.includes("safari") && !ua.includes("chrome")) browser = "Safari"
  else if (ua.includes("firefox")) browser = "Firefox"
  else if (ua.includes("edg")) browser = "Edge"

  if (ua.includes("iphone")) os = "iPhone"
  else if (ua.includes("ipad")) os = "iPad"
  else if (ua.includes("android")) os = "Android"
  else if (ua.includes("mac os")) os = "macOS"
  else if (ua.includes("windows")) os = "Windows"
  else if (ua.includes("linux")) os = "Linux"

  return os ? `${browser} on ${os}` : browser
}

export async function hashString(value: string): Promise<string> {
  return crypto.createHash("sha256").update(value).digest("hex")
}

export async function resolveDeviceFingerprint(params: {
  userId: string
  userAgent: string
  acceptLanguage?: string
  ipCountry?: string
  ipCity?: string
}): Promise<DeviceInfo> {
  const { userId, userAgent, acceptLanguage = "", ipCountry, ipCity } = params

  const raw = `${userAgent}|${acceptLanguage}`
  const fingerprintHash = await hashString(raw)
  const label = deriveLabel(userAgent)

  const db = await createServiceClient()

  const { data: existing, error: selectErr } = await db
    .from("device_fingerprints")
    .select("id, label")
    .eq("user_id", userId)
    .eq("fingerprint_hash", fingerprintHash)
    .maybeSingle()

  if (selectErr) {
    console.error("[device_fingerprints] select failed:", selectErr.message)
  }

  if (existing) {
    // Update last_seen + geo fields
    await db
      .from("device_fingerprints")
      .update({
        last_seen_at:   new Date().toISOString(),
        last_ip_country: ipCountry ?? null,
        last_ip_city:    ipCity ?? null,
      })
      .eq("id", existing.id)

    return { fingerprintId: existing.id, isNew: false, label: existing.label, fingerprintHash }
  }

  // New device
  const { data: inserted, error: insertErr } = await db
    .from("device_fingerprints")
    .insert({
      user_id:          userId,
      fingerprint_hash: fingerprintHash,
      user_agent:       userAgent,
      label,
      last_ip_country:  ipCountry ?? null,
      last_ip_city:     ipCity ?? null,
    })
    .select("id")
    .single()

  if (insertErr || !inserted) {
    console.error("[device_fingerprints] insert failed:", insertErr?.message)
    return { fingerprintId: crypto.randomUUID(), isNew: true, label, fingerprintHash }
  }

  return { fingerprintId: inserted.id, isNew: true, label, fingerprintHash }
}
