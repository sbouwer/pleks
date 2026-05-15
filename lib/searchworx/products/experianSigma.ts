/**
 * lib/searchworx/products/experianSigma.ts — Experian Sigma Consumer Profile via Searchworx
 *
 * Notes:  ADDENDUM_14H §4. First real product module built against the verified Phase 2 spike contract.
 *         Response shape verified against brief/vendors/searchworx/raw/experian_sigma_real_response_2026-05-15.json.
 *         All DataCounts/ConsumerStatistics numeric fields arrive as quoted strings — coerced at this boundary.
 *         D-14H-16: VerificationStatus (not name match) is the authoritative identity signal — bureau name
 *         may differ from submitted name (confirmed in the spike; different person returned for test ID).
 */
import { searchworxCall, type SearchworxError } from "@/lib/searchworx/client"
import {
  parseSearchworxDate,
  parseSearchworxDateTime,
  parseIntOrZero,
  coerceNumericMap,
} from "@/lib/searchworx/utils"

// ─── Input ────────────────────────────────────────────────────────────────────

export type EnquiryReason =
  | "Affordability Assessment"  // tenant screening (recommended default)
  | "Credit Assessment"
  | "Account Management"        // existing-tenant renewal review

export interface SigmaInput {
  reference:     string         // free text — use screening line id or similar
  enquiryReason: EnquiryReason
  idNumber:      string         // 13-digit SA ID
  surname:       string
  firstName:     string         // mapped to lowercase `firstname` in wire format
}

// ─── Parsed output ────────────────────────────────────────────────────────────

export interface SigmaParsed {
  search: {
    searchToken:           string
    searchId:              number
    reportDate:            Date | null
    reference:             string
    dataSupplierDesc:      string
    searchTypeDescription: string
  }
  person: {
    firstName:          string
    surname:            string
    fullName:           string
    idNumber:           string
    dateOfBirth:        Date | null
    gender:             string
    age:                number
    country:            string
    verificationStatus: "VERIFIED" | "NOT VERIFIED" | string
  }
  credit: {
    delphiScore:         number
    risk:                string
    riskColourRgb:       string  // raw "R, G, B" — UI wraps with rgb() at render
    delphiScoreChartUrl: string
    dataCounts:          Record<string, number>
    enquiryHistory:      Array<{ date: Date | null; enquiredBy: string }>
    declineReasons:      Array<{ code: string; description: string }>
  }
  history: {
    addresses:  Array<{ type: string; lines: string[]; postalCode: string; lastUpdated: Date | null }>
    telephones: Array<{ type: string; number: string; lastUpdated: Date | null }>
  }
}

// ─── Raw wire types ───────────────────────────────────────────────────────────

interface SigmaRawSearchInfo {
  SearchToken:            string
  SearchID:               number
  ReportDate?:            string
  Reference?:             string
  DataSupplierDesc?:      string
  SearchTypeDescription?: string
  [key: string]: unknown
}

interface SigmaRawPersonInfo {
  FirstName:           string
  Surname:             string
  Fullname:            string
  IDNumber:            string
  DateOfBirth?:        string
  Gender?:             string
  Age?:                string
  Country?:            string
  VerificationStatus?: string
}

interface SigmaRawEnquiry {
  EnquiryDate?: string
  EnquiredBy?:  string
}

interface SigmaRawDeclineReason {
  ReasonCode:        string
  ReasonDescription: string
}

interface SigmaRawAddressHistory {
  TypeDescription?:  string
  Line1?:            string
  Line2?:            string
  Line3?:            string
  Line4?:            string
  PostalCode?:       string
  LastUpdatedDate?:  string
}

interface SigmaRawTelephoneHistory {
  TypeDescription?: string
  FullNumber?:      string
  LastUpdatedDate?: string
}

interface SigmaRawCreditInfo {
  DelphiScore?:         string
  Risk?:                string
  RiskColour?:          string
  DelphiScoreChartURL?: string
  DataCounts?:          Record<string, string>
  DebtReviewStatus?:    Record<string, unknown>
  ConsumerStatistics?:  Record<string, unknown>
  EnquiryHistory?:      SigmaRawEnquiry[]
  DeclineReason?:       SigmaRawDeclineReason[]
}

