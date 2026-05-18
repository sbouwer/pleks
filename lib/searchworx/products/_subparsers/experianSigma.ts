/**
 * lib/searchworx/products/_subparsers/experianSigma.ts — Experian Sigma node parser
 *
 * Notes:  Parses the ExperianSigmaInfo block inside Combined Consumer Credit Report.
 *         Also used standalone via runExperianSigma() in lib/searchworx/products/experianSigma.ts
 *         if that module is reinstated for fallback. Sub-parser is the canonical location.
 *         Sigma is delivered by CompuScan (DataSupplier 9, DataSupplierDesc "CompuScan")
 *         but branded as "Experian Sigma" on agent/applicant surfaces.
 *         EnquiryDate uses dd-MM-yyyy HH:mm format (pattern 2, covered by parseSearchworxDate).
 *         ConsumerStatistics includes NLR/CCA account stats + 12/24/36-month periodised enquiry stats.
 *         VerificationStatus ("VERIFIED" / "UNVERIFIED") is the Home Affairs signal for Sigma.
 */
import {
  coerceNumericMap,
  parseIntOrZero,
  parseSearchworxDate,
} from "../../utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SigmaEnquiry {
  enquiryDate:   Date | null
  enquiredBy:    string
  contactNumber: string
}

export interface SigmaAccountStats {
  activeAccounts:     number
  closedAccounts:     number
  worstMonthArrears:  number
  balanceExposure:    number
  monthlyInstalment:  number
  cumulativeArrears:  number
}

export interface SigmaPeriodStats {
  enquiriesByClient:     number
  enquiriesByOther:      number
  positiveLoans:         number
  highestMonthsInArrears: number
}

export interface SigmaConsumerStatistics {
  highestJudgment:     number
  revolvingAccounts:   number
  instalmentAccounts:  number
  openAccounts:        number
  adverseAccounts:     number
  nlrStats:            SigmaAccountStats
  ccaStats:            SigmaAccountStats
  nlr12Months:         SigmaPeriodStats
  nlr24Months:         SigmaPeriodStats
  nlr36Months:         SigmaPeriodStats
  cca12Months:         SigmaPeriodStats
  cca24Months:         SigmaPeriodStats
  cca36Months:         SigmaPeriodStats
}

export interface ExperianSigmaParsed {
  person: {
    firstName:          string
    surname:            string
    dateOfBirth:        Date | null
    gender:             string
    country:            string
    verificationStatus: string
  }
  credit: {
    delphiScore:         number
    risk:                string
    riskColour:          string
    delphiScoreChartUrl: string
    dataCounts:          Record<string, number>
    consumerStatistics:  SigmaConsumerStatistics | null
    enquiryHistory:      SigmaEnquiry[]
  }
  history: {
    addresses:  { fullAddress: string; lastUpdatedDate: Date | null }[]
    telephones: { typeDescription: string; fullNumber: string; lastUpdatedDate: Date | null }[]
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseExperianSigmaNode(raw: unknown): ExperianSigmaParsed {
  const r = raw as Record<string, unknown>

  const pi  = (r.PersonInformation     ?? {}) as Record<string, unknown>
  const cri = (r.CreditInformation     ?? {}) as Record<string, unknown>
  const hi  = (r.HistoricalInformation ?? {}) as Record<string, unknown>

  return {
    person: {
      firstName:          String(pi.FirstName          ?? ""),
      surname:            String(pi.Surname            ?? ""),
      dateOfBirth:        parseSearchworxDate(pi.DateOfBirth as string | undefined),
      gender:             String(pi.Gender             ?? ""),
      country:            String(pi.Country            ?? ""),
      verificationStatus: String(pi.VerificationStatus ?? ""),
    },
    credit: {
      delphiScore:         parseIntOrZero(String(cri.DelphiScore ?? "0")),
      risk:                String(cri.Risk                ?? ""),
      riskColour:          String(cri.RiskColour          ?? ""),
      delphiScoreChartUrl: String(cri.DelphiScoreChartURL ?? ""),
      dataCounts:          coerceNumericMap((cri.DataCounts ?? {}) as Record<string, string>),
      consumerStatistics:  parseConsumerStatistics(cri.ConsumerStatistics),
      enquiryHistory:      parseEnquiryHistory(cri.EnquiryHistory),
    },
    history: {
      addresses:  parseSigmaAddressHistory(hi.AddressHistory),
      telephones: parseSigmaTelephoneHistory(hi.TelephoneHistory),
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAccountStats(raw: Record<string, unknown>): SigmaAccountStats {
  const ri = (k: string) => parseIntOrZero(String(raw[k] ?? "0"))
  return {
    activeAccounts:    ri("ActiveAccounts"),
    closedAccounts:    ri("ClosedAccounts"),
    worstMonthArrears: ri("WorstMonthArrears"),
    balanceExposure:   ri("BalanceExposure"),
    monthlyInstalment: ri("MonthlyInstalment"),
    cumulativeArrears: ri("CumulativeArrears"),
  }
}

function parsePeriodStats(raw: Record<string, unknown>): SigmaPeriodStats {
  const ri = (k: string) => parseIntOrZero(String(raw[k] ?? "0"))
  return {
    enquiriesByClient:      ri("EnquiriesByClient"),
    enquiriesByOther:       ri("EnquiriesByOther"),
    positiveLoans:          ri("PositiveLoans"),
    highestMonthsInArrears: ri("HighestMonthsInArrears"),
  }
}

function parseConsumerStatistics(raw: unknown): SigmaConsumerStatistics | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r  = raw as Record<string, unknown>
  const ri = (k: string) => parseIntOrZero(String(r[k] ?? "0"))
  const asStats  = (k: string) => parseAccountStats((r[k]  ?? {}) as Record<string, unknown>)
  const pStats   = (k: string) => parsePeriodStats((r[k]   ?? {}) as Record<string, unknown>)
  return {
    highestJudgment:    ri("HighestJudgment"),
    revolvingAccounts:  ri("RevolvingAccounts"),
    instalmentAccounts: ri("InstalmentAccounts"),
    openAccounts:       ri("OpenAccounts"),
    adverseAccounts:    ri("AdverseAccounts"),
    nlrStats:    asStats("NLRStats"),
    ccaStats:    asStats("CCAStats"),
    nlr12Months: pStats("NLR12Months"),
    nlr24Months: pStats("NLR24Months"),
    nlr36Months: pStats("NLR36Months"),
    cca12Months: pStats("CCA12Months"),
    cca24Months: pStats("CCA24Months"),
    cca36Months: pStats("CCA36Months"),
  }
}

function parseEnquiryHistory(raw: unknown): SigmaEnquiry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      enquiryDate:   parseSearchworxDate(e.EnquiryDate as string | undefined),
      enquiredBy:    String(e.EnquiredBy                ?? ""),
      contactNumber: String(e.EnquiredByContactNumber   ?? ""),
    }
  })
}

function parseSigmaAddressHistory(raw: unknown): ExperianSigmaParsed["history"]["addresses"] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      fullAddress:     String(e.FullAddress ?? ""),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}

function parseSigmaTelephoneHistory(raw: unknown): ExperianSigmaParsed["history"]["telephones"] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      typeDescription: String(e.TypeDescription ?? ""),
      fullNumber:      String(e.FullNumber       ?? ""),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}
