/**
 * lib/searchworx/products/vccbIncomeEstimator.ts — VCCB Income Estimator product module
 *
 * Notes:  ADDENDUM_14H v3 §A.2 + v2 §B. Single VeriCred call returning gross monthly income estimate.
 *         CallerModule: "credit/vericred", SearchType: 220, ResponseMessage: "VeriCredIncomeEstimate".
 *         SA citizens/permanent residents only — foreign nationals must be skipped by caller.
 *         IncomeGrossEstimate is a decimal Rand string (e.g. "28796" → R28,796/month = 2,879,600 cents).
 *         Request body is PascalCase (consistent with the Combined product family).
 */
import type { SearchworxError }              from "../client"
import { searchworxCall }                     from "../client"
import { downloadAndStoreSearchworxArtefact } from "../storage"
import {
  normaliseGender,
  parseIntOrZero,
  parseSearchworxDate,
  parseSearchworxRandDecimal,
  parseSearchInformation,
} from "../utils"

// ─── Product constants ────────────────────────────────────────────────────────

export const VCCB_PRODUCT_KEY  = "vccb_income_estimator"
export const VCCB_COST_CENTS   = 635   // R6.35 ex-VAT — ADDENDUM_14H v3 rate card
export const VCCB_SEARCH_TYPE  = 220   // VeriCredIncomeEstimation
export const VCCB_PRODUCT_PATH = "credit/vericred/incomeestimate"

export const VCCB_RESULT_SUMMARIES = {
  success:                "Gross income estimate retrieved",
  no_data:                "No income estimate available for this ID number",
  foreign_national_skip:  "Skipped — VCCB does not support foreign-national identification",
  failed:                 "Income estimate request failed — refunded",
} as const

// ─── Input / output types ─────────────────────────────────────────────────────

export interface VccbRequestInput {
  orgId:         string
  applicationId: string
  reference:     string
  idNumber:      string
}

export interface VccbParsed {
  search: ReturnType<typeof parseSearchInformation>
  person: {
    firstName:            string
    surname:              string
    initials:             string
    idNumber:             string
    dateOfBirth:          Date | null
    gender:               ReturnType<typeof normaliseGender>
    age:                  number
    incomeGrossEstimateCents: number
  }
  searchToken: string
  pdfCopyUrl:  string
}

// ─── Run function ─────────────────────────────────────────────────────────────

export async function runVccbIncomeEstimator(
  input: VccbRequestInput,
): Promise<
  | { ok: true;  parsed: VccbParsed; pdfStoragePath: string; resultSummaryKey: keyof typeof VCCB_RESULT_SUMMARIES }
  | { ok: false; error: SearchworxError }
> {
  const result = await searchworxCall<Record<string, unknown>>({
    productPath: VCCB_PRODUCT_PATH,
    buildBody:   (token) => ({
      SessionToken: token,
      Reference:    input.reference,
      IDNumber:     input.idNumber,
    }),
  })

  if (!result.ok) return result

  const parsed     = parseVccbResponse(result.data)
  const pdfCopyUrl = result.pdfCopyUrl ?? ""

  const pdfStoragePath = pdfCopyUrl
    ? (await downloadAndStoreSearchworxArtefact({
        vendorUrl:    pdfCopyUrl,
        orgId:        input.orgId,
        refId:        input.applicationId,
        productKey:   VCCB_PRODUCT_KEY,
        searchToken:  parsed.searchToken,
        artefactKind: "raw",
        mimeType:     "application/pdf",
      })).storagePath
    : ""

  const resultSummaryKey = parsed.person.incomeGrossEstimateCents > 0 ? "success" : "no_data"

  return { ok: true, parsed, pdfStoragePath, resultSummaryKey }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseVccbResponse(raw: Record<string, unknown>): VccbParsed {
  const si = (raw.SearchInformation ?? {}) as Record<string, unknown>
  const pi = (raw.PersonInformation  ?? {}) as Record<string, unknown>

  const search = parseSearchInformation(si)

  return {
    search,
    person: {
      firstName:                String(pi.FirstName             ?? ""),
      surname:                  String(pi.Surname               ?? ""),
      initials:                 String(pi.Initials              ?? ""),
      idNumber:                 String(pi.IDNumber              ?? ""),
      dateOfBirth:              parseSearchworxDate(pi.DateOfBirth as string | undefined),
      gender:                   normaliseGender(pi.Gender as string | undefined),
      age:                      parseIntOrZero(String(pi.Age   ?? "0")),
      incomeGrossEstimateCents: parseSearchworxRandDecimal(pi.IncomeGrossEstimate as string | undefined),
    },
    searchToken: search.searchToken,
    pdfCopyUrl:  "",
  }
}