interface SigmaRawResponse {
  SearchInformation:      SigmaRawSearchInfo
  PersonInformation:      SigmaRawPersonInfo
  CreditInformation?:     SigmaRawCreditInfo
  HistoricalInformation?: {
    AddressHistory?:   SigmaRawAddressHistory[]
    TelephoneHistory?: SigmaRawTelephoneHistory[]
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

const PRODUCT_PATH = "credit/experian/sigma/consumerprofile"

export async function runExperianSigma(
  input: SigmaInput,
): Promise<
  | { ok: true; parsed: SigmaParsed; pdfCopyUrl: string; rawResponse: unknown }
  | { ok: false; error: SearchworxError }
> {
  const result = await searchworxCall<SigmaRawResponse>({
    productPath: PRODUCT_PATH,
    buildBody: (token) => ({
      SessionToken:  token,
      Reference:     input.reference,
      EnquiryReason: input.enquiryReason,
      IDNumber:      input.idNumber,
      Surname:       input.surname,
      firstname:     input.firstName,  // lowercase — confirmed Searchworx quirk (spike contract)
    }),
  })

  if (!result.ok) return { ok: false, error: result.error }

  return {
    ok:          true,
    parsed:      parseSigmaResponse(result.data),
    pdfCopyUrl:  result.pdfCopyUrl ?? "",
    rawResponse: result.data,
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseSigmaResponse(raw: SigmaRawResponse): SigmaParsed {
  const dc = (raw.CreditInformation?.DataCounts ?? {}) as Record<string, string>
  return {
    search: {
      searchToken:           raw.SearchInformation.SearchToken,
      searchId:              raw.SearchInformation.SearchID,
      reportDate:            parseSearchworxDate(raw.SearchInformation.ReportDate),
      reference:             raw.SearchInformation.Reference ?? "",
      dataSupplierDesc:      raw.SearchInformation.DataSupplierDesc ?? "",
      searchTypeDescription: raw.SearchInformation.SearchTypeDescription ?? "",
    },
    person: {
      firstName:          raw.PersonInformation.FirstName,
      surname:            raw.PersonInformation.Surname,
      fullName:           raw.PersonInformation.Fullname,
      idNumber:           raw.PersonInformation.IDNumber,
      dateOfBirth:        parseSearchworxDate(raw.PersonInformation.DateOfBirth),
      gender:             raw.PersonInformation.Gender ?? "",
      age:                parseIntOrZero(raw.PersonInformation.Age),
      country:            raw.PersonInformation.Country ?? "",
      verificationStatus: raw.PersonInformation.VerificationStatus ?? "NOT VERIFIED",
    },
    credit: {
      delphiScore:         parseIntOrZero(raw.CreditInformation?.DelphiScore),
      risk:                raw.CreditInformation?.Risk ?? "UNKNOWN",
      riskColourRgb:       raw.CreditInformation?.RiskColour ?? "128, 128, 128",
      delphiScoreChartUrl: raw.CreditInformation?.DelphiScoreChartURL ?? "",
      dataCounts:          coerceNumericMap(dc),
      enquiryHistory:      (raw.CreditInformation?.EnquiryHistory ?? []).map((e) => ({
        date:       parseSearchworxDateTime(e.EnquiryDate),
        enquiredBy: e.EnquiredBy ?? "",
      })),
      declineReasons: (raw.CreditInformation?.DeclineReason ?? []).map((r) => ({
        code:        r.ReasonCode,
        description: r.ReasonDescription,
      })),
    },
    history: {
      addresses: (raw.HistoricalInformation?.AddressHistory ?? []).map((a) => ({
        type:        a.TypeDescription ?? "",
        lines:       ([a.Line1, a.Line2, a.Line3, a.Line4] as Array<string | undefined>).filter(
          (l): l is string => Boolean(l),
        ),
        postalCode:  a.PostalCode ?? "",
        lastUpdated: parseSearchworxDate(a.LastUpdatedDate),
      })),
      telephones: (raw.HistoricalInformation?.TelephoneHistory ?? []).map((t) => ({
        type:        t.TypeDescription ?? "",
        number:      t.FullNumber ?? "",
        lastUpdated: parseSearchworxDate(t.LastUpdatedDate),
      })),
    },
  }
}
