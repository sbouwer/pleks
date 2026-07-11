"use server"

/**
 * app/(dashboard)/settings/subscription/actions.ts — Subscription state-change server actions
 *
 * Auth:   gateway() — no lockdown gate (subscription management is always allowed per §10.3)
 * Data:   subscriptions + organisations via service client; auth.mfa via cookie client
 * Notes:  Cancel is two-step: initiateCancellation → confirmCancellation (AAL2 or email link).
 *         Pause and resume are direct (no extra identity verification required).
 */
import { gateway, type GatewayContext } from "@/lib/supabase/gateway"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { hasCapability } from "@/lib/auth/can"
import { getOrgTierCanonical } from "@/lib/tier/getOrgTier"
import { getUserEmail } from "@/lib/auth/userEmail"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"
import {
  sendPausedManual,
  sendResumed,
  sendCancelledConfirm,
} from "@/lib/subscriptions/emails"
import { LEGAL_VERSIONS } from "@/lib/legal-versions"
import { fmtDateLongZA } from "@/lib/dates"

import { absoluteUrl } from "@/lib/routing/absoluteUrl"
import { recordAudit } from "@/lib/audit/recordAudit"

// Billing actions require the 'billing' capability (owner / is_admin exempt). This is orthogonal to the
// §10.3 "your data always" rule — that's about subscription STATE (never block on paused/cancelled), this is
// about WHO may manage billing. Returns the gateway context or an error to return straight to the client.
async function requireBilling(): Promise<{ gw: GatewayContext } | { error: string }> {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  if (!(await hasCapability(gw, "billing"))) return { error: "You don't have access to billing." }
  return { gw }
}

// ── Shared helper: fetch org contact for emails ───────────────────────────────

