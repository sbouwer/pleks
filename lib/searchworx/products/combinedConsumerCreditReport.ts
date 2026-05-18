/**
 * lib/searchworx/products/combinedConsumerCreditReport.ts — Combined Consumer Credit Report orchestrator
 *
 * Notes:  ADDENDUM_14H v3 §A + §B. Single R170 call returning 4-6 bureaus in parallel.
 *         CallerModule: "credit/csi", SearchType: 126, ResponseMessage: "CombinedConsumerCreditReport".
 *         Endpoint path "credit/csi" derived from CallerModule in captured response — verify vs
 *         DocCentral before production switch (open decision §9.1 in _HANDOVER_14H_PHASE2_COMBINED.md).
 *         Bureau-level status flags: {BureauName}: "Found" | "SERVICE OFFLINE".
 *         Sub-parsers handle per-bureau field shapes (casing, monetary format, date format differ).
 *         computeCombinedResultSummary counts TU/XDS/Sigma/VeriCred — CompuScan/Experian are bonus.
 *         Request body is PascalCase (consistent with the Combined product family).
 */
import type { SearchworxError }                   from "../client"
import { searchworxCall }                          from "../client"
import { downloadAndStoreSearchworxArtefact }      from "../storage"
import { parseSearchInformation }                  from "../utils"
import { parseCompuScanNode }                      from "./_subparsers/compuscan"
import { parseExperianNode }                       from "./_subparsers/experian"
import { parseExperianSigmaNode }                  from "./_subparsers/experianSigma"
import { parseTransUnionNode }                     from "./_subparsers/transunion"
import { parseVeriCredNode }                       from "./_subparsers/vericred"
import { parseXdsNode }                            from "./_subparsers/xds"
import type { CompuScanParsed }                    from "./_subparsers/compuscan"
import type { ExperianParsed }                     from "./_subparsers/experian"
import type { ExperianSigmaParsed }                from "./_subparsers/experianSigma"
import type { TransUnionParsed }                   from "./_subparsers/transunion"
import type { VcParsed }                           from "./_subparsers/vericred"
import type { XdsParsed }                          from "./_subparsers/xds"

// ─── Product constants ────────────────────────────────────────────────────────

export const COMBINED_PRODUCT_KEY  = "combined_consumer_credit_report"
export const COMBINED_COST_CENTS   = 17000  // R170.00 ex-VAT — ADDENDUM_14H v3 rate card
export const COMBINED_SEARCH_TYPE  = 126    // CSICombinedCreditReport
export const COMBINED_PRODUCT_PATH = "credit/csi"

export const COMBINED_DISPLAY_NAME = "Credit profile & identity verification — Multi-bureau"
export const COMBINED_DESCRIPTION  =
  "Multi-bureau credit profile combining TransUnion, XDS, Experian Sigma, and VeriCred " +
  "into a single cross-verified record. Includes Home Affairs verification, fraud register " +
  "check (SAFPS), credit scores, payment behaviour, and adverse listings."

export const COMBINED_RESULT_SUMMARIES = {
  success_full:    "Multi-bureau credit profile retrieved (all bureaus online)",
  success_partial: "Multi-bureau credit profile retrieved (some bureaus offline — see report)",
  no_data:         "No credit record found across any bureau for the supplied ID number",
  failed:          "Multi-bureau credit profile request failed — refunded",
} as const

export const COMBINED_DATA_CONTROLLERS = [
  { name: "TransUnion Credit Bureau (Pty) Ltd",           contact: "0861 482 482", disputes_email: "disputes@transunion.co.za", popia_subject_request_url: "https://www.transunion.co.za/privacy" },
  { name: "Xpert Decision Systems (Pty) Ltd (XDS)",       contact: "TBD",          disputes_email: "TBD",                       popia_subject_request_url: "TBD" },
  { name: "Experian South Africa (Pty) Ltd",              contact: "TBD",          disputes_email: "TBD",                       popia_subject_request_url: "TBD" },
  { name: "Verisk Capability and Credit Bureau (Pty) Ltd", contact: "TBD",         disputes_email: "TBD",                       popia_subject_request_url: "TBD" },
  { name: "CompuScan Information Technologies",           contact: "TBD",          disputes_email: "TBD",                       popia_subject_request_url: "TBD" },
] as const

