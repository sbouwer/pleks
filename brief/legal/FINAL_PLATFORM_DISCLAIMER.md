# FINAL: Platform Disclaimer — Lease Template Acceptance Gate

**Status:** Attorney reviewed — ready for implementation
**Related:** BUILD_44_PROPERTY_RULES.md, ADDENDUM_44A_CREDIT_TERMS.md

---

## Disclaimer text (final)

**Lease Template Disclaimer**

Before using the Pleks lease template system, please read and accept the following:

The lease templates, clauses, and annexures on this platform have been professionally drafted with input from qualified South African attorneys and are maintained at the cost of Pleks (Pty) Ltd. They have been prepared with the intention of being legally sound and aligned with current South African rental legislation. However, no template can account for every letting arrangement, and the following terms apply to your use of this content:

**1. Templates, not legal advice**

The lease agreement templates, clauses, property rules, and annexures provided by Pleks are templates for your convenience. They are not legal advice and do not constitute a legal service. Pleks (Pty) Ltd is a technology platform, not a law firm, legal advisory service, or registered estate agency. No attorney-client or professional advisory relationship is created by your use of these templates.

**2. Your responsibility to review and customise**

You are solely responsible for reviewing, customising, and ensuring the suitability of all lease content for your specific letting arrangement. You use the templates and any generated content at your own discretion and risk. You should not rely on these templates without verifying that they meet your specific needs and the requirements of the property in question, including any Body Corporate or Homeowners' Association rules.

**3. No guarantee of legal compliance**

While these clauses reference the Rental Housing Act 50 of 1999 and the Consumer Protection Act 68 of 2008, Pleks makes no representation or warranty that the templates are current with all legislative amendments, that they comply with all applicable laws in every circumstance, or that any provision will be enforceable in all circumstances in a court or Tribunal. Compliance depends entirely on the specific facts and context of your rental agreement.

**4. User-generated and AI-formatted content**

Any content you add, edit, or format — whether manually or using AI-assisted tools — is your sole responsibility. Pleks does not review, verify, or endorse user-modified content. AI-assisted formatting is a text-processing tool only and does not constitute legal drafting, legal review, or legal advice.

**5. Limitation of liability**

To the fullest extent permitted by law, Pleks (Pty) Ltd accepts no liability for any indirect, consequential, or incidental loss, and any direct loss to the extent arising from or in connection with your use of the platform's templates or AI tools. This includes, without limitation, any claim by a tenant, co-lessee, or regulatory authority. Nothing in this disclaimer seeks to exclude liability for gross negligence or wilful misconduct as prohibited by the Consumer Protection Act.

**6. Independent legal advice**

You are strongly advised to obtain independent legal advice before using these templates, particularly where you have customised terms, where the arrangement is complex, or where you are unsure of your obligations under South African law.

This disclaimer forms part of, and should be read with, the Pleks Terms of Service.

By clicking "I accept," you acknowledge that you have read and understood this disclaimer and accept full responsibility for such use.

---

## Implementation

### Consent gate

Full-screen modal on first access to any lease template page. "I accept" button disabled until user scrolls to bottom. Acceptance recorded once per disclaimer version.

### Pages requiring acceptance

`/settings/lease-template`, `/leases/new`, `/leases/{id}`, property rules editor — any route that touches lease template content.

### consent_log entry

```ts
{
  org_id,
  user_id,
  consent_type: 'lease_template_disclaimer',
  consent_version: 'v1',
  content_hash: sha256(disclaimerText),
  ip_address,
  user_agent,
  accepted_via: 'web',
  accepted_at: new Date().toISOString(),
}
```

### Version management

- `content_hash` of the rendered disclaimer text stored alongside the version string
- Minor typo fixes (same hash threshold) don't trigger re-acceptance
- Substantive wording changes increment the version and require re-acceptance
- All historical acceptances retained in `consent_log` for audit trail

### Tenant experience

The tenant never sees this disclaimer. The generated lease is a clean document between the parties. Platform protection is layered: sign-up Terms of Service + this acceptance gate + consent_log audit trail.