async function fetchOrgContact(service: Awaited<ReturnType<typeof createServiceClient>>, orgId: string) {
  const [{ data: org }, { data: adminRow }] = await Promise.all([
    service
      .from("organisations")
      .select("name, email, phone, brand_accent_color")
      .eq("id", orgId)
      .single(),
    service
      .from("user_orgs")
      .select("user_id, user_profiles(full_name)")
      .eq("org_id", orgId)
      .in("role", ["owner", "agent"])
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const profile = adminRow?.user_profiles as unknown as { full_name?: string } | null
  const adminEmail = await getUserEmail(service, adminRow?.user_id as string | null)
  if (!org || !adminEmail) return null
  return {
    orgId,
    orgName: org.name ?? "Pleks",
    adminEmail,
    adminName: profile?.full_name ?? undefined,
    branding: buildBranding(await fetchOrgSettings(orgId)),
  }
}

// ── pauseSubscription ─────────────────────────────────────────────────────────

export async function pauseSubscription(
  reason: string,
): Promise<{ success: true } | { error: string }> {
  const auth = await requireBilling()
  if ("error" in auth) return auth
  const { gw } = auth

  // The free Owner plan has no paid subscription — pausing it is meaningless and leaves it reading as
  // arrears. Pause/resume apply to paid tiers only.
  const tier = await getOrgTierCanonical(gw.orgId)
  if (tier === "owner") return { error: "The free Owner plan has nothing to pause." }

  const service = await createServiceClient()
  const now = new Date().toISOString()

  const { data: sub, error: fetchErr } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("org_id", gw.orgId)
    .in("status", ["active", "past_due"])
    .maybeSingle()

  if (fetchErr) {
    console.error("pauseSubscription: fetch failed:", fetchErr.message)
    return { error: "Failed to fetch subscription" }
  }
  if (!sub) return { error: "No active subscription to pause" }

  const { error: updateErr } = await service
    .from("subscriptions")
    .update({ status: "paused", paused_at: now, pause_reason: reason || null })
    .eq("id", sub.id)

  if (updateErr) {
    console.error("pauseSubscription: update failed:", updateErr.message)
    return { error: "Failed to pause subscription" }
  }

  await recordAudit(service, { orgId: gw.orgId, table: "subscriptions", recordId: gw.orgId, action: "UPDATE", after: { action: "subscription_paused_manual", pause_reason: reason || null } })

  const contact = await fetchOrgContact(service, gw.orgId)
  if (contact) void sendPausedManual(contact, reason)

  return { success: true }
}

// ── resumeSubscription ────────────────────────────────────────────────────────

export async function resumeSubscription(): Promise<{ success: true } | { error: string }> {
  const auth = await requireBilling()
  if ("error" in auth) return auth
  const { gw } = auth
  const service = await createServiceClient()

  const { data: sub, error: fetchErr } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("org_id", gw.orgId)
    .eq("status", "paused")
    .maybeSingle()

  if (fetchErr) {
    console.error("resumeSubscription: fetch failed:", fetchErr.message)
    return { error: "Failed to fetch subscription" }
  }
  if (!sub) return { error: "Subscription is not paused" }

  const { error: updateErr } = await service
    .from("subscriptions")
    .update({ status: "active", paused_at: null, pause_reason: null })
    .eq("id", sub.id)

  if (updateErr) {
    console.error("resumeSubscription: update failed:", updateErr.message)
    return { error: "Failed to resume subscription" }
  }

  await recordAudit(service, { orgId: gw.orgId, table: "subscriptions", recordId: gw.orgId, action: "UPDATE", after: { action: "subscription_resumed" } })

  const contact = await fetchOrgContact(service, gw.orgId)
  if (contact) void sendResumed(contact)

  return { success: true }
}

// ── initiateCancellation ──────────────────────────────────────────────────────
// Step 1 of two-step cancel. Sets status='pending_cancellation'.
// Returns the confirmation method required: AAL2 (TOTP/passkey) or email magic link.
// If the session is already AAL2, confirmation happens inline.

export type InitiateCancellationResult =
  | { success: true }
  | { requiresAAL2: true; factorId: string }
  | { requiresEmailLink: true }
  | { error: string }

export async function initiateCancellation(): Promise<InitiateCancellationResult> {
  const auth = await requireBilling()
  if ("error" in auth) return auth
  const { gw } = auth
  const service = await createServiceClient()

  const { data: sub, error: fetchErr } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("org_id", gw.orgId)
    .not("status", "in", "(purged)")
    .maybeSingle()

  if (fetchErr) {
    console.error("initiateCancellation: fetch failed:", fetchErr.message)
    return { error: "Failed to fetch subscription" }
  }
  if (!sub) return { error: "No subscription found" }
  if (sub.status === "cancelled") return { error: "Subscription already cancelled" }
  if (sub.status === "pending_cancellation") {
    // Already initiated — fall through to return the correct confirmation method below
  } else {
    // Mark as pending (idempotent if already pending)
    const { error: updateErr } = await service
      .from("subscriptions")
      .update({ status: "pending_cancellation", pending_cancellation_since: new Date().toISOString() })
      .eq("id", sub.id)
    if (updateErr) {
      console.error("initiateCancellation: update failed:", updateErr.message)
      return { error: "Failed to initiate cancellation" }
    }
  }

  // Check current AAL level via cookie-based client
  const authClient = await createClient()
  const { data: aalData } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()

  if (aalData) {
    const { currentLevel, nextLevel } = aalData

    // Already at AAL2 — confirm inline
    if (currentLevel === "aal2") {
      return confirmCancellationInner(service, sub.id, gw.orgId)
    }

    // MFA enrolled but not yet stepped up — client must complete TOTP/passkey challenge
    if (nextLevel === "aal2") {
      const { data: factors } = await authClient.auth.mfa.listFactors()
      const firstFactor = factors?.totp?.[0] ?? factors?.phone?.[0]
      if (firstFactor) {
        return { requiresAAL2: true, factorId: firstFactor.id }
      }
    }
  }

  // No MFA enrolled — send magic link email for confirmation
  const { data: { user } } = await authClient.auth.getUser()
  if (!user?.email) return { error: "No user email found" }

  const redirectTo = absoluteUrl("/auth/callback?next=/settings/subscription/confirm-cancel")
  const { error: otpErr } = await authClient.auth.signInWithOtp({
    email: user.email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  })
  if (otpErr) {
    console.error("initiateCancellation: OTP send failed:", otpErr.message)
    return { error: "Failed to send confirmation email" }
  }

  return { requiresEmailLink: true }
}

// ── confirmCancellation ───────────────────────────────────────────────────────
// Step 2 of two-step cancel. Verifies AAL2 (or trust implicit from magic-link callback)
// then transitions subscription → cancelled and fires the confirmation email.

export async function confirmCancellation(): Promise<{ success: true } | { error: string; code?: string }> {
  const auth = await requireBilling()
  if ("error" in auth) return auth
  const { gw } = auth
  const service = await createServiceClient()

  const { data: sub, error: fetchErr } = await service
    .from("subscriptions")
    .select("id, status")
    .eq("org_id", gw.orgId)
    .not("status", "in", "(purged)")
    .maybeSingle()

  if (fetchErr) {
    console.error("confirmCancellation: fetch failed:", fetchErr.message)
    return { error: "Failed to fetch subscription" }
  }
  if (!sub) return { error: "No subscription found" }
  if (sub.status === "cancelled") return { success: true } // idempotent

  if (sub.status !== "pending_cancellation") {
    return { error: "No pending cancellation request", code: "not_pending" }
  }

  // Verify identity: AAL2 required if MFA is enrolled on this account
  const authClient = await createClient()
  const { data: aalData } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel()

  if (aalData?.nextLevel === "aal2" && aalData?.currentLevel !== "aal2") {
    return { error: "Step-up authentication required", code: "aal2_required" }
  }

  return confirmCancellationInner(service, sub.id, gw.orgId)
}

// ── shared inner logic (used by initiateCancellation aal2 path + confirmCancellation) ──

async function confirmCancellationInner(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  subId: string,
  orgId: string,
): Promise<{ success: true } | { error: string }> {
  const now = new Date()
  const cancelledAt = now.toISOString()

  const { error: updateErr } = await service
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: cancelledAt,
      pending_cancellation_since: null,
      cancellation_terms_version: LEGAL_VERSIONS.terms,
    })
    .eq("id", subId)

  if (updateErr) {
    console.error("confirmCancellationInner: update failed:", updateErr.message)
    return { error: "Failed to confirm cancellation" }
  }

  await recordAudit(service, { orgId: orgId, table: "subscriptions", recordId: orgId, action: "UPDATE", after: {
      action: "subscription_cancelled",
      cancellation_terms_version: LEGAL_VERSIONS.terms,
    } })

  const contact = await fetchOrgContact(service, orgId)
  if (contact) {
    const cancelledDate = fmtDateLongZA(now)
    void sendCancelledConfirm(contact, {
      cancelledDate,
      exportUrl: absoluteUrl("/reports"),
    })
  }

  return { success: true }
}
