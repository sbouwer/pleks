# DRAFT: Platform Disclaimer — Lease Template Acceptance Gate

**Status:** Draft — requires attorney review before implementation
**Related:** BUILD_44_PROPERTY_RULES.md, ADDENDUM_44A_CREDIT_TERMS.md
**Replaces:** Previous version that placed disclaimer inside the lease document

---

## Key change from previous draft

The disclaimer is NOT part of the lease document. It is a one-time acceptance gate between Pleks and the user (landlord/agent) before they can access, view, or edit any lease template or annexure content. The tenant never sees this disclaimer — it's a platform terms acceptance, not a lease clause.

---

## When it's shown

**First time the user navigates to any of these pages:**
- `/settings/lease-template` (lease template editor)
- `/leases/new` (lease creation wizard)
- Any lease detail page with document preview/download

A full-screen modal or interstitial page appears. The user cannot proceed until they accept. Acceptance is recorded once — `consent_log` entry with type `lease_template_disclaimer`, timestamped, IP logged per POPIA requirements.

**After acceptance:** never shown again unless the disclaimer version changes (we update the wording — they must re-accept the new version).

---

## Draft disclaimer — for attorney review

> **Lease Template Disclaimer**
>
> Before using the Pleks lease template system, please read and accept the following:
>
> **1. Templates, not legal advice**
>
> The lease agreement templates, clauses, property rules, and annexures provided by Pleks are templates for your convenience. They are not legal advice and do not constitute a legal service. Pleks (Pty) Ltd is a technology platform, not a law firm, legal advisory service, or registered estate agency.
>
> **2. Your responsibility to review and customise**
>
> You are solely responsible for reviewing, customising, and ensuring the suitability of all lease content — including standard clauses, optional clauses, property rules, and annexures — for your specific letting arrangement and circumstances. You should not rely on the templates without reviewing them.
>
> **3. No guarantee of legal compliance**
>
> While the standard clauses have been drafted with reference to the Rental Housing Act 50 of 1999, the Consumer Protection Act 68 of 2008, and other applicable South African legislation, no representation or warranty is made that the templates are suitable for every letting arrangement, that they are current with all legislative amendments, or that they comply with all applicable laws in every circumstance.
>
> **4. User-generated and AI-formatted content**
>
> Any property rules, custom clauses, or annexure content that you add, edit, or format — whether manually or using AI-assisted formatting tools — is your sole responsibility. Pleks does not review, verify, or endorse user-generated or user-modified content. AI-assisted formatting is a text formatting tool only and does not constitute legal drafting or legal review.
>
> **5. Limitation of liability**
>
> Pleks (Pty) Ltd accepts no liability for any loss, damage, claim, or legal consequence arising from your use of the lease templates, clauses, property rules, annexures, or any content generated or formatted by the platform. This includes, without limitation, any claim by a tenant, co-lessee, body corporate, or regulatory authority arising from the terms of a lease agreement generated using the platform.
>
> **6. Independent legal advice**
>
> You are advised to obtain independent legal advice before using these templates, particularly where you have customised terms, where the letting arrangement involves unusual or complex circumstances, or where you are unsure of your legal obligations under the Rental Housing Act or any other legislation.
>
> By clicking "I accept" below, you acknowledge that you have read and understood this disclaimer, and you agree to use the Pleks lease template system at your own risk.

---

## Implementation

### Consent gate component

```tsx
// components/legal/LeaseDisclaimerGate.tsx
// Wraps any page that accesses lease template content.
// Checks consent_log for an active acceptance of the current disclaimer version.
// If not accepted: shows full-screen modal with disclaimer + "I accept" button.
// If accepted: renders children normally.
```

### Consent recording

```ts
// On acceptance:
await supabase.from('consent_log').insert({
  org_id: orgId,
  user_id: userId,
  consent_type: 'lease_template_disclaimer',
  consent_version: 'v1',  // increment on wording changes
  ip_address: request.ip,
  user_agent: request.headers['user-agent'],
  accepted_at: new Date().toISOString(),
})
```

### Version management

The disclaimer has a version string (`v1`, `v2`, etc.). When the wording is updated:
1. Increment the version in the code
2. All users must re-accept on next visit to a lease template page
3. Previous acceptances remain in `consent_log` for audit trail

The consent check is: `SELECT 1 FROM consent_log WHERE user_id = ? AND consent_type = 'lease_template_disclaimer' AND consent_version = 'v1' LIMIT 1`. If no row → show the gate.

### Pages that require acceptance

| Route | Why |
|-------|-----|
| `/settings/lease-template` | Editing clause templates |
| `/settings/lease-template/*` | Sub-pages (required, optional, annexures, custom) |
| `/leases/new` | Creating a new lease from templates |
| `/leases/{id}` | Viewing lease detail (includes document preview) |
| `/leases/{id}/document` | Downloading/previewing the lease document |
| Property rules editor | Editing rules that become a lease annexure |

### What the tenant sees

Nothing. This disclaimer is between Pleks and the landlord/agent. The generated lease document contains no Pleks disclaimer — it's a clean lease agreement between the parties. The platform's protection is in:
1. This acceptance gate (user accepted the terms)
2. The platform Terms of Service (accepted on sign-up)
3. The `consent_log` audit trail (timestamped, IP-logged proof of acceptance)

---

## Notes for attorney

1. **This is a platform terms acceptance, not a lease clause.** The tenant never sees it. It protects Pleks against claims from the landlord/agent that "the platform gave me bad legal advice" or "the template was wrong and I lost a Tribunal case."

2. **POPIA compliance.** The consent is logged with timestamp, IP, user agent, and version — meeting POPIA's audit trail requirements for consent records.

3. **Re-acceptance on change.** When we update the disclaimer wording (e.g., after adding new AI features), existing users must re-accept. The consent_log keeps history of all versions accepted.

4. **Enforceability.** The combination of (a) sign-up Terms of Service + (b) this specific lease template disclaimer + (c) timestamped consent log creates a layered defence. The user can't claim they didn't know the templates weren't legal advice.

5. **CPA consideration.** Under the CPA, Pleks cannot exclude liability for gross negligence. The disclaimer should focus on: the templates are tools, the user chooses how to use them, we don't warrant suitability for specific circumstances. This is distinct from warranting that the platform works correctly (which we can't disclaim).

6. **AI-specific language.** Paragraph 4 explicitly addresses AI-formatted content. As AI features expand (beyond property rules), this paragraph covers all AI-assisted output on the platform.