// ─── Input / output types ─────────────────────────────────────────────────────

export interface CombinedRequestInput {
  orgId:       string
  applicationId: string
  reference:   string
  idNumber:    string
}

type BureauResult<T> = { status: "Found"; data: T } | { status: "SERVICE OFFLINE"; data: null }

export interface CombinedParsed {
  search:  ReturnType<typeof parseSearchInformation>
  bureaus: {
    transUnion:    BureauResult<TransUnionParsed>
    xds:           BureauResult<XdsParsed>
    experianSigma: BureauResult<ExperianSigmaParsed>
    veriCred:      BureauResult<VcParsed>
    compuScan:     BureauResult<CompuScanParsed>
    experian:      BureauResult<ExperianParsed>
  }
  searchToken: string
  pdfCopyUrl:  string
}

// ─── Run function ─────────────────────────────────────────────────────────────

export async function runCombinedConsumerCreditReport(
  input: CombinedRequestInput,
): Promise<
  | { ok: true;  parsed: CombinedParsed; pdfStoragePath: string; resultSummaryKey: keyof typeof COMBINED_RESULT_SUMMARIES }
  | { ok: false; error: SearchworxError }
> {
  const result = await searchworxCall<Record<string, unknown>>({
    productPath: COMBINED_PRODUCT_PATH,
    buildBody:   (token) => ({
      SessionToken: token,
      Reference:    input.reference,
      IDNumber:     input.idNumber,
    }),
  })

  if (!result.ok) return result

  const parsed = parseCombinedResponse(result.data)
  const pdfCopyUrl = result.pdfCopyUrl ?? ""

  const pdfStoragePath = pdfCopyUrl
    ? (await downloadAndStoreSearchworxArtefact({
        vendorUrl:    pdfCopyUrl,
        orgId:        input.orgId,
        refId:        input.applicationId,
        productKey:   COMBINED_PRODUCT_KEY,
        searchToken:  parsed.searchToken,
        artefactKind: "raw",
        mimeType:     "application/pdf",
      })).storagePath
    : ""

  const resultSummaryKey = computeCombinedResultSummary(parsed)

  return { ok: true, parsed, pdfStoragePath, resultSummaryKey }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseCombinedResponse(raw: Record<string, unknown>): CombinedParsed {
  const si  = (raw.SearchInformation       ?? {}) as Record<string, unknown>
  const cci = (raw.CombinedCreditInformation ?? {}) as Record<string, unknown>

  const search = parseSearchInformation(si)

  return {
    search,
    bureaus: {
      transUnion:    parseBureauNode(cci.TransUnion,    cci.TransUnionInfo,    parseTransUnionNode),
      xds:           parseBureauNode(cci.XDS,           cci.XDSInfo,           parseXdsNode),
      experianSigma: parseBureauNode(cci.ExperianSigma, cci.ExperianSigmaInfo, parseExperianSigmaNode),
      veriCred:      parseBureauNode(cci.VeriCred,      cci.VeriCredInfo,      parseVeriCredNode),
      compuScan:     parseBureauNode(cci.CompuScan,     cci.CompuScanInfo,     parseCompuScanNode),
      experian:      parseBureauNode(cci.Experian,      cci.ExperianInfo,      parseExperianNode),
    },
    searchToken: search.searchToken,
    pdfCopyUrl:  "",
  }
}

function parseBureauNode<T>(
  status: unknown,
  rawNode: unknown,
  parser: (raw: unknown) => T,
): BureauResult<T> {
  if (status !== "Found") return { status: "SERVICE OFFLINE", data: null }
  return { status: "Found", data: parser(rawNode) }
}

// ─── Result summary ───────────────────────────────────────────────────────────

export function computeCombinedResultSummary(
  parsed: CombinedParsed,
): keyof typeof COMBINED_RESULT_SUMMARIES {
  const coreBureaus = [
    parsed.bureaus.transUnion,
    parsed.bureaus.xds,
    parsed.bureaus.experianSigma,
    parsed.bureaus.veriCred,
  ]
  const foundCount = coreBureaus.filter(b => b.status === "Found").length
  if (foundCount === 0)              return "no_data"
  if (foundCount === coreBureaus.length) return "success_full"
  return "success_partial"
}
