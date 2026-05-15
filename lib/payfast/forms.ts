/**
 * lib/payfast/forms.ts — PayFast hidden-form builders for subscription, application, and director fees
 *
 * Auth:   n/a — pure builders, no DB access; forms are rendered server-side and posted client-side
 * Notes:  Each builder computes return_url/cancel_url/notify_url, signs with the org passphrase,
 *         and returns { url, data } for use with <PayFastForm>. custom_str* fields carry context
 *         that the ITN webhook uses to locate the relevant DB rows (no session available in ITN).
 *         ADDENDUM_14A: buildPropertyIntelligenceFeeForm added for PAYG pulls. First-pull flow
 *         includes subscription_type=2 for card tokenisation (D-14A-19).
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
  token: string
  feeCents: number
  directorName: string
  propertyLabel: string
}

export function buildDirectorFeeForm({
  applicationId,
  coApplicantId,
  orgId,
  slug,
  token,
  feeCents,
  directorName,
  propertyLabel,
}: DirectorFeeFormData) {
  const amount = (feeCents / 100).toFixed(2)
  const data: Record<string, string> = {
    merchant_id: PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/${token}/status`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${slug}/director-portal/${token}/payment`,
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

// Product retail prices in Rands (spec D-14A-03)
export const PI_RETAIL_CENTS: Record<string, number> = {
  deeds_search:          3000,
  lightstone_erf_short:  15500,
  cipc_company:          2500,
  cipc_director:         2500,
}

// Searchworx cost ex-VAT in cents (for vendor_usage margin reporting)
export const PI_COST_CENTS: Record<string, number> = {
  deeds_search:          2280,
  lightstone_erf_short:  11700,
  cipc_company:          1565,
  cipc_director:         1565,
}

const PI_PRODUCT_LABELS: Record<string, string> = {
  deeds_search:         "Deeds Office Search",
  lightstone_erf_short: "Lightstone Erf Valuation",
  cipc_company:         "CIPC Company Verification",
  cipc_director:        "CIPC Director Verification",
}

interface PropertyIntelligenceFeeFormData {
  pullId:       string
  orgId:        string
  productType:  string
  subjectLabel: string
  tokenise:     boolean  // true on first pull (no saved card), false on re-checkout
}

export function buildPropertyIntelligenceFeeForm({
  pullId,
  orgId,
  productType,
  subjectLabel,
  tokenise,
}: PropertyIntelligenceFeeFormData) {
  const retailCents = PI_RETAIL_CENTS[productType]
  if (!retailCents) throw new Error(`Unknown productType: ${productType}`)

  const amount = (retailCents / 100).toFixed(2)
  const label  = PI_PRODUCT_LABELS[productType] ?? productType

  const data: Record<string, string> = {
    merchant_id:  PAYFAST_CONFIG.merchantId,
    merchant_key: PAYFAST_CONFIG.merchantKey,
    return_url:   `${process.env.NEXT_PUBLIC_APP_URL}/intelligence/pull/${pullId}/result`,
    cancel_url:   `${process.env.NEXT_PUBLIC_APP_URL}/intelligence`,
    notify_url:   `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payfast/property-intelligence`,
    amount,
    item_name:         `${label} — ${subjectLabel}`,
    item_description:  "Property intelligence pull",
    custom_str1:       pullId,
    custom_str2:       orgId,
    custom_str3:       productType,
  }

  // subscription_type=2 instructs PayFast to tokenise the card without creating
  // a recurring subscription. The ITN will return a `token` field we store in
  // organisation_payment_tokens for future 1-click adhoc charges (D-14A-19).
  if (tokenise) {
    data.subscription_type = "2"
  }

  const signature = generatePayFastSignature(data, PAYFAST_CONFIG.passphrase)
  data.signature = signature

  return { url: PAYFAST_CONFIG.processUrl, data }
}
