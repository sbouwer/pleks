import { hasFeature } from "@/lib/tier/gates"
import { getOrgTier } from "@/lib/tier/getOrgTier"

interface SMSResult {
  sent: boolean
  skipped?: boolean
  reason?: string
}

export async function sendSMS(
  orgId: string,
  to: string,
  message: string
): Promise<SMSResult> {
  // Tier gate — SMS requires Steward+ (sms_notifications feature)
  const tier = await getOrgTier(orgId)
  if (!hasFeature(tier, "sms_notifications")) {
    // Silent skip — log but don't throw
    const { createClient } = await import("@/lib/supabase/server")
    const supabase = await createClient()
    await supabase.from("communication_log").insert({
      org_id: orgId,
      channel: "sms",
      direction: "outbound",
      subject: "SMS skipped — Owner tier",
      body: message,
      status: "logged",
      sent_to_phone: to,
    })
    return { sent: false, skipped: true, reason: "SMS not available on Owner tier" }
  }

  // Check AT credentials
  const apiKey = process.env.AT_API_KEY
  const username = process.env.AT_USERNAME
  if (!apiKey || !username) {
    return { sent: false, reason: "Africa's Talking credentials not configured" }
  }

  try {
    const response = await fetch(
      username === "sandbox"
        ? "https://api.sandbox.africastalking.com/version1/messaging"
        : "https://api.africastalking.com/version1/messaging",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey,
        },
        body: new URLSearchParams({
          username,
          to,
          message,
          from: "", // use default sender ID
        }),
      }
    )

    if (!response.ok) {
      const text = await response.text()
      return { sent: false, reason: `AT API error: ${response.status} ${text}` }
    }

    return { sent: true }
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : "SMS send failed" }
  }
}
