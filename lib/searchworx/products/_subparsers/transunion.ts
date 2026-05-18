/**
 * lib/searchworx/products/_subparsers/transunion.ts — TransUnion node parser
 *
 * Notes:  Parses the TransUnionInfo block inside Combined Consumer Credit Report.
 *         Field shapes mirror standalone TU PP (CallerModule credit/transunion) plus
 *         HomeAffairsInformation block which is UNIQUE to Combined-via-TU (not in standalone).
 *         TelephoneHistory in Combined uses cleaned format ("- 0987676543");
 *         standalone TU PP uses 20-char zero-padded ("00000000000987676543").
 *         Both are handled by normaliseSearchworxPhone.
 *         Remarks field is PII (raw phone strings) — dropped at this boundary.
 *         Fullname is redundant (firstName + surname) — dropped.
 */
import {
  coerceNumericMap,
  normaliseSearchworxPhone,
  parseIntOrZero,
  parseSearchworxCentsZeroPadded,
  parseSearchworxDate,
} from "../../utils"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TuAlsoKnownAs {
  akaName:         string
  informationDate: Date | null
}

export interface TuDefault {
  typeCode:        string
  typeDescription: string
  accountNumber:   string
  nameOnFile:      string
  dateOfRecord:    Date | null
  adverseAmountCents: number
  writtenOffDate:  Date | null
  idNumber:        string
}

export interface TuDebtReviewStatus {
  statusDate:        Date | null
  statusDescription: string
}

export interface TuPhoneEntry {
  typeDescription: string
  e164:            string | null
  lastUpdatedDate: Date | null
}

export interface TuAddressEntry {
  fullAddress:     string
  postalCode:      string
  lastUpdatedDate: Date | null
}

export interface TuEmploymentEntry {
  employerName:    string
  designation:     string
  lastUpdatedDate: Date | null
}

export interface TransUnionParsed {
  person: {
    firstName:          string
    surname:            string
    maritalStatus:      string
    gender:             string
    age:                number
    idNumber:           string
    alsoKnownAs:        TuAlsoKnownAs[]
  }
  homeAffairs: {
    firstName:       string
    idVerified:      string
    surnameVerified: string
  } | null
  contact: {
    homeTelephoneE164: string | null
    workTelephoneE164: string | null
  }
  credit: {
    dataCounts:       Record<string, number>
    debtReviewStatus: TuDebtReviewStatus | null
    defaults:         TuDefault[]
  }
  history: {
    addresses:   TuAddressEntry[]
    telephones:  TuPhoneEntry[]
    employment:  TuEmploymentEntry[]
  }
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseTransUnionNode(raw: unknown): TransUnionParsed {
  const r = raw as Record<string, unknown>

  const pi  = (r.PersonInformation      ?? {}) as Record<string, unknown>
  const hai = r.HomeAffairsInformation  as Record<string, unknown> | undefined
  const ci  = (r.ContactInformation     ?? {}) as Record<string, unknown>
  const cri = (r.CreditInformation      ?? {}) as Record<string, unknown>
  const hi  = (r.HistoricalInformation  ?? {}) as Record<string, unknown>

  return {
    person: {
      firstName:     String(pi.FirstName     ?? ""),
      surname:       String(pi.Surname       ?? ""),
      maritalStatus: String(pi.MaritalStatus ?? ""),
      gender:        String(pi.Gender        ?? ""),
      age:           parseIntOrZero(String(pi.Age ?? "0")),
      idNumber:      String(pi.IDNumber      ?? ""),
      alsoKnownAs:   parseAkaList(pi.AlsoKnownAs),
    },
    homeAffairs: hai ? {
      firstName:       String(hai.FirstName       ?? ""),
      idVerified:      String(hai.IDVerified       ?? ""),
      surnameVerified: String(hai.SurnameVerified  ?? ""),
    } : null,
    contact: {
      homeTelephoneE164: normaliseSearchworxPhone({ FullNumber: String(ci.HomeTelephoneNumber ?? "") }),
      workTelephoneE164: normaliseSearchworxPhone({ FullNumber: String(ci.WorkTelephoneNumber ?? "") }),
    },
    credit: {
      dataCounts:       coerceNumericMap((cri.DataCounts ?? {}) as Record<string, string>),
      debtReviewStatus: parseDebtReviewStatus(cri.DebtReviewStatus),
      defaults:         parseDefaults(
        ((cri.AdverseInformation as Record<string, unknown> | undefined)?.Defaults) ?? []
      ),
    },
    history: {
      addresses:  parseAddressHistory(hi.AddressHistory),
      telephones: parseTuTelephoneHistory(hi.TelephoneHistory),
      employment: parseEmploymentHistory(hi.EmploymentHistory),
    },
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseAkaList(raw: unknown): TuAlsoKnownAs[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      akaName:         String(e.AkaName         ?? ""),
      informationDate: parseSearchworxDate(e.InformationDate as string | undefined),
    }
  })
}

function parseDebtReviewStatus(raw: unknown): TuDebtReviewStatus | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (!r.StatusDate && !r.StatusDescription) return null
  return {
    statusDate:        parseSearchworxDate(r.StatusDate as string | undefined),
    statusDescription: String(r.StatusDescription ?? ""),
  }
}

function parseDefaults(raw: unknown): TuDefault[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      typeCode:           String(e.TypeCode        ?? ""),
      typeDescription:    String(e.TypeDescription ?? ""),
      accountNumber:      String(e.AccountNumber   ?? ""),
      nameOnFile:         String(e.NameOnFile      ?? ""),
      dateOfRecord:       parseSearchworxDate(e.DateOfRecord    as string | undefined),
      adverseAmountCents: parseSearchworxCentsZeroPadded(e.AdverseAmount as string | undefined),
      writtenOffDate:     parseSearchworxDate(e.WrittenOffDate  as string | undefined),
      idNumber:           String(e.IDNumber        ?? ""),
    }
  })
}

function parseAddressHistory(raw: unknown): TuAddressEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      fullAddress:     String(e.FullAddress ?? ""),
      postalCode:      String(e.PostalCode  ?? ""),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}

function parseTuTelephoneHistory(raw: unknown): TuPhoneEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    // Combined-via-TU: cleaned FullNumber ("- 0987676543")
    // Standalone TU PP: 20-char zero-padded FullNumber OR DialCode + Number
    const phone = e.DialCode !== undefined
      ? normaliseSearchworxPhone({ DialCode: String(e.DialCode ?? ""), Number: String(e.Number ?? "") })
      : normaliseSearchworxPhone({ FullNumber: String(e.FullNumber ?? e.Number ?? "") })
    return {
      typeDescription: String(e.TypeDescription ?? ""),
      e164:            phone,
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}

function parseEmploymentHistory(raw: unknown): TuEmploymentEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.map((entry: unknown) => {
    const e = entry as Record<string, unknown>
    return {
      employerName:    String(e.EmployerName ?? ""),
      designation:     String(e.Designation  ?? ""),
      lastUpdatedDate: parseSearchworxDate(e.LastUpdatedDate as string | undefined),
    }
  })
}
