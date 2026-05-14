/**
 * lib/screening/bankStatementClassification.ts — Server actions for bank statement debit classification
 *
 * Auth:   applicant token (public portal) — no org auth required
 * Data:   application_bank_statement_classifications, applications
 * Notes:  Called after the ADDENDUM_14D Sonnet extraction resolves recurring_debits.
 *         High-confidence items (>=0.7) are auto-classified on insert.
 *         Low-confidence items surface to the applicant UI for manual classification.
 *         `is_counted_in_commitments` is derived from final_classification on every upsert.
 */
"use server"

import { createServiceClient } from "@/lib/supabase/server"
import { isCountedInCommitments, type ClassificationType } from "@/lib/screening/bankStatementExtraction"
import type { RecurringDebit } from "@/lib/screening/bankStatementExtraction"

const CONFIDENCE_THRESHOLD = 0.7

export interface ClassificationRow {
  id: string
  payee_signature: string
  payee_description_example: string
  monthly_mean_cents: number
  monthly_min_cents: number
  monthly_max_cents: number
  monthly_variance_cents: number
  occurrence_count: number
  sonnet_classification: string
  sonnet_confidence: number
  applicant_classification: string | null
  final_classification: string
  is_counted_in_commitments: boolean
  needsReview: boolean
}

/**
 * Persists recurring debits from Sonnet extraction into application_bank_statement_classifications.
 * Auto-classifies high-confidence items; leaves low-confidence items for applicant review.
 */
export async function upsertClassificationsFromExtraction(
  applicationId: string,
  orgId: string,
  bankStatementDocPath: string,
  debits: RecurringDebit[],
  coApplicantId?: string,
): Promise<{ inserted: number; needsReview: number }> {
  const supabase = await createServiceClient()

  const rows = debits.map((debit) => {
    const autoClassified = debit.classification_confidence >= CONFIDENCE_THRESHOLD
    const finalClassification: ClassificationType = autoClassified
      ? debit.classification
      : 'unclassified_skipped'

    return {
      org_id: orgId,
      application_id: applicationId,
      co_applicant_id: coApplicantId ?? null,
      bank_statement_doc_path: bankStatementDocPath,
      payee_signature: debit.payee_signature,
      payee_description_example: debit.payee_description_example,
      monthly_mean_cents: debit.monthly_mean_cents,
      monthly_min_cents: debit.monthly_min_cents,
      monthly_max_cents: debit.monthly_max_cents,
      monthly_variance_cents: debit.monthly_variance_cents,
      occurrence_count: debit.occurrence_count,
      sonnet_classification: debit.classification,
      sonnet_confidence: debit.classification_confidence,
      applicant_classification: null,
      final_classification: finalClassification,
      is_counted_in_commitments: isCountedInCommitments(finalClassification),
    }
  })

  const { error } = await supabase
    .from("application_bank_statement_classifications")
    .upsert(rows, { onConflict: "application_id,co_applicant_id,payee_signature" })

  if (error) {
    console.error("upsertClassificationsFromExtraction failed:", error.message)
    throw new Error("Failed to persist classifications")
  }

  const needsReview = debits.filter((d) => d.classification_confidence < CONFIDENCE_THRESHOLD).length
  return { inserted: rows.length, needsReview }
}

/**
 * Returns all classifications for an application that need applicant review
 * (sonnet_confidence < threshold AND not yet manually classified).
 */
export async function getPendingClassifications(
  applicationId: string,
  coApplicantId?: string,
): Promise<ClassificationRow[]> {
  const supabase = await createServiceClient()

  let query = supabase
    .from("application_bank_statement_classifications")
    .select("id, payee_signature, payee_description_example, monthly_mean_cents, monthly_min_cents, monthly_max_cents, monthly_variance_cents, occurrence_count, sonnet_classification, sonnet_confidence, applicant_classification, final_classification, is_counted_in_commitments")
    .eq("application_id", applicationId)
    .lt("sonnet_confidence", CONFIDENCE_THRESHOLD)
    .is("applicant_classification", null)

  if (coApplicantId) {
    query = query.eq("co_applicant_id", coApplicantId)
  } else {
    query = query.is("co_applicant_id", null)
  }

  const { data, error } = await query

  if (error) {
    console.error("getPendingClassifications failed:", error.message)
    return []
  }

  return (data ?? []).map((row) => ({
    ...row,
    needsReview: true,
  }))
}

/**
 * Applicant submits their classification for a single debit item.
 * Updates final_classification and recomputes is_counted_in_commitments.
 */
export async function submitApplicantClassification(
  classificationId: string,
  applicationId: string,
  classification: ClassificationType,
  suppressedByRentMatch: boolean = false,
): Promise<void> {
  const supabase = await createServiceClient()

  const { error } = await supabase
    .from("application_bank_statement_classifications")
    .update({
      applicant_classification: classification,
      applicant_classified_at: new Date().toISOString(),
      final_classification: classification,
      is_counted_in_commitments: isCountedInCommitments(classification, suppressedByRentMatch),
    })
    .eq("id", classificationId)
    .eq("application_id", applicationId)

  if (error) {
    console.error("submitApplicantClassification failed:", error.message)
    throw new Error("Failed to save classification")
  }
}

/**
 * Sums the total classified commitments cents for a given application.
 * Used by the prescreen engine for Ratio 2.
 */
export async function sumClassifiedCommitments(
  applicationId: string,
  coApplicantId?: string,
): Promise<{ totalCents: number; unclassifiedCount: number }> {
  const supabase = await createServiceClient()

  let query = supabase
    .from("application_bank_statement_classifications")
    .select("monthly_mean_cents, is_counted_in_commitments, final_classification")
    .eq("application_id", applicationId)

  if (coApplicantId) {
    query = query.eq("co_applicant_id", coApplicantId)
  } else {
    query = query.is("co_applicant_id", null)
  }

  const { data, error } = await query

  if (error) {
    console.error("sumClassifiedCommitments failed:", error.message)
    return { totalCents: 0, unclassifiedCount: 0 }
  }

  const rows = data ?? []
  const totalCents = rows
    .filter((r) => r.is_counted_in_commitments)
    .reduce((sum, r) => sum + r.monthly_mean_cents, 0)

  const unclassifiedCount = rows.filter(
    (r) => r.final_classification === 'unclassified_skipped' || r.final_classification === 'dont_recognise_flag_for_agent'
  ).length

  return { totalCents, unclassifiedCount }
}
