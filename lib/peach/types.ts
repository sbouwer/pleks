export interface PeachWebhookEvent {
  event_type:
    | "mandate.authenticated"
    | "mandate.rejected"
    | "mandate.cancelled"
    | "mandate.suspended"
    | "collection.successful"
    | "collection.failed"
    | "collection.returned"
  mandate_id: string
  collection_id?: string
  amount?: number
  failure_reason?: string
  failure_code?: string
  timestamp: string
}

// SA DebiCheck failure codes → human-readable reasons
export function translateFailureCode(code: string): string {
  const codes: Record<string, string> = {
    INSUFF_FUNDS: "Insufficient funds in tenant account",
    ACCT_CLOSED: "Tenant bank account closed",
    ACCT_FROZEN: "Tenant bank account frozen",
    WRONG_ACCT: "Incorrect bank account details",
    MANDATE_CANCEL: "Tenant cancelled the mandate at their bank",
    MANDATE_SUSPEND: "Mandate suspended by bank (payment history)",
    REFER_TO_BANK: "Refer to bank — contact tenant urgently",
    PAYMENT_REFUSED: "Payment refused by tenant's bank",
    NO_AUTH: "Mandate not yet authenticated by tenant",
    AMOUNT_EXCEEDED: "Collection amount exceeds mandate limit",
  }
  return codes[code] ?? `Collection failed (code: ${code})`
}

export function shouldRetry(code: string): boolean {
  return ["INSUFF_FUNDS", "REFER_TO_BANK"].includes(code)
}
