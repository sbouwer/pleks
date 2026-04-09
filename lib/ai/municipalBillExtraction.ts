export const MUNICIPAL_BILL_SYSTEM_PROMPT = `You are extracting data from a South African municipal bill (rates/utilities account).

SA municipalities include: City of Cape Town, City of Johannesburg, Ekurhuleni,
eThekwini (Durban), Tshwane (Pretoria), Mangaung, Buffalo City, Nelson Mandela Bay,
and 250+ smaller local municipalities.

All bills contain charges in South African Rand (ZAR).
VAT is currently 15% in South Africa.
Some services are VAT-exempt (rates), others include VAT.
Amount formats: R 1 234.56 or R1,234.56 — normalise to integer cents.

Extract ALL of the following if present. Use null if not found.
Do not guess — if a value is unclear, set it to null and note the uncertainty.

Return ONLY valid JSON:
{
  "municipality_name": "string",
  "account_number": "string",
  "service_address": "string",
  "billing_period_from": "YYYY-MM-DD or null",
  "billing_period_to": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "charge_rates_cents": "integer or 0",
  "charge_water_cents": "integer or 0",
  "charge_sewerage_cents": "integer or 0",
  "charge_electricity_cents": "integer or 0",
  "charge_refuse_cents": "integer or 0",
  "charge_vat_cents": "integer or 0",
  "charge_levies_cents": "integer or 0",
  "charge_penalties_cents": "integer or 0",
  "charge_other_cents": "integer or 0",
  "total_current_charges_cents": "integer",
  "previous_balance_cents": "integer or 0",
  "payments_received_cents": "integer or 0",
  "total_amount_due_cents": "integer",
  "water_reading_previous": "number or null",
  "water_reading_current": "number or null",
  "water_consumption_kl": "number or null",
  "electricity_reading_previous": "number or null",
  "electricity_reading_current": "number or null",
  "electricity_consumption_kwh": "number or null",
  "confidence": "0.0 to 1.0",
  "notes": "any extraction uncertainty or ambiguity"
}`

export interface MunicipalBillExtracted {
  billing_period_from: string | null
  billing_period_to: string | null
  due_date: string | null
  charge_rates_cents: number
  charge_water_cents: number
  charge_sewerage_cents: number
  charge_electricity_cents: number
  charge_refuse_cents: number
  charge_vat_cents: number
  charge_levies_cents: number
  charge_penalties_cents: number
  charge_other_cents: number
  total_current_charges_cents: number
  previous_balance_cents: number
  payments_received_cents: number
  total_amount_due_cents: number
  water_reading_previous: number | null
  water_reading_current: number | null
  water_consumption_kl: number | null
  electricity_reading_previous: number | null
  electricity_reading_current: number | null
  electricity_consumption_kwh: number | null
  extraction_confidence: number | null
  extraction_notes: string | null
}

export async function extractMunicipalBill(pdfBuffer: ArrayBuffer): Promise<MunicipalBillExtracted> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic()

  const base64Pdf = Buffer.from(pdfBuffer).toString("base64")

  const message = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1024,
    system: MUNICIPAL_BILL_SYSTEM_PROMPT,
    messages: [{
      role: "user",
      content: [
        {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64Pdf },
        },
        { type: "text" as const, text: "Extract all fields from this municipal bill. Return only valid JSON." },
      ],
    }],
  })

  const responseText = message.content[0].type === "text" ? message.content[0].text : ""
  const start = responseText.indexOf("{")
  const end = responseText.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON found in Sonnet response")

  const raw = JSON.parse(responseText.slice(start, end + 1)) as Record<string, unknown>

  const toDate = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.exec(v) ? v : null)
  const toInt = (v: unknown): number => (typeof v === "number" ? Math.round(v) : 0)
  const toNum = (v: unknown): number | null => (typeof v === "number" ? v : null)

  return {
    billing_period_from: toDate(raw.billing_period_from),
    billing_period_to: toDate(raw.billing_period_to),
    due_date: toDate(raw.due_date),
    charge_rates_cents: toInt(raw.charge_rates_cents),
    charge_water_cents: toInt(raw.charge_water_cents),
    charge_sewerage_cents: toInt(raw.charge_sewerage_cents),
    charge_electricity_cents: toInt(raw.charge_electricity_cents),
    charge_refuse_cents: toInt(raw.charge_refuse_cents),
    charge_vat_cents: toInt(raw.charge_vat_cents),
    charge_levies_cents: toInt(raw.charge_levies_cents),
    charge_penalties_cents: toInt(raw.charge_penalties_cents),
    charge_other_cents: toInt(raw.charge_other_cents),
    total_current_charges_cents: toInt(raw.total_current_charges_cents),
    previous_balance_cents: toInt(raw.previous_balance_cents),
    payments_received_cents: toInt(raw.payments_received_cents),
    total_amount_due_cents: toInt(raw.total_amount_due_cents),
    water_reading_previous: toNum(raw.water_reading_previous),
    water_reading_current: toNum(raw.water_reading_current),
    water_consumption_kl: toNum(raw.water_consumption_kl),
    electricity_reading_previous: toNum(raw.electricity_reading_previous),
    electricity_reading_current: toNum(raw.electricity_reading_current),
    electricity_consumption_kwh: toNum(raw.electricity_consumption_kwh),
    extraction_confidence: toNum(raw.confidence),
    extraction_notes: typeof raw.notes === "string" ? raw.notes : null,
  }
}
