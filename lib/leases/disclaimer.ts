// Server-only — disclaimer text, version, and acceptance check.
// The gate text is what users accept before accessing lease features.
// The document text is appended to every generated lease PDF.

import { createClient } from "@/lib/supabase/server"
import { getServerUser } from "@/lib/auth/server"

export const DISCLAIMER_VERSION = "v1"

// ─── Acceptance gate text (shown in modal, user must scroll + accept) ───────
// Source: brief/legal/FINAL_PLATFORM_DISCLAIMER.md — attorney reviewed

export const DISCLAIMER_GATE_TEXT = `Before using the Pleks lease template system, please read and accept the following:

The lease templates, clauses, and annexures on this platform have been professionally drafted with input from qualified South African attorneys and are maintained at the cost of Pleks (Pty) Ltd. They have been prepared with the intention of being legally sound and aligned with current South African rental legislation. However, no template can account for every letting arrangement, and the following terms apply to your use of this content:

1. TEMPLATES, NOT LEGAL ADVICE

The lease agreement templates, clauses, property rules, and annexures provided by Pleks are templates for your convenience. They are not legal advice and do not constitute a legal service. Pleks (Pty) Ltd is a technology platform, not a law firm, legal advisory service, or registered estate agency. No attorney-client or professional advisory relationship is created by your use of these templates.

2. YOUR RESPONSIBILITY TO REVIEW AND CUSTOMISE

You are solely responsible for reviewing, customising, and ensuring the suitability of all lease content for your specific letting arrangement. You use the templates and any generated content at your own discretion and risk. You should not rely on these templates without verifying that they meet your specific needs and the requirements of the property in question, including any Body Corporate or Homeowners' Association rules.

3. NO GUARANTEE OF LEGAL COMPLIANCE

While these clauses reference the Rental Housing Act 50 of 1999 and the Consumer Protection Act 68 of 2008, Pleks makes no representation or warranty that the templates are current with all legislative amendments, that they comply with all applicable laws in every circumstance, or that any provision will be enforceable in all circumstances in a court or Tribunal. Compliance depends entirely on the specific facts and context of your rental agreement.

4. USER-GENERATED AND AI-FORMATTED CONTENT

Any content you add, edit, or format — whether manually or using AI-assisted tools — is your sole responsibility. Pleks does not review, verify, or endorse user-modified content. AI-assisted formatting is a text-processing tool only and does not constitute legal drafting, legal review, or legal advice.

5. LIMITATION OF LIABILITY

To the fullest extent permitted by law, Pleks (Pty) Ltd accepts no liability for any indirect, consequential, or incidental loss, and any direct loss to the extent arising from or in connection with your use of the platform's templates or AI tools. This includes, without limitation, any claim by a tenant, co-lessee, or regulatory authority. Nothing in this disclaimer seeks to exclude liability for gross negligence or wilful misconduct as prohibited by the Consumer Protection Act.

6. INDEPENDENT LEGAL ADVICE

You are strongly advised to obtain independent legal advice before using these templates, particularly where you have customised terms, where the arrangement is complex, or where you are unsure of your obligations under South African law.

This disclaimer forms part of, and should be read with, the Pleks Terms of Service.

By clicking "I accept," you acknowledge that you have read and understood this disclaimer and accept full responsibility for such use.`

// ─── In-document disclaimer (appended to every generated lease PDF) ──────────
// Source: brief/build/ADDENDUM_44A_CREDIT_TERMS.md section 3 — attorney reviewed

export const DOCUMENT_DISCLAIMER_TEXT = `IMPORTANT NOTICE

This lease agreement has been generated using the Pleks property management platform. The standard clauses contained herein have been drafted with reference to the Rental Housing Act 50 of 1999, the Consumer Protection Act 68 of 2008, and applicable South African law. However, this agreement does not constitute legal advice.

The Lessor is solely responsible for ensuring that the terms of this agreement are appropriate for the specific letting arrangement and comply with all applicable laws and regulations. Pleks (Pty) Ltd accepts no liability for any loss, damage, or legal consequence arising from the use of this agreement or any of its terms, including any property rules, annexures, or AI-assisted content contained herein.

The Lessor is advised to seek independent legal advice before entering into this agreement, particularly where the agreement has been customised or where AI-assisted formatting tools have been used to generate content.

By using this agreement, the Lessor acknowledges that Pleks (Pty) Ltd is a technology platform provider and not a legal services provider, law firm, or estate agency.`

// ─── Server-side acceptance check ────────────────────────────────────────────

export async function hasAcceptedLeaseDisclaimer(): Promise<boolean> {
  const user = await getServerUser()
  if (!user) return false

  const supabase = await createClient()
  const { data } = await supabase
    .from("consent_log")
    .select("id")
    .eq("user_id", user.id)
    .eq("consent_type", "lease_template_disclaimer")
    .eq("consent_version", DISCLAIMER_VERSION)
    .limit(1)
    .maybeSingle()

  return !!data
}
