/**
 * lib/searchworx/products/_subparsers/xds.ts — XDS node parser
 *
 * Notes:  Parses the XDSInfo block inside Combined Consumer Credit Report.
 *         Field shapes mirror standalone XDS Consumer Profile By IDNumber.
 *         Monetary fields use parseSearchworxRandDecimal ("0.0000" / "1550" format).
 *         TelephoneHistory entries have stable TelephoneID and DialCode+Number structure.
 *         AddressHistory entries have stable AddressID cross-query identifier.
 *         SAFPSListing is unique to XDS (SAFPS = Southern African Fraud Prevention Service).
 */
import {
  coerceNumericMap,
  normaliseGender,
  normaliseSearchworxPhone,
  parseIntOrZero,
  parseSearchworxDate,
  parseSearchworxRandDecimal,
} from "../../utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface XdsAddressEntry {
  addressId:       string
  typeDescription: string
  typeCode:        string
  fullAddress:     string
  postalCode:      string
  lastUpdatedDate: Date | null
}

export interface XdsPhoneEntry {
  telephoneId:     string
  typeDescription: string
  typeCode:        string
  e164:            string | null
  lastUpdatedDate: Date | null
}

export interface XdsConsumerDebtSummary {
  totalMonthlyInstallmentCents:    number
  totalOutstandingDebtCents:       number
  noOfActiveAccounts:              number
  noOfAccountsInGoodStanding:      number
  noOfAccountsInBadStanding:       number
  totalArrearAmountCents:          number
  noOfAccountsOpenedLast45Days:    number
  noOfPaidUpOrClosedAccounts:      number
  noOfEnquiriesLast90DaysOwn:      number
  noOfEnquiriesLast90DaysOther:    number
  judgmentCount:                   number
  totalJudgmentAmountCents:        number
  courtNoticeCount:                number
  totalCourtNoticeAmountCents:     number
  noOfAccountDefaults:             number
  totalAdverseAmountCents:         number
  defaultListingCount:             number
  defaultListingAmountCents:       number
  noOfEnquiriesLast24Months:       number
  noOfActiveAccountsCpa:           number
  totalMonthlyInstallmentCpaCents: number
  totalOutstandingDebtCpaCents:    number
  totalArrearAmountCpaCents:       number
  noOfActiveAccountsNlr:           number
  totalMonthlyInstallmentNlrCents: number
  totalOutstandingDebtNlrCents:    number
  totalArrearAmountNlrCents:       number
}

