/**
 * lib/payfast/forms.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { generatePayFastSignature } from "./signature"
import { PAYFAST_CONFIG } from "./config"
import { TIER_PRICING, type Tier } from "@/lib/constants"

interface SubscriptionFormData {
  orgId: string
  tier: Exclude<Tier, "owner" | "bespoke">
}

export function buildSubscriptionForm({ orgId, tier }: SubscriptionFormData) {
  const pricing = TIER_PRICING[tier]
  const amountCents = pricing.monthly
  const amount = (amountCents / 100).toFixed(2)
  const frequency = "3"
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
  const cycleLabel = "Monthly"

  const data: Record<string, string> = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?onboarding=complete`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/team`,
    notify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payfast/subscription`,
    amount,
    item_name: `Pleks ${tierLabel} — ${cycleLabel}`,
    subscription_type: "1",
    billing_date: new Date().toISOString().split("T")[0],
    recurring_amount: amount,
    frequency,
    cycles: "0",
    custom_str1: orgId,
    custom_str2: tier,
    custom_str3: "monthly",
  }

  const signature = generatePayFastSignature(data, PAYFAST_CONFIG.passphrase)
  data.signature = signature

  return { url: PAYFAST_CONFIG.processUrl, data }
}

interface ApplicationFeeFormData {
  applicationId: string
  listingId: string
  orgId: string
  propertyName: string
  unitName: string
}

export function buildApplicationFeeForm({
  applicationId,
  listingId,
  orgId,
  propertyName,
  unitName,
}: ApplicationFeeFormData) {
  const data: Record<string, string> = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${listingId}/status`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${listingId}`,
    notify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payfast/application`,
    amount: "399.00",
    item_name: `Application Fee — ${propertyName} ${unitName}`,
    item_description: "Tenant application screening fee",
    custom_str1: applicationId,
    custom_str2: listingId,
    custom_str3: orgId,
  }

  const signature = generatePayFastSignature(data, PAYFAST_CONFIG.passphrase)
  data.signature = signature

  return { url: PAYFAST_CONFIG.processUrl, data }
}

interface DirectorFeeFormData {
  applicationId: string
  coApplicantId: string
  orgId: string
  slug: string
  feeCents: number
  directorName: string
  propertyLabel: string
}

export function buildDirectorFeeForm({
  applicationId,
  coApplicantId,
  orgId,
  slug,
  feeCents,
  directorName,
  propertyLabel,
}: DirectorFeeFormData) {
  const amount = (feeCents / 100).toFixed(2)
  const data: Record<string, string> = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/status?coApplicantId=${coApplicantId}`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/payment?coApplicantId=${coApplicantId}`,
    notify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payfast/director`,
    amount,
    item_name: `Director Screening Fee — ${directorName}`,
    item_description: `Personal surety screening for ${propertyLabel}`,
    custom_str1: applicationId,
    custom_str2: coApplicantId,
    custom_str3: orgId,
    custom_str4: String(feeCents),
  }

  const signature = generatePayFastSignature(data, PAYFAST_CONFIG.passphrase)
  data.signature = signature

  return { url: PAYFAST_CONFIG.processUrl, data }
}
