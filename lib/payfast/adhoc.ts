/**
 * lib/payfast/adhoc.ts — PayFast Tokenisation API: saved-card adhoc charges and refunds
 *
 * Notes:  ADDENDUM_14A (D-14A-19). Handles the server-side API auth layer for PayFast
 *         Tokenisation (subscription_type=2). Adhoc charges use header-based HMAC-MD5
 *         auth with the merchant passphrase — same credential as form signing, different
 *         signing surface (headers not form body).
 *         PayFast adhoc endpoint: POST /subscriptions/{token}/adhoc
 *         PayFast refund endpoint: POST /process/query/refund
 */
import { createHmac } from "crypto"
import { PAYFAST_CONFIG } from "./config"

const PAYFAST_API_BASE = PAYFAST_CONFIG.isSandbox
  ? "https://api.sandbox.payfast.co.za"
  : "https://api.payfast.co.za"

function buildApiHeaders(params: Record<string, string>): Record<string, string> {
  const secret = PAYFAST_CONFIG.passphrase
  const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
  const version   = "v1"

  // PayFast API signature: HMAC-MD5 of sorted param string (same as form signing but over headers)
  const paramString = new URLSearchParams({
    ...params,
    "merchant-id": PAYFAST_CONFIG.merchantId,
    version,
    timestamp,
  })
    .toString()
    .split("&")
    .sort()
    .join("&")

  const signature = createHmac("md5", secret).update(paramString).digest("hex")

  return {
    "merchant-id": PAYFAST_CONFIG.merchantId,
    "version":     version,
    "timestamp":   timestamp,
    "signature":   signature,
    "Content-Type": "application/json",
    "Accept":       "application/json",
  }
}

export interface AdhocChargeResult {
  ok:           boolean
  payfastId?:   string
  errorMessage?: string
}

export async function chargeAdhoc(
  token: string,
  amountCents: number,
  itemName: string,
): Promise<AdhocChargeResult> {
  const amount = (amountCents / 100).toFixed(2)
  const body   = { amount, item_name: itemName }

  const headers = buildApiHeaders({ amount, item_name: itemName })

  try {
    const res = await fetch(`${PAYFAST_API_BASE}/subscriptions/${token}/adhoc`, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, errorMessage: `PayFast adhoc returned ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = await res.json() as { data?: { response?: string } }
    return { ok: true, payfastId: data?.data?.response }
  } catch (err) {
    return {
      ok:           false,
      errorMessage: err instanceof Error ? err.message : "Network error during adhoc charge",
    }
  }
}

export interface RefundResult {
  ok:           boolean
  errorMessage?: string
}

export async function refundPayment(
  payfastPaymentId: string,
  amountCents: number,
  reason: string,
): Promise<RefundResult> {
  const amount  = (amountCents / 100).toFixed(2)
  const body    = { m_payment_id: payfastPaymentId, amount, reason }
  const headers = buildApiHeaders({ m_payment_id: payfastPaymentId, amount, reason })

  try {
    const res = await fetch(`${PAYFAST_API_BASE}/process/query/refund`, {
      method:  "POST",
      headers,
      body:    JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return { ok: false, errorMessage: `PayFast refund returned ${res.status}: ${text.slice(0, 200)}` }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok:           false,
      errorMessage: err instanceof Error ? err.message : "Network error during refund",
    }
  }
}
