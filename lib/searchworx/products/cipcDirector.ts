/**
 * lib/searchworx/products/cipcDirector.ts — Searchworx CIPC Director lookup
 *
 * Notes:  ADDENDUM_14A. Retail: R25 incl. VAT. Cost: R15.65 ex-VAT.
 *         Public-register data. Verifies a natural person is a CIPC-listed director.
 *         Input: ID number + company registration number.
 *         Output: director name, appointment date, status, position held.
 *         Mismatch detection (declared-vs-CIPC) is performed in the UI layer, not here.
 */
import { searchworxPost, type SearchworxResult } from "@/lib/searchworx/client"

export interface CipcDirectorInput {
  idNumber:           string
  registrationNumber: string
}

export interface CipcDirectorFacts {
  director_name:       string | null
  director_id_number:  string | null
  appointment_date:    string | null
  status:              string | null
  position:            string | null
}

interface SearchworxCipcDirectorRaw {
  director_name?:      string
  id_number?:          string
  appointment_date?:   string
  status?:             string
  position?:           string
  [key: string]: unknown
}

export async function runCipcDirector(
  input: CipcDirectorInput,
): Promise<SearchworxResult<CipcDirectorFacts>> {
  const result = await searchworxPost<SearchworxCipcDirectorRaw>("/cipc/director", {
    id_number:           input.idNumber,
    registration_number: input.registrationNumber,
    product_code:        "CIPC_DIRECTOR",
  })

  if (!result.ok) return result

  const raw = result.data
  return {
    ok: true,
    data: {
      director_name:      raw.director_name ?? null,
      director_id_number: raw.id_number ?? input.idNumber,
      appointment_date:   raw.appointment_date ?? null,
      status:             raw.status ?? null,
      position:           raw.position ?? null,
    },
  }
}
