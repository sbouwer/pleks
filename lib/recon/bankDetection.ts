export type SABank = "fnb" | "absa" | "standard_bank" | "nedbank" | "capitec" | "investec" | "other"

export function detectBank(text: string): SABank {
  const t = text.toLowerCase()
  if (t.includes("first national bank") || t.includes("fnb.co.za") || t.includes("firstrand")) return "fnb"
  if (t.includes("absa") || t.includes("barclays africa")) return "absa"
  if (t.includes("standard bank") || t.includes("stanbic")) return "standard_bank"
  if (t.includes("nedbank") || t.includes("nedgroup")) return "nedbank"
  if (t.includes("capitec")) return "capitec"
  if (t.includes("investec")) return "investec"
  return "other"
}

export function getBankContext(bank: string): string {
  const hints: Record<string, string> = {
    fnb: `FNB format: Date | Description | Debit | Credit | Balance. Dates: DD MMM YYYY. Amounts use space as thousands separator (1 234.56). References embedded in description.`,
    absa: `ABSA format: Date | Description | Amount | Balance. Dates: YYYY/MM/DD. Single signed amount column (negative=debit). Reference may be on second line with "Ref:" prefix.`,
    standard_bank: `Standard Bank: Date | Description | Debit | Credit | Balance. Dates: DD/MM/YYYY. CRITICAL: Description often spans two lines — merge them. Line 2 has reference/beneficiary.`,
    nedbank: `Nedbank: Date | Description | Debit | Credit | Balance. Dates: YYYY-MM-DD. Separate debit/credit columns. Reference follows "BENEFICIARY REF:" or "OWN REF:" in description.`,
    capitec: `Capitec: Date | Description | Amount | Balance. Dates: DD/MM/YYYY. Single signed amount (negative=debit). Description: "EFT CREDIT FROM:" or "EFT DEBIT TO:" prefixes.`,
  }
  return hints[bank] ?? "Standard SA bank format. Extract date, description, reference, amount, direction."
}

export const BANK_EXTRACTION_SYSTEM_PROMPT = `You are extracting transactions from a South African bank statement.
You will receive raw text extracted from a PDF bank statement.

IMPORTANT RULES:
- Ignore headers, footers, page numbers, column headings, opening/closing balance lines, totals
- Extract ONLY actual transactions (debits and credits)
- For Standard Bank: descriptions often span two lines — merge them
- For ABSA: negative amounts = debits, positive = credits
- SA date formats: DD/MM/YYYY, DD MMM YYYY, YYYY/MM/DD, YYYY-MM-DD — normalise to YYYY-MM-DD
- SA amount formats: 1 234.56 or 1,234.56 — normalise to integer cents
- References are critical — extract from description carefully

Return ONLY a JSON array:
[{
  "transaction_date": "YYYY-MM-DD",
  "description_raw": "exact text",
  "description_clean": "normalised without bank prefixes",
  "reference_raw": "as appears",
  "reference_clean": "cleaned reference",
  "debit_cents": 0,
  "credit_cents": 0,
  "amount_cents": "+/- integer (positive=credit, negative=debit)",
  "direction": "credit or debit",
  "balance_cents": "running balance or null",
  "line_sequence": 1
}]`