export interface XdsParsed {
  person: {
    personId:      string
    firstName:     string
    surname:       string
    initials:      string
    dateOfBirth:   Date | null
    gender:        ReturnType<typeof normaliseGender>
    maritalStatus: string
    idNumber:      string
  }
  homeAffairs: {
    deceasedStatus: string
    verifiedStatus: string
  }
  contact: {
    mobileE164:        string | null
    homeTelephoneE164: string | null
    workTelephoneE164: string | null
    physicalAddress:   string
    postalAddress:     string
  }
  credit: {
    dataCounts:        Record<string, number>
    safpsListing:      string
    consumerDebtSummary: XdsConsumerDebtSummary
  }
  directorships: {
    noOfCompanyDirectors: number
  }
  properties: {
    noOfProperties:   number
    purchasePriceCents: number
  }
  history: {
    addresses:  XdsAddressEntry[]
    telephones: XdsPhoneEntry[]
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseXdsNode(raw: unknown): XdsParsed {
  const r = raw as Record<string, unknown>

  const pi  = (r.PersonInformation      ?? {}) as Record<string, unknown>
  const hai = (r.HomeAffairsInformation ?? {}) as Record<string, unknown>
  const ci  = (r.ContactInformation     ?? {}) as Record<string, unknown>
  const cri = (r.CreditInformation      ?? {}) as Record<string, unknown>
  const dir = (r.DirectorshipInformation ?? {}) as Record<string, unknown>
  const prp = (r.PropertyInformation    ?? {}) as Record<string, unknown>
  const hi  = (r.HistoricalInformation  ?? {}) as Record<string, unknown>

  const fraudSummary    = (cri.FraudIndicatorSummary  ?? {}) as Record<string, unknown>
  const debtSummaryRaw  = (cri.ConsumerDebtSummary    ?? {}) as Record<string, unknown>
  const dirSummary      = ((dir.DirectorSummary       ?? {}) as Record<string, unknown>)
  const prpSummary      = ((prp.PropertySummary       ?? {}) as Record<string, unknown>)

  return {
    person: {
      personId:      String(pi.PersonID      ?? ""),
      firstName:     String(pi.FirstName     ?? ""),
      surname:       String(pi.Surname       ?? ""),
      initials:      String(pi.Initials      ?? ""),
      dateOfBirth:   parseSearchworxDate(pi.DateOfBirth as string | undefined),
      gender:        normaliseGender(pi.Gender as string | undefined),
      maritalStatus: String(pi.MaritalStatus ?? ""),
      idNumber:      String(pi.IDNumber      ?? ""),
    },
    homeAffairs: {
      deceasedStatus: String(hai.DeceasedStatus ?? ""),
      verifiedStatus: String(hai.VerifiedStatus ?? ""),
    },
    contact: {
      mobileE164:        normaliseSearchworxPhone({ FullNumber: String(ci.MobileNumber         ?? "") }),
      homeTelephoneE164: normaliseSearchworxPhone({ FullNumber: String(ci.HomeTelephoneNumber  ?? "") }),
      workTelephoneE164: normaliseSearchworxPhone({ FullNumber: String(ci.WorkTelephoneNumber  ?? "") }),
      physicalAddress:   String(ci.PhysicalAddress ?? ""),
      postalAddress:     String(ci.PostalAddress   ?? ""),
    },
    credit: {
      dataCounts:          coerceNumericMap((cri.DataCounts ?? {}) as Record<string, string>),
      safpsListing:        String(fraudSummary.SAFPSListing ?? ""),
      consumerDebtSummary: parseConsumerDebtSummary(debtSummaryRaw),
    },
    directorships: {
      noOfCompanyDirectors: parseIntOrZero(String(dirSummary.NoOfCompanyDirectors ?? "0")),
    },
    properties: {
      noOfProperties:     parseIntOrZero(String(prpSummary.NoOfProperties ?? "0")),
      purchasePriceCents: parseSearchworxRandDecimal(prpSummary.PurchasePrice as string | undefined),
    },
    history: {
      addresses:  parseXdsAddressHistory(hi.AddressHistory),
      telephones: parseXdsTelephoneHistory(hi.TelephoneHistory),
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseConsumerDebtSummary(r: Record<string, unknown>): XdsConsumerDebtSummary {
  const rd = (field: string) => parseSearchworxRandDecimal(r[field] as string | undefined)
  const ri = (field: string) => parseIntOrZero(String(r[field] ?? "0"))
  return {
    totalMonthlyInstallmentCents:    rd("TotalMonthlyInstallment"),
    totalOutstandingDebtCents:       rd("TotalOutStandingDebt"),
    noOfActiveAccounts:              ri("NoOFActiveAccounts"),
    noOfAccountsInGoodStanding:      ri("NoOfAccountInGoodStanding"),
    noOfAccountsInBadStanding:       ri("NoOfAccountInBadStanding"),
    totalArrearAmountCents:          rd("TotalArrearAmount"),
    noOfAccountsOpenedLast45Days:    ri("NoOfAccountsOpenedinLast45Days"),
    noOfPaidUpOrClosedAccounts:      ri("NoOfPaidUpOrClosedAccounts"),
    noOfEnquiriesLast90DaysOwn:      ri("NoOfEnquiriesLast90DaysOWN"),
    noOfEnquiriesLast90DaysOther:    ri("NoOfEnquiriesLast90DaysOTH"),
    judgmentCount:                   ri("JudgementCount"),
    totalJudgmentAmountCents:        rd("TotalJudgmentAmt"),
    courtNoticeCount:                ri("CourtNoticeCount"),
    totalCourtNoticeAmountCents:     rd("TotalCourtNoticeAmt"),
    noOfAccountDefaults:             ri("NoofAccountdefaults"),
    totalAdverseAmountCents:         rd("TotalAdverseAmt"),
    defaultListingCount:             ri("DefaultListingCount"),
    defaultListingAmountCents:       rd("DefaultListingAmt"),
    noOfEnquiriesLast24Months:       ri("NoOfEnqinLast24Months"),
    noOfActiveAccountsCpa:           ri("NoOFActiveAccountsCPA"),
    totalMonthlyInstallmentCpaCents: rd("TotalMonthlyInstallmentCPA"),
    totalOutstandingDebtCpaCents:    rd("TotalOutStandingDebtCPA"),
    totalArrearAmountCpaCents:       rd("TotalArrearAmountCPA"),
    noOfActiveAccountsNlr:           ri("NoOFActiveAccountsNLR"),
    totalMonthlyInstallmentNlrCents: rd("TotalMonthlyInstallmentNLR"),
    totalOutstandingDebtNlrCents:    rd("TotalOutStandingDebtNLR"),
    totalArrearAmountNlrCents:       rd("TotalArrearAmountNLR"),
  }
}

function parseXdsAddressHistory(raw: unknown): XdsAddressEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      addressId:       String(e.AddressID       ?? ""),
      typeDescription: String(e.TypeDescription ?? ""),
      typeCode:        String(e.TypeCode        ?? ""),
      fullAddress:     String(e.FullAddress     ?? ""),
      postalCode:      String(e.PostalCode      ?? ""),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}

function parseXdsTelephoneHistory(raw: unknown): XdsPhoneEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      telephoneId:     String(e.TelephoneID     ?? ""),
      typeDescription: String(e.TypeDescription ?? ""),
      typeCode:        String(e.TypeCode        ?? ""),
      e164:            normaliseSearchworxPhone({
        DialCode: String(e.DialCode ?? ""),
        Number:   String(e.Number   ?? ""),
      }),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}
