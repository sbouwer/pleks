import { generatePayFastSignature } from "./signature"
import { TIER_PRICING, type Tier } from "@/lib/constants"

const PAYFAST_URL = process.env.NEXT_PUBLIC_PAYFAST_SANDBOX === "true"
  ? "https://sandbox.payfast.co.za/eng/process"
  : "https://www.payfast.co.za/eng/process"

interface SubscriptionFormData {
  orgId: string
  tier: Exclude<Tier, "owner">
  billingCycle: "monthly" | "annual"
}

export function buildSubscriptionForm({ orgId, tier, billingCycle }: SubscriptionFormData) {
  const pricing = TIER_PRICING[tier]
  const amountCents = billingCycle === "annual" ? pricing.annual : pricing.monthly
  const amount = (amountCents / 100).toFixed(2)
  const frequency = billingCycle === "annual" ? "6" : "3"
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1)
  const cycleLabel = billingCycle === "annual" ? "Annual" : "Monthly"

  const data: Record<string, string> = {
    merchant_id: process.env.PAYFAST_MERCHANT_ID!,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
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
    custom_str3: billingCycle,
  }

  const signature = generatePayFastSignature(data, process.env.PAYFAST_PASSPHRASE)
  data.signature = signature

  return { url: PAYFAST_URL, data }
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
    merchant_id: process.env.PAYFAST_MERCHANT_ID!,
    merchant_key: process.env.PAYFAST_MERCHANT_KEY!,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${listingId}/status`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/apply/${listingId}`,
    notify_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/payfast/application`,
    amount: "199.00",
    item_name: `Application Fee — ${propertyName} ${unitName}`,
    item_description: "Tenant application screening fee",
    custom_str1: applicationId,
    custom_str2: listingId,
    custom_str3: orgId,
  }

  const signature = generatePayFastSignature(data, process.env.PAYFAST_PASSPHRASE)
  data.signature = signature

  return { url: PAYFAST_URL, data }
}
