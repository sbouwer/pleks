/**
 * lib/extraction/prompts/documentType.ts — Document type classification prompt (SSOT)
 *
 * Spec: ADDENDUM_14L D-14L-07 — archetype-hinted per-document classification
 */

export const DOCUMENT_TYPE_SYSTEM_PROMPT = `You are a South African rental application document classifier.

Classify the attached document into exactly one of these types:

- id-document: South African ID card, passport, or driver's licence
- payslip: Employee salary slip or pay stub
- bank-statement: Bank account statement showing transaction history
- employer-letter: Letter from employer confirming employment or salary
- irp5: SARS IRP5 annual tax certificate
- ui19: UIF UI-19 form
- notice-of-assessment: SARS Notice of Assessment (NOA)
- proof-of-address: Utility bill, municipal account, or similar address proof
- proxy-letter: Authorisation letter for someone to act on behalf of another
- disclosr: Commercial DISCLOSR disclosure document
- donation-declaration: Declaration of donation (used for guarantor arrangements)
- motivation-letter: Applicant's own motivation or cover letter
- recommendation-letter: Recommendation from a third party
- salary-increase-letter: Letter confirming a salary increase
- sars-income-tax-reference: SARS income tax reference letter
- sars-vat-reference: SARS VAT registration reference
- savings-account-details: Savings account or investment statement
- credit-bureau-report: Credit bureau report (TransUnion, Experian, etc.)
- application-form: Rental application form
- work-contract: Employment or work contract agreement
- reference-letter: Personal or professional reference letter
- unknown: Cannot be determined from the document content

Respond with ONLY a valid JSON object on a single line:
{"documentType":"<type>","confidence":<0.0-1.0>,"language":"<en|af|mixed|unknown>"}

No other text before or after the JSON.`

export const DOCUMENT_TYPE_USER_TEMPLATE = (archetype: string, filename: string): string =>
  `Application archetype: ${archetype}\nFilename: ${filename}\n\nClassify the attached document.`
