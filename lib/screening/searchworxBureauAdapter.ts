/**
 * lib/screening/searchworxBureauAdapter.ts — Maps CombinedParsed bureau nodes to BureauScore[] for the FitScore engine
 *
 * Auth:   internal — called by lib/screening/bundle-runner.ts during screening
 * Data:   pure function; no DB access, no async
 * Notes:  Only XDS exposes hasSAFPS. Only XDS has reliable monthly instalment totals.
 *         Bureaus offline at time of report yield no BureauScore entry; engine handles absent bureaus.
 *         idReissueAgeMonths from VeriCred Home Affairs: recently-issued IDs are a fraud signal.
 *         Spec: ADDENDUM_14J_FITSCORE_COMPOSITE.md §3.
 */
import type { CombinedParsed } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import type { BureauScore } from "@/lib/screening/fitScoreEngine.v1"

function monthsAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 30.4375))
}

export function extractBureauScores(parsed: CombinedParsed): BureauScore[] {
  const scores: BureauScore[] = []
  const { bureaus } = parsed

  // ── VeriCred ──────────────────────────────────────────────────────────────────
  if (bureaus.veriCred.status === "Found") {
    const d = bureaus.veriCred.data
    scores.push({
      bureau: 'vericred',
      delphiScore: d.credit.delphiScore > 0 ? d.credit.delphiScore : null,
      coverageMonths: 0,
      hasAdverseListings: d.credit.adverseSections.length > 0,
      adverseListingCount: d.credit.adverseSections.length,
      writtenOffCount: 0,
      monthlyInstalmentCents: null,
      hasSAFPS: false,
      hasDebtReview: d.credit.debtReview !== null,
      hasActiveJudgment: false,
      judgmentAgeMonths: null,
      idReissueAgeMonths: d.homeAffairs.idIssuedDate ? monthsAgo(d.homeAffairs.idIssuedDate) : null,
    })
  }

  // ── Experian Sigma ────────────────────────────────────────────────────────────
  if (bureaus.experianSigma.status === "Found") {
    const d = bureaus.experianSigma.data
    scores.push({
      bureau: 'sigma',
      delphiScore: d.credit.delphiScore > 0 ? d.credit.delphiScore : null,
      coverageMonths: 0,
      hasAdverseListings: (d.credit.consumerStatistics?.adverseAccounts ?? 0) > 0,
      adverseListingCount: d.credit.consumerStatistics?.adverseAccounts ?? 0,
      writtenOffCount: 0,
      monthlyInstalmentCents: null,
      hasSAFPS: false,
      hasDebtReview: false,
      hasActiveJudgment: false,
      judgmentAgeMonths: null,
      idReissueAgeMonths: null,
    })
  }

  // ── TransUnion ────────────────────────────────────────────────────────────────
  if (bureaus.transUnion.status === "Found") {
    const d = bureaus.transUnion.data
    scores.push({
      bureau: 'transunion',
      delphiScore: null,
      coverageMonths: 0,
      hasAdverseListings: d.credit.defaults.length > 0,
      adverseListingCount: d.credit.defaults.length,
      writtenOffCount: d.credit.defaults.filter(x => x.writtenOffDate !== null).length,
      monthlyInstalmentCents: null,
      hasSAFPS: false,
      hasDebtReview: d.credit.debtReviewStatus !== null,
      hasActiveJudgment: false,
      judgmentAgeMonths: null,
      idReissueAgeMonths: null,
    })
  }

  // ── XDS ───────────────────────────────────────────────────────────────────────
  // XDS is the primary source for instalment totals, judgments, and SAFPS flag.
  if (bureaus.xds.status === "Found") {
    const d = bureaus.xds.data
    const ds = d.credit.consumerDebtSummary
    const safpsRaw = d.credit.safpsListing.trim()
    scores.push({
      bureau: 'xds',
      delphiScore: null,
      coverageMonths: 0,
      hasAdverseListings: (ds.defaultListingCount + ds.courtNoticeCount + ds.judgmentCount) > 0,
      adverseListingCount: ds.defaultListingCount + ds.courtNoticeCount + ds.judgmentCount,
      writtenOffCount: 0,
      monthlyInstalmentCents: ds.totalMonthlyInstallmentCents > 0 ? ds.totalMonthlyInstallmentCents : null,
      hasSAFPS: safpsRaw.length > 0 && safpsRaw !== 'Not Listed',
      hasDebtReview: false,
      hasActiveJudgment: ds.judgmentCount > 0,
      judgmentAgeMonths: null,
      idReissueAgeMonths: null,
    })
  }

  return scores
}
