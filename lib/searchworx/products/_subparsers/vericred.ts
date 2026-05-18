/**
 * lib/searchworx/products/_subparsers/vericred.ts — VeriCred node parser
 *
 * Notes:  Parses the VeriCredInfo block inside Combined Consumer Credit Report.
 *         This is the VeriCred credit profile (NOT the VCCB Income Estimator — same bureau,
 *         different product family). All date fields use yyyy-MM-dd (ISO with hyphens).
 *         Monetary fields (OpenBalance, Instalment) use parseSearchworxRandDecimal.
 *         IDIssuedDate is a fraud signal — recently-issued IDs are higher risk.
 *         DelphiScore is the second numeric credit score (after Experian Sigma's).
 *         CounsellorInformation in DebtReviewStatus is structured (vs TU's natural-language status).
 */
import {
  normaliseGender,
  parseIntOrZero,
  parseSearchworxDate,
  parseSearchworxRandDecimal,
} from "../../utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VcAdverseSection {
  accountNumber:    string
  nameOnFile:       string
  dateOfRecord:     Date | null
  openBalanceCents: number
  instalmentCents:  number
  accountOpenDate:  Date | null
}

export interface VcCcaStats {
  monthlyInstalmentCents: number
}

export interface VcParsed {
  person: {
    firstName:      string
    surname:        string
    initials:       string
    dateOfBirth:    Date | null
    gender:         ReturnType<typeof normaliseGender>
    deceasedStatus: string
    countryOfBirth: string
    marriageDate:   Date | null
  }
  homeAffairs: {
    idIssuedDate: Date | null
  }
  credit: {
    delphiScore:        number
    riskColour:         string
    delphiScoreChartUrl: string
    warnings:           string[]
    debtReview: {
      counsellorName:    string
      counsellorAddress: string
    } | null
    adverseSections:    VcAdverseSection[]
    consumerStats: {
      ccaStats: VcCcaStats
    }
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseVeriCredNode(raw: unknown): VcParsed {
  const r = raw as Record<string, unknown>

  const pi  = (r.PersonInformation      ?? {}) as Record<string, unknown>
  const hai = (r.HomeAffairsInformation ?? {}) as Record<string, unknown>
  const cri = (r.CreditInformation      ?? {}) as Record<string, unknown>

  const debtReviewRaw  = (cri.DebtReviewStatus ?? {}) as Record<string, unknown>
  const counsellorRaw  = (debtReviewRaw.CounsellorInformation ?? {}) as Record<string, unknown>
  const adverseRaw     = cri["AdverseInformation.AdverseInformationSections"]
  const consumerStats  = (cri.ConsumerStatistics ?? {}) as Record<string, unknown>
  const ccaStatsRaw    = (consumerStats.CCAStats ?? {}) as Record<string, unknown>

  const counsellorName    = String(counsellorRaw.FullName ?? "")
  const counsellorAddress = String(counsellorRaw.Address  ?? "")
  const hasDebtReview = counsellorName && counsellorName !== "- -"

  return {
    person: {
      firstName:      String(pi.FirstName      ?? ""),
      surname:        String(pi.Surname        ?? ""),
      initials:       String(pi.Initials       ?? ""),
      dateOfBirth:    parseSearchworxDate(pi.DateOfBirth    as string | undefined),
      gender:         normaliseGender(pi.Gender as string | undefined),
      deceasedStatus: String(pi.DeceasedStatus ?? ""),
      countryOfBirth: String(pi.CountryOfBirth ?? ""),
      marriageDate:   parseSearchworxDate(pi.MarriageDate   as string | undefined),
    },
    homeAffairs: {
      idIssuedDate: parseSearchworxDate(hai.IDIssuedDate as string | undefined),
    },
    credit: {
      delphiScore:         parseIntOrZero(String(cri.DelphiScore ?? "0")),
      riskColour:          String(cri.RiskColour         ?? ""),
      delphiScoreChartUrl: String(cri.DelphiScoreChartURL ?? ""),
      warnings:            parseWarnings(cri.Warnings),
      debtReview: hasDebtReview ? {
        counsellorName,
        counsellorAddress,
      } : null,
      adverseSections:    parseAdverseSections(adverseRaw),
      consumerStats: {
        ccaStats: {
          monthlyInstalmentCents: parseSearchworxRandDecimal(ccaStatsRaw.MonthlyInstalment as string | undefined),
        },
      },
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseWarnings(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((w: unknown) => String((w as Record<string, unknown>).ReasonDescription ?? ""))
    .filter(Boolean)
}

function parseAdverseSections(raw: unknown): VcAdverseSection[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      accountNumber:    String(e.AccountNumber ?? ""),
      nameOnFile:       String(e.NameOnFile    ?? ""),
      dateOfRecord:     parseSearchworxDate(e.DateOfRecord    as string | undefined),
      openBalanceCents: parseSearchworxRandDecimal(e.OpenBalance  as string | undefined),
      instalmentCents:  parseSearchworxRandDecimal(e.Instalment   as string | undefined),
      accountOpenDate:  parseSearchworxDate(e.AccountOpenDate as string | undefined),
    }
  })
}
