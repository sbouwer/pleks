/**
 * lib/rules/communication/email-bounce-alert.ts — Hard-bounced email surface rule
 *
 * Scope:    org · daily · cooldown: 7d (all tiers)
 * Notes:    Surfaces contacts with hard-bounced email addresses to the agent.
 *           The Resend webhook sets communication_preferences.email_hard_bounced = true
 *           on the first hard bounce (permanent delivery failure — invalid address or
 *           domain does not exist). This rule detects that flag and notifies the agent
 *           so they can correct the address or switch the contact to SMS.
 *
 *           Soft bounces (event_type='bounced_soft' in communication_delivery_events —
 *           mailbox full, temporary server error) are NOT handled here. Soft bounces are
 *           transient and do not indicate an unreliable address. Pattern detection on
 *           accumulated soft bounces is deferred.
 *
 *           Dedup: communication_preferences has no bounce_agent_notified_at column.
 *           Entity-level dedup via hasBeenActionedFor(contact_id) prevents re-alerting
 *           the same contact once the agent has been notified. The agent clears the flag
 *           by correcting the contact's email address (which resets email_hard_bounced
 *           back to false via the edit flow, making the contact eligible again if it
 *           bounces in future).
 *
 *           data.entity_id is contact_id (not communication_preferences.id) for
 *           consistent cross-rule payload querying.
 */
import type { OrgRule, RuleActionResult } from "../types"
import { hasBeenActionedFor } from "../engine"

const RULE_ID = "email-bounce-alert"

type BouncedPref = {
  contact_id:            string
  email:                 string
  email_hard_bounced_at: string | null
}

export const emailBounceAlertRule: OrgRule = {
  id:           RULE_ID,
  domain:       "communication",
  description:  "Surface contacts with hard-bounced email addresses so agent can correct or switch to SMS",
  scope:        "org",
  frequency:    "daily",
  cooldownDays: 7,
  tags:         ["email", "bounce", "data-quality", "communication"],

  async condition({ supabase, org }) {
    const { data: prefs, error } = await supabase
      .from("communication_preferences")
      .select("contact_id")
      .eq("org_id", org.id)
      .eq("email_hard_bounced", true)

    if (error) {
      console.error(`[${RULE_ID}] condition query failed:`, error.message)
      return false
    }
    if (!prefs?.length) return false

    for (const pref of prefs) {
      const alreadyActioned = await hasBeenActionedFor(supabase, RULE_ID, pref.contact_id)
      if (!alreadyActioned) return true
    }
    return false
  },

  async action({ supabase, org }): Promise<RuleActionResult> {
    const { data: prefs, error } = await supabase
      .from("communication_preferences")
      .select("contact_id, email, email_hard_bounced_at")
      .eq("org_id", org.id)
      .eq("email_hard_bounced", true)
      .order("email_hard_bounced_at", { ascending: true })

    if (error || !prefs?.length) return { summary: "No hard-bounced contacts found", count: 0 }

    const unactioned: BouncedPref[] = []
    for (const pref of prefs as BouncedPref[]) {
      const alreadyActioned = await hasBeenActionedFor(supabase, RULE_ID, pref.contact_id)
      if (!alreadyActioned) unactioned.push(pref)
    }

    if (!unactioned.length) return { summary: "All hard-bounced contacts already surfaced to agent", count: 0 }

    return {
      summary: `${unactioned.length} contact(s) with hard-bounced email — update address or switch to SMS`,
      count:   unactioned.length,
      data: {
        entity_id: unactioned[0].contact_id,
        contacts:  unactioned.map(p => ({
          contact_id:            p.contact_id,
          email:                 p.email,
          email_hard_bounced_at: p.email_hard_bounced_at,
        })),
      },
    }
  },
}
