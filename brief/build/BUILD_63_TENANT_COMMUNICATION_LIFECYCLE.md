# BUILD_63 — Tenant Communication Lifecycle

**Status:** Spec'd · **Depends on:** BUILD_04 (leases), BUILD_06/45 (maintenance), BUILD_05/43 (inspections), BUILD_11 (arrears), BUILD_17 (deposits), BUILD_49 (tenant portal), BUILD_58 (WhatsApp via Africa's Talking — CS windows, consent, usage tracking, org template preferences), ADDENDUM_48A (comms foundation), **BUILD_61 (route alignment & `app.pleks.co.za` namespace — BUILD_63 uses `/tenant/communications/*` paths and the `app.pleks.co.za/login?redirect=...` central login gateway; BUILD_61 MUST ship first)**, **BUILD_62 (authentication security — BUILD_63 §9.2 writes to both `auth_events` and `audit_log` per the dual-write reconciliation; `auth_events` schema must exist before BUILD_63 portal-login audit can fire correctly)**
**Touches:** `lib/comms/`, `lib/messaging/`, `lib/actions/`, `app/api/cron/`, `app/api/webhooks/`, `communication_log` schema, template registry, `arrears-sequence` cron
**Scope:** close every tenant-facing communication gap so the platform is operationally useful for tenants, Tribunal-evidential for landlords, and legally compliant with RHA/CPA/POPIA obligations. Flip channel priority from the legacy SMS-first model to **WhatsApp-first with SMS backup**, inheriting BUILD_58's consent + CS-window + template-preference infrastructure.
**Does not touch:** applicant funnel (BUILD_16/48), owner statements (BUILD_08), broker/scheme notifications (BUILD_59), critical incident flows (BUILD_59), DebiCheck communications (deferred — see §10).

---

## 1 · Problem statement

Today a tenant signed to a Pleks-managed lease receives exactly four automated communications over the entire tenancy:

1. Arrears SMS (daily cron, when overdue) — **hardcoded single-line SMS regardless of step or tone**
2. CPA s14 renewal notice (40–80 business days before expiry)
3. Portal invite, if the agent manually triggers it
4. Portal link SMS, if the agent manually triggers it

Everything else in the tenancy runs silently. The invoice generator produces rent invoices daily but never emails them. An inspection is scheduled and the tenant finds out when the agent knocks on the door. A maintenance request is logged and vanishes into a queue. The deposit is received and no receipt is issued. At move-out the deduction schedule never goes out, even though the RHA requires it. The arrears sequence has a full schema for graduated escalation with `action_type ∈ {sms, whatsapp, email}` and per-step tone, but the runtime only fires SMS — formal letters of demand and final notices exist as template keys but no code path reaches them.

### Why this is urgent

1. **Legal exposure on mandatory notifications.** RHA s5(7) (itemised deduction schedule within 21 days), CPA s14 (20 business days renewal — already covered), RHA s5(3)(g) (7-day dispute window post-move-out), RHA s5(2) (payment receipts on request), habitability/emergency duty under the deemed terms of RHA s4B — multiple of these are silently breached by the current implementation. Each breach is grounds for a Rental Housing Tribunal complaint.

2. **Tribunal evidence is thin.** Even where a comm does go out, `communication_log.body` is truncated to 200 characters. The actual text the tenant received is not preserved, which is exactly what a Tribunal asks for.

3. **Channel model is stuck in the past.** BUILD_58 shipped WhatsApp Business via Africa's Talking with consent, CS-window tracking, and org-level template preferences. The platform has pivoted to WhatsApp-primary with SMS as a backup channel — but the arrears cron and every legacy call site still hardcodes `sendSMS()`. The WhatsApp infrastructure is in place and under-used.

4. **Tone preference is effectively fiction.** Orgs can set `tone_tenant ∈ {friendly, professional, firm}` but no tenant-facing template actually varies by tone. A WhatsApp Business deployment enables real tone variance: multiple pre-approved templates per event, one per tone, selected at send time. Email can do the same via component variants. The architecture supports it; the content and wiring don't exist.

5. **Operational UX is poor.** Tenants have no mechanism to know what they owe, what was paid, when inspections are coming, how maintenance is progressing, or when their lease state has changed. The portal (BUILD_49) addresses some of this for tenants who activate it, but the portal invite is manual.

6. **Arrears escalation breaks at the legal boundary.** The informal reminder fires; the formal legal letters never do. The worst failure mode: agents assume the system is progressing the case while it's stuck at step 1.

---

## 2 · Design principles

| # | Principle | Operational meaning |
|---|-----------|---------------------|
| 1 | **Informative, not spamming** | At most one outbound per topic per 48 hours. Bundle related information. Never send a notification where state hasn't actually changed. |
| 2 | **Audit-proof for Tribunal** | Every mandatory comm stores full body text, template version, triggering event, delivery status, retry history. Immutable. |
| 3 | **Mandatory overrides preferences** | Legally required notifications ignore `communication_preferences`. Non-mandatory respect opt-out. Existing `is_mandatory` flag in `template-registry.ts` is the source of truth. |
| 4 | **WhatsApp first, SMS as backup** | Every tenant-facing moment with non-email options prefers WhatsApp (when consent + CS-window or approved template allow). SMS only fires as fallback if WhatsApp is unavailable for the recipient OR the tenant has explicitly set SMS as preference. Email is primary for detail/receipts/legal text. |
| 5 | **Tone-variant architecture** | Each relational template key has three concrete variants (friendly / professional / firm). Transactional and legal-mandatory template keys have a single voice. Tone selected at send time from org `tone_tenant`; tenant-level override supported (ADDENDUM flagged). |
| 6 | **Event-driven over cron where possible** | State changes that warrant a comm fire the comm inline at the state-change call site. Cron is reserved for date-keyed events (expiry countdowns, monthly statements, inspection reminders at T-24h). |
| 7 | **Delivery, not send, is the guarantee** | `communication_log.status` reflects delivery confirmation from the provider via webhook, not just the fact that the send was attempted. |
| 8 | **Retry mandatory comms until delivered or surrender** | A mandatory comm that fails to deliver is retried with exponential backoff across fallback channels. Surrender after N attempts must fail visibly (agent dashboard), never silently. |
| 9 | **Content is a snapshot, not a reference** | The body stored in `communication_log.body_full` is what was actually sent, after variable substitution. Template version hash captured alongside. Template edits don't retroactively rewrite history. |

---

## 3 · Canonical tenant contact-moment matrix

The authoritative list of every tenant-facing automated communication after BUILD_63 ships. Columns: trigger type (E=event / C=cron), channel priority (first-attempt order; fallback cascade documented in §5), legal status (M=mandatory / R=recommended / O=operational), tone profile (T=transactional, single voice / R=relational, three tone variants / L=legal, fixed formal voice), primary template key.

**Channel legend:** W=WhatsApp, S=SMS (backup), E=email.

### 3.1 Financial lifecycle

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| F1 | Monthly rent invoice issued | E (on `rent_invoice.insert`) | E, W | O | T | `rent.invoice_issued` (new) |
| F2 | Rent payment received + allocated | E (on `payment.allocated` if lease-linked) | E, W | R | T | `rent.payment_received` (new) |
| F3 | Monthly statement of account | C (monthly, date per §13) | E | O | T | `rent.monthly_statement` (new) |
| F4 | Deposit received + allocated | E (on `deposit_payment.allocated`) | E, W | R (RHA s5(2)) | T | `deposit.received` (exists, unwired) |
| F5 | Deposit interest statement (annual + on move-out) | C + E | E | R (RHA s5(3)(c)) | T | `deposit.interest_statement` (new) |

### 3.2 Arrears escalation

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| A1 | Arrears step 1 — informal reminder | C (existing, rewired) | W → S | O | R | `arrears.reminder_step1` (new, per-step copy) |
| A2 | Arrears step 2 — 10-day follow-up | C (new code path) | W → S, E (summary) | O | R | `arrears.reminder_step2` (new) |
| A3 | Arrears step 3 — formal letter of demand | C (new code path) | **E** + W (formal notice framing) | **M** | L | `arrears.letter_of_demand` (exists, unwired) |
| A4 | Arrears step 4 — final pre-cancellation notice | C (new code path) | **E** + W (formal notice framing) | **M** | L | `arrears.final_notice` (exists, unwired) |
| A5 | Arrears arrangement confirmed | E (on `arrears_case.arrangement_confirmed`) | E, W | R | T | `arrears.arrangement_confirm` (exists, unwired) |
| A6 | Arrears payment received (case balance reducing) | E (on balance update within active case) | E, W | O | T | `arrears.payment_received` (exists, unwired) |
| A7 | Arrears case resolved (fully paid) | E (on `arrears_case.resolved`) | E, W | O | T | `arrears.resolved` (new) |

**A1 migration note:** the current cron hardcodes `sendSMS()` with a fixed one-liner. Phase 2 rewires through the channel router (§5) and introduces step-bound copy per tone variant.

### 3.3 Lease lifecycle

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| L1 | Lease sent to tenant for signing | E (on `lease.status='sent'`) | E | O | T | `lease.created` (exists, unwired) |
| L2 | Lease signing reminder (T+3 unsigned) | C (daily) | W, E | O | R | `lease.sign_reminder` (exists, unwired) |
| L3 | Lease fully signed | E (on `lease.status='signed'`) | E | O | T | `lease.signed` (exists, unwired) |
| L4 | Lease activated | E (on `lease.status='active'`) | E | O | T | `lease.activated` (exists, unwired) |
| L5 | Welcome pack (tenant) | E (on activation) | E | O | T | `reports.tenant_welcome_pack` (exists, fires per BUILD_54) |
| L6 | Lease amended mid-term (charges added/removed) | E (on `lease_charges` insert/update) | E | R | T | `lease.amended` (new) |
| L7 | Annual escalation notification (T-30 before escalation date) | C (daily) | E, W | R | T | `lease.escalation_notice` (new) |
| L8 | CPA s14 renewal notice (T-40 to T-80 business days) | C (existing) | E | **M** (CPA s14) | L | `lease.renewal_notice` (fires) |
| L9 | Lease expiry reminder (T-30 days) | C (daily) | E, W | **M** | L | `lease.expiry_reminder` (exists, unwired) |
| L10 | Tenant notice-to-vacate acknowledgement | E (on tenant-originated notice captured) | E | R (evidentiary) | T | `lease.notice_acknowledged` (new) |
| L11 | Lease terminated | E (on `lease.status='terminated'`) | E | **M** | L | `lease.terminated` (exists, unwired) |

### 3.4 Inspection lifecycle

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| I1 | Inspection scheduled | E (on `inspection.insert`) | E, W | **M** for move-in/move-out | R | `inspection.scheduled` (exists, unwired) |
| I2 | Inspection reminder (T-24h) | C (daily) | W, S (backup) | R | R | `inspection.reminder` (exists, unwired) |
| I3 | Inspection rescheduled | E (on `inspection.scheduled_date` update) | W, E | R | R | `inspection.rescheduled` (new) |
| I4 | Move-in inspection report | E (on move-in inspection `complete`) | E | **M** (RHA s5(3)(e)) | L | `inspection.move_in_report` (new) |
| I5 | Interim / periodic inspection report | E (on non-move inspection completion) | E | R | T | `inspection.report_ready` (exists, unwired) |
| I6 | Move-out inspection report + dispute window | E (on move-out completion) | E | **M** (RHA s5(3)(g)) | L | `inspection.dispute_window` (exists, unwired) |

### 3.5 Maintenance lifecycle

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| M1 | Maintenance request logged (tenant-submitted) | E (on `maintenance_request.insert` where `source='tenant'`) | W, E | O | T | `maintenance.logged_tenant` (exists, unwired) |
| M2 | Contractor assigned | E (on `contractor_id` update) | W, E | O | T | `maintenance.assigned` (exists, unwired) |
| M3 | Appointment scheduled | E (on `scheduled_at` update) | W, S (backup), E | O | T | `maintenance.scheduled` (exists, unwired) |
| M4 | Work completed | E (on `status='complete'`) | E, W | O | T | `maintenance.completed` (exists, unwired) |
| M5 | Emergency / habitability critical | E (on AI triage severity=critical OR manual escalation) | **W + E + S (all three, parallel)** | **M** (habitability duty) | L | `maintenance.emergency` (exists, unwired) |
| M6 | Delay notification (contractor or tenant re-schedule) | E (on `maintenance_delay_event.insert`) | W, E | O | R | `maintenance.delay` (new) |

### 3.6 Deposit lifecycle (move-out)

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| D1 | Pre-move-out inspection arranged (T-15 days) | C (daily) + manual | E, W | R | R | `deposit.pre_moveout_inspection` (new) |
| D2 | Itemised deduction schedule | E (on deposit case `status='deductions_proposed'`) | E | **M** (RHA s5(7), within 21 days) | L | `deposit.return_schedule` (exists, unwired) |
| D3 | Deposit refunded (full or balance) | E (on deposit case `status='refunded'`) | E | **M** (RHA s5(3)(g)) | L | `deposit.returned` (exists, unwired) |
| D4 | Deposit dispute resolution | E (on dispute flow state change) | E | R | T | `deposit.dispute_resolution` (new) |

### 3.7 Portal

| # | Moment | Trigger | Channels | Legal | Tone | Template |
|---|--------|---------|----------|-------|------|----------|
| P1 | Portal invite (auto on lease activation if tenant has email + consent) | E (on lease active) | E | O | T | `portal.tenant_invite` (exists — **upgrade to auto-trigger**) |
| P2 | Portal invite reminder (T+7 if not accepted) | C (daily) | W, S (backup) | O | R | `portal.invite_reminder` (new) |
| P3 | Portal access revoked (on lease termination) | E (on lease terminate) | E | R | T | `portal.access_revoked` (new) |

---

## 4 · What's already in place vs what's new

### 4.1 Infrastructure that exists (don't rebuild)

- `communication_log` immutable-insert pattern with `template_key`, `channel`, `direction`, `status`, `external_id`, `triggered_by`.
- `template-registry.ts` with `is_mandatory` flag and category taxonomy.
- `lib/comms/send-email.ts` pipeline: template validation → preference check (mandatory bypass) → render → Resend → log.
- `lib/comms/preferences.ts` communication preference enforcement.
- `lib/sms/sendSMS.ts` via Africa's Talking — **retained as backup-only sender**.
- `lib/messaging/whatsapp/` (BUILD_58) — provider, `send.ts`, `sms-fallback.ts` helper, CS-window lookup (`getActiveCsWindow`), `tenant_messaging_consent` gating, `messaging_usage` tracking, STOP-keyword consent withdrawal, `org_whatsapp_template_preferences` table.
- `arrears_sequences` / `arrears_sequence_steps` / `arrears_actions` schema (per-step action_type + tone + ai_draft).
- `rent_invoices` + `invoice-generate` cron.
- `inspections` lifecycle, `maintenance_requests` lifecycle.
- `deposit_cases`, `deposit_return_schedule` (BUILD_17).
- React Email layout + helpers (`lib/comms/templates/layout.tsx`).

### 4.2 What needs to be built

#### 4.2.1 Channel router (new)

A single routing layer that every call site uses instead of picking `sendEmail` / `sendSMS` / `sendWhatsApp` directly.

```
lib/messaging/router.ts
  routeAndSend({
    orgId, tenantId, templateKey, variables,
    channelsAllowed?: Array<'whatsapp' | 'sms' | 'email'>,    // defaults per template metadata
    forcePrimaryOnly?: boolean                                 // emergency SMS parallel-send opts out of cascade
  }): Promise<RoutingResult>
```

Router responsibilities:

1. Resolve the template's allowed channels from template metadata (§4.2.4).
2. Read tenant preferences: `tenants.preferred_contact`, `tenant_messaging_consent` for WhatsApp, phone validity for SMS, email bounce status.
3. Resolve org tone preference: `organisations.settings.preferences.tone_tenant`.
4. Pick the tone variant for the template (relational only; transactional/legal skip).
5. Attempt sends in the priority order until one succeeds OR (for mandatory) all fail → queue for retry.
6. Log each attempt to `communication_log` with `attempt_number` chaining.
7. For M5 (emergency), send to all available channels in parallel (bypasses cascade).

The router is the single choke point. Once it exists, the migration from direct `sendSMS()` calls to routed sends is mechanical.

#### 4.2.2 Schema additions (amend `010_platform_features.sql` per amend-forward rule)

```sql
-- ── BUILD_63 · Audit-grade communication trail ──────────────────────────────
ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS body_full                text,             -- FULL body, no truncation
                                                                      -- REQUIRED for is_mandatory templates
  ADD COLUMN IF NOT EXISTS template_version_hash    text,             -- SHA-256 of the rendered body at send time
  ADD COLUMN IF NOT EXISTS tone_variant             text CHECK (tone_variant IN ('friendly','professional','firm','n/a')),
  ADD COLUMN IF NOT EXISTS trigger_event_type       text,             -- 'arrears_action' | 'invoice_issued' | 'lease_state' | 'cron:*' | 'manual'
  ADD COLUMN IF NOT EXISTS trigger_event_id         uuid,             -- polymorphic FK (see trigger_event_type)
  ADD COLUMN IF NOT EXISTS attempt_number           integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS first_attempt_log_id     uuid REFERENCES communication_log(id),
  ADD COLUMN IF NOT EXISTS failed_reason_code       text;             -- machine-readable: 'hard_bounce' | 'soft_bounce' | 'suppressed' | 'provider_error' | 'rate_limit' | 'no_consent' | 'no_channel_available'

CREATE INDEX IF NOT EXISTS idx_comm_log_trigger    ON communication_log(trigger_event_type, trigger_event_id);
CREATE INDEX IF NOT EXISTS idx_comm_log_mandatory  ON communication_log(org_id, template_key)
  WHERE template_key IN (
    'arrears.letter_of_demand','arrears.final_notice',
    'lease.renewal_notice','lease.expiry_reminder','lease.terminated',
    'deposit.return_schedule','deposit.returned',
    'inspection.move_in_report','inspection.dispute_window',
    'maintenance.emergency'
  );

-- ── Delivery events (webhook-fed, one row per provider callback) ─
CREATE TABLE IF NOT EXISTS communication_delivery_events (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             uuid NOT NULL REFERENCES organisations(id),
  communication_log_id uuid NOT NULL REFERENCES communication_log(id),
  event_type         text NOT NULL CHECK (event_type IN (
                       'queued','sent','delivered','opened','clicked',
                       'bounced_hard','bounced_soft','complained','unsubscribed','failed'
                     )),
  provider           text NOT NULL CHECK (provider IN ('resend','africastalking_sms','africastalking_whatsapp')),
  provider_event_id  text,
  occurred_at        timestamptz NOT NULL,
  raw_payload        jsonb,
  received_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_comm_delivery_log    ON communication_delivery_events(communication_log_id);
CREATE INDEX IF NOT EXISTS idx_comm_delivery_org    ON communication_delivery_events(org_id, occurred_at DESC);

ALTER TABLE communication_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_delivery_read" ON communication_delivery_events
  FOR SELECT USING (org_id IN (
    SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
  ));
-- Service role inserts via webhook; no user-writable policy.

-- ── Mandatory-comm retry queue ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mandatory_comm_retries (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid NOT NULL REFERENCES organisations(id),
  communication_log_id uuid NOT NULL REFERENCES communication_log(id),
  template_key         text NOT NULL,
  recipient_snapshot   jsonb NOT NULL,       -- { tenant_id, email, phone, channels_tried[], tone_variant }
  attempt_count        integer NOT NULL DEFAULT 1,
  next_attempt_at      timestamptz NOT NULL,
  last_failure_reason  text,
  surrendered_at       timestamptz,
  surrender_reason     text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mandatory_retries_due
  ON mandatory_comm_retries(next_attempt_at)
  WHERE surrendered_at IS NULL;

-- ── WhatsApp Meta template variants ─────────────────────────────────────────
-- Maps Pleks template_key + tone to a Meta-approved template name.
-- When a tone variant is not yet approved, send falls back to professional.
CREATE TABLE IF NOT EXISTS whatsapp_template_variants (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key          text NOT NULL,                         -- matches template-registry.ts
  tone_variant          text NOT NULL CHECK (tone_variant IN ('friendly','professional','firm','n/a')),
  meta_template_name    text NOT NULL,
  language_code         text NOT NULL DEFAULT 'en_ZA',
  meta_approval_status  text NOT NULL DEFAULT 'pending'
                          CHECK (meta_approval_status IN ('pending','approved','rejected','paused')),
  approved_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_key, tone_variant, language_code)
);

CREATE INDEX IF NOT EXISTS idx_wa_variants_key
  ON whatsapp_template_variants(template_key, tone_variant)
  WHERE meta_approval_status = 'approved';
```

`whatsapp_template_variants` is platform-level (no `org_id`), seeded centrally by Pleks. Org-specific overrides remain in `org_whatsapp_template_preferences` (BUILD_58) which expresses opt-in/opt-out at org scope; variant content is platform-owned.

#### 4.2.3 Template registry additions

New keys added to `lib/comms/template-registry.ts`:

```
rent.invoice_issued              — email, non-mandatory, transactional
rent.payment_received            — email, non-mandatory, transactional
rent.monthly_statement           — email, non-mandatory, transactional
deposit.interest_statement       — email, non-mandatory, transactional
arrears.reminder_step1           — whatsapp/sms, non-mandatory, relational
arrears.reminder_step2           — whatsapp/sms/email, non-mandatory, relational
arrears.resolved                 — email, non-mandatory, transactional
lease.amended                    — email, non-mandatory, transactional
lease.escalation_notice          — email/whatsapp, non-mandatory, transactional
lease.notice_acknowledged        — email, non-mandatory, transactional
inspection.rescheduled           — whatsapp/email, non-mandatory, relational
inspection.move_in_report        — email, MANDATORY (RHA s5(3)(e)), legal
maintenance.delay                — whatsapp/email, non-mandatory, relational
deposit.pre_moveout_inspection   — email/whatsapp, non-mandatory, relational
deposit.dispute_resolution       — email, non-mandatory, transactional
portal.invite_reminder           — whatsapp/sms, non-mandatory, relational
portal.access_revoked            — email, non-mandatory, transactional
```

Registry metadata extended to carry `tone_profile: 'transactional' | 'relational' | 'legal'` and `allowed_channels: Array<'whatsapp' | 'sms' | 'email'>` so the router reads policy from one source.

#### 4.2.4 React Email components

Directory additions in `lib/comms/templates/tenant/`:

```
lib/comms/templates/
└─ tenant/                              (new)
   ├─ shared.tsx
   ├─ rent/                             (invoice_issued, payment_received, monthly_statement)
   ├─ arrears/                          (reminder_step1, reminder_step2, LOD, final_notice, arrangement_confirm, payment_received, resolved)
   ├─ lease/                            (created through terminated)
   ├─ inspection/                       (scheduled through dispute_window)
   ├─ maintenance/                      (logged through delay; emergency)
   ├─ deposit/                          (received, interest_statement, pre_moveout_inspection, return_schedule, returned, dispute_resolution)
   └─ portal/                           (tenant_invite, invite_reminder, access_revoked)
```

Relational templates ship three variant components each (friendly / professional / firm) following the firmness-prop pattern from `lib/comms/templates/info-requests/`. Transactional and legal ship one component each.

#### 4.2.5 Cron and webhook handlers

Cron:
- `tenant-comms/monthly-statement/route.ts` — monthly, date per §13
- `tenant-comms/inspection-reminder/route.ts` — daily, T-24h scan
- `tenant-comms/escalation-notice/route.ts` — daily, T-30 scan
- `tenant-comms/pre-moveout-inspection/route.ts` — daily, T-15 scan
- `tenant-comms/portal-invite-reminder/route.ts` — daily, T+7 scan on unaccepted invites
- `tenant-comms/mandatory-retry/route.ts` — every 6 hours, drains retry queue

Modified cron:
- `arrears-sequence/route.ts` — rewired to use router + step-bound copy

Webhook:
- `/api/webhooks/resend/route.ts` — Resend delivery events → `communication_delivery_events`
- `/api/webhooks/africastalking/delivery/route.ts` — SMS + WhatsApp delivery reports → `communication_delivery_events`

#### 4.2.6 Server action call-site modifications

Every state transition that warrants a comm fires via the router at the action site:

- `lib/actions/leases.ts` — `markAsSent`, `markAsSigned`, `activateLeaseCascade`, `markAsTerminated`, `recordTenantNotice`, `markAsAmended` (new)
- `lib/actions/maintenance/*` — state transitions
- `lib/actions/inspections/*` — state transitions
- `lib/actions/deposits/*` — state transitions
- `lib/actions/payments/*` — allocation → fire F2, F4
- `lib/actions/lease-charges.ts` — insert/update → fire L6

---

## 5 · Channel selection rules

Enforced inside `lib/messaging/router.ts`. These are the single source of truth; individual call sites do not make channel decisions.

### 5.1 Priority by purpose

| Purpose | Priority order | Rationale |
|---------|---------------|-----------|
| Legal / mandatory notice | email → whatsapp (formal-notice framing) → sms (summary only) → flag for post | Legal text needs a paper trail the tenant can reproduce. Email primary; WhatsApp/SMS reinforce reach. Post fallback manual. |
| Urgency / time-critical | whatsapp → sms (backup) → email | WhatsApp delivery + read receipts beat SMS reach in most SA contexts. SMS fires if WhatsApp unavailable. |
| Confirmation / receipt | email → whatsapp | Tenant may refer back; email archivable. |
| Reminder / nudge | whatsapp → sms (backup) | Low-friction channel. Email reserved for detail-heavy reminders (lease expiry). |
| Detail / statement | email only | Too much content for WhatsApp/SMS. |
| Emergency (M5) | whatsapp + sms + email (parallel) | Reach-first: every channel fires, no cascade. |

### 5.2 WhatsApp gating

- **Consent required.** Sends only when `tenant_messaging_consent.whatsapp_consent_given = true`. If no consent, WhatsApp is skipped and router moves to SMS.
- **CS window OR approved template.** Sends within an active customer-service window (inbound message in the last 24h) use free-form content. Sends outside the CS window require an approved Meta template referenced from `whatsapp_template_variants` with `meta_approval_status='approved'`. If no approved variant is available for the chosen tone, fall back to `professional` tone (if approved). If nothing approved at all, skip WhatsApp.
- **STOP keyword honoured.** Standing opt-outs from `tenant_messaging_consent` block proactive WhatsApp even if a template is approved.

### 5.3 SMS backup

SMS fires only when:
- WhatsApp was unavailable (no consent, no approved template for the tone, STOP'd, CS window closed with no template) AND
- The template's `allowed_channels` includes SMS.

SMS never fires for:
- Legal mandatory notices as primary (email is primary; SMS is summary-only supplement).
- Detail-heavy moments (statements, reports).

When SMS fires, body is truncated to fit 160 GSM-7 / 70 UCS-2 chars. A linting helper runs against SMS template content to flag overruns at registry load time (not at runtime).

### 5.4 Email

- **Primary channel for legal, detail, receipts.** Always the canonical send for mandatory templates.
- **Bounce tracking.** After a hard bounce (captured via Resend webhook), email is disabled for that recipient. Agent dashboard surfaces the flag. Non-mandatory email sends to bounced addresses are suppressed; mandatory sends trigger retry via alternate channels.

### 5.5 Tenant without email (edge case)

The platform is built around email login, so genuinely email-less adults are rare. The more common failure mode is bouncing email (typo, full inbox, changed provider). Both cases share the same handling path — the retry cascade (§7) covers bouncing email via the delivery-alert side channel; final surrender covers true email-less tenants via agent-handled manual dispatch.

No registered-post API integration is built. Every mandatory comm produces two render targets at send time — an email body (React Email) and a letterhead PDF (generalising the existing LOD letter-generation pattern to all mandatory templates). The PDF is attached to the outbound email automatically and also stored in Supabase storage, downloadable via the existing letter-download endpoint. On surrender, the agent dashboard surfaces the already-generated PDF for download; the agent prints, dispatches physically (registered post, hand-delivery, attorney courier), and marks `manually_dispatched` on the dashboard with optional evidence upload (tracking slip photo, acknowledgement receipt, attorney delivery confirmation). The manual-dispatch action writes a `communication_log` row with `trigger_event_type='manual_fallback'` referencing the surrendered original; evidence stored in Supabase storage, linked from the log row.

This pattern benefits tenants on the portal (§9) too: the same letterhead PDF is downloadable from `/portal/communications/{id}` so the tenant has a printable copy of any mandatory notice for their own records — small thing that carries outsized goodwill at move-out disputes where both sides want their own paper trail.

Non-mandatory for email-less tenants: WhatsApp only if consented, otherwise silent-fail and log suppressed (no agent surrender — not worth the overhead for optional comms).

### 5.6 Tenant preferences override

`tenants.preferred_contact ∈ {whatsapp, sms, email, call}` provides a per-tenant override on the default priority, subject to consent gating:

- `preferred_contact='sms'` elevates SMS above WhatsApp for non-mandatory templates. (Mandatory still use email primary.)
- `preferred_contact='email'` suppresses WhatsApp/SMS for non-mandatory except where a channel is legally required.
- `preferred_contact='call'` is a human signal to the agent, not a channel router target. System falls back to WhatsApp + email.

---

## 6 · Tone variant architecture

### 6.1 Three categories of template keys

| Category | Variants | Selection | Examples |
|----------|---------|-----------|----------|
| **Transactional** | 1 per channel | N/A — single voice | Payment receipt, invoice issued, lease activated, inspection report, deposit received |
| **Relational** | 3 per channel (friendly / professional / firm) | Org `tone_tenant` at send time | Arrears reminders, lease sign reminder, inspection reminder, maintenance delay, portal invite reminder |
| **Legal** | 1 per channel, fixed formal voice | N/A — voice dictated by the law | LOD, final notice, CPA s14 renewal, deposit deduction schedule, dispute window, termination, move-in report |

### 6.2 Per-channel variant mechanics

**Email (React Email components).** Relational templates ship three concrete component files per topic (e.g. `arrears/reminder-step1-friendly.tsx`, `.professional.tsx`, `.firm.tsx`). The router picks the component matching the resolved tone. Transactional / legal ship one file.

**WhatsApp (Meta-approved templates).** Each relational template key has up to three `whatsapp_template_variants` rows — one per tone — each referencing a distinct Meta-approved template. At send time the router resolves `(template_key, tone) → meta_template_name` and calls the provider. If the exact tone is not yet approved, fall back to `professional`. If `professional` isn't approved either, WhatsApp is skipped for that send and the router moves to SMS.

**SMS (plain text).** Relational templates ship three plain-text variants in the template source; router picks by tone. Transactional/legal ship one. SMS is backup-only for most templates so variant coverage is less critical than WhatsApp.

### 6.3 Tone resolution order

1. Tenant-level override (future ADDENDUM — not in Phase 1 scope): if `tenants.preferred_tone` is set, use it.
2. Org-level: `organisations.settings.preferences.tone_tenant` (`friendly` | `professional` | `firm`).
3. Default: `professional`.

### 6.4 Meta approval path (operational, not code)

- Each new relational template starts with professional variant submitted for approval.
- Once approved, friendly and firm variants submitted.
- Approval can take 1–48 hours; rejections require content adjustment.
- Rejections logged in `whatsapp_template_variants.meta_approval_status='rejected'`.
- The platform-owned variants seed is the single source; agency users do not author WhatsApp templates. `org_whatsapp_template_preferences` (BUILD_58) remains for org-level opt-out of specific templates if needed.

### 6.5 Rollout sequencing

- **Phase 2 (arrears)** ships with professional-tone variants on WhatsApp (rewiring the existing SMS cron). Friendly and firm variants follow as Meta approves them; the `tone_variant` column in communication_log captures what was actually sent each time.
- **Later phases** follow the same pattern: professional-first for each template, friendly/firm as content work progresses.
- **No phase blocks on all three variants being approved.** The router fall-back guarantees sends happen; content work happens in parallel.

---

## 7 · Retry cascade and delivery-alert side channel

A mandatory comm that fails delivery is not abandoned. The cascade gives four primary-channel attempts, inserts a delivery-alert side channel directing the tenant to a public read-only page, takes one final primary-channel attempt, and only then surrenders to agent.

### 7.1 Timing

| Step | Offset from T+0 | Action |
|------|-----------------|--------|
| Initial | T+0 | Primary channel send (per router priority) |
| Retry 1 | T+1h | Same primary channel |
| Retry 2 | T+6h | Same primary channel |
| Retry 3 | T+24h | Same primary channel |
| Delivery alert | T+24h + 1min | WhatsApp (or SMS fallback) to tenant: *"We tried to reach you about {topic}. The full notice is available here: {secure_url}"* |
| Retry 4 (final) | T+72h | Same primary channel — tenant may have updated email after seeing delivery alert |
| Surrender | T+72h + 1min | If still failed: agent-dashboard flag, manual dispatch workflow (§5.5) |

### 7.2 Delivery-alert mechanics

- New template key: `notice.delivery_fallback` (non-mandatory meta-notice, WhatsApp primary / SMS fallback, pre-approved Meta template, transactional category in Meta's taxonomy).
- Public read page: `app.pleks.co.za/public/notice/{token}` renders the full mandatory content via the same template used for the original send, branded with the agency, with a "mark as read" acknowledgement button and a countdown showing days remaining on the mandatory deadline (for deduction schedules, dispute windows, renewal notices). For tenants with an active portal account, the delivery-alert link prefers `app.pleks.co.za/login?redirect=/tenant/communications/{id}&via=delivery_alert` instead — the authenticated portal view is stronger evidence than an anonymous token view (§9.5).
- Page view is tracked as a `communication_delivery_events` row (`event_type='page_view'` for anonymous public-page views, `event_type='portal_view'` for authenticated portal views — see §9.4) keyed to the original send's `communication_log_id`. Public-page views are **evidentiary not dispositive**; portal-authenticated views are significantly stronger but still do not by themselves dictate a specific legal outcome.
- If the tenant clicks "mark as read," a confirmation row is written and the next primary-channel retry is skipped (tenant has confirmed receipt).
- Deep-link tokens are signed, time-limited, and single-use-extendable (the tenant can reopen the page during the mandatory deadline window, but tokens expire post-deadline).

### 7.3 Legal status of digital constructive notice

The Electronic Communications and Transactions Act (ECT Act 25 of 2002) recognises electronic service of data messages. s23 governs time and place of receipt. For mandatory RHA/CPA notices, the conservative position:

- **Primary-channel send with provider-confirmed delivery** = delivered (the gold standard).
- **Primary send undelivered + delivery-alert viewed by tenant on public page + "mark as read" clicked** = strong constructive notice, defensible at Tribunal.
- **Primary send undelivered + delivery-alert viewed, no click** = constructive notice with evidentiary weight but not ironclad.
- **Primary send undelivered + no delivery-alert engagement** = surrender path required; registered post or equivalent physical delivery becomes the audit anchor.

The spec implements the mechanics; the Tribunal-readiness of each path is ultimately an attorney call per case. The audit export (§8.4) surfaces the full delivery chain so the attorney has the facts.

### 7.4 Retry queue schema adjustments

`mandatory_comm_retries.attempt_count` caps at 4 (initial + 3 retries before delivery alert + 1 final retry). After attempt 4 the row is marked `surrendered_at=now()` with `surrender_reason='cascade_exhausted'`. The delivery-alert send itself does not count as an attempt on the retry counter — it's logged as its own `communication_log` row with `template_key='notice.delivery_fallback'` referencing the original's `first_attempt_log_id`.

---

## 8 · Mandatory-comm audit trail

### 8.1 What "audit-proof" requires

Every mandatory template key (per the matrix) writes a `communication_log` row with:

- `body_full` — the rendered body as dispatched. Not truncated.
- `template_version_hash` — SHA-256 of the rendered body.
- `tone_variant` — the tone applied, or `'n/a'` for transactional/legal.
- `trigger_event_type` + `trigger_event_id` — polymorphic FK to the causing event. For an LOD: `arrears_action`. For a deduction schedule: `deposit_case`.
- Recipient info (existing columns).
- `attempt_number` + `first_attempt_log_id` — retry chaining.
- `failed_reason_code` — structured on failure.

Coupled with `communication_delivery_events` rows keyed on `communication_log_id`, the full send-and-delivery chain is reproducible from the DB alone.

### 8.2 Immutability

Enforced by existing RLS (INSERT only; no UPDATE/DELETE from user roles). Delivery events + retry queue updates happen via service role.

### 8.3 Retention

- Mandatory comms: indefinite (RHA record-keeping + Prescription Act 15-year limitation period).
- Non-mandatory: 12 months post-lease-end per project non-negotiable, enforced by new `purge-comms` cron.

### 8.4 Export

`/api/legal/comm-export?lease_id={id}&format=pdf` — date-ordered Tribunal-ready PDF of every comm sent on a lease, with full body text, delivery status, retry history, **portal-view events, and a portal-login timeline appendix for the lease period** (see §9.6). Reuses PDF branding layer from BUILD_52. Doubles as a POPIA subject-access-request artifact — tenants can request their own export via the portal self-service flow (§9.7).

---

## 9 · Tenant portal as authenticated audit surface

The tenant portal (BUILD_49) is already the authenticated canonical surface for lease, payment, maintenance, and account data. BUILD_63 extends it with a communications view that surfaces every comm sent to the tenant, records portal logins as audit events, and nudges unread mandatory notices on every session. This turns routine portal activity into a delivery channel for mandatory comms and builds the strongest possible Tribunal evidence chain.

### 9.1 Portal communications page

New route: `/tenant/communications`

Reverse-chronological list of every `communication_log` row where `tenant_id = session.tenant.id` OR `contact_id = session.tenant.contact_id`. Each row displays:

- Category label (friendly translation of `template_key` — e.g. "Payment reminder," "Renewal notice," "Inspection scheduled," "Deduction schedule")
- Sent date + time
- Channel icon (email, WhatsApp, SMS)
- Delivery status badge (sent / delivered / read / bounced / manually dispatched)
- Mandatory badge (⚖) for `is_mandatory=true` templates
- Countdown pill on mandatories with deadlines (deduction schedule: 21-day RHA window; dispute window: 7 days; renewal notice: expiry date)

Tap/click opens `/tenant/communications/{id}`: full-page authenticated view showing `body_full` content, downloadable letterhead PDF (§5.5), delivery-chain timeline (queued → sent → delivered/failed → retries → delivery-alert → portal view), and an "I've read this" acknowledgement button for mandatory comms.

### 9.2 Portal login audit — dual-write to `auth_events` + `audit_log`

Every portal session creation writes TWO rows, one to each table. This is the reconciliation of BUILD_62 (`auth_events` is the canonical auth-security substrate) and BUILD_63 (Tribunal/POPIA evidence trail lives in `audit_log`). The two tables serve different consumers and have different retention policies, so dual-write is correct and not premature duplication.

**Write 1 — `auth_events` (BUILD_62 substrate, security telemetry, short retention):**

```
event_type:    'tenant_portal_login'       -- must be in BUILD_62 auth_events CHECK constraint
user_id:       tenant.user_id
aal:           'aal1' | 'aal2'              -- from Supabase session
auth_method:   'email_magic_link' | 'whatsapp_token' | 'sms_magic_link' | 'password' | 'passkey'
success:       true
device_fingerprint_id: uuid                 -- if device recognised (BUILD_62 §5.3)
ip_hash:       sha256(ip_address)
user_agent_category: 'mobile_safari' | 'desktop_chrome' | ...
session_id:    uuid                         -- LINK KEY to audit_log row
metadata:      { via?: string }             -- e.g. 'delivery_alert'
```

Consumed by: BUILD_62 step-up freshness check (§5.4), new-device detection (§5.3), risk signals (future ADDENDUM_62C).

**Write 2 — `audit_log` (BUILD_63 business trail, Tribunal/POPIA evidence, long retention):**

```
event_type:    'tenant_portal_login'
entity_type:   'tenant'
entity_id:     tenant.id
session_id:    uuid                         -- SAME value as auth_events.session_id
payload:
  auth_method:          'email_magic_link' | 'whatsapp_token' | 'sms_magic_link' | 'password' | 'passkey'
  ip_hash:              sha256(ip_address)
  user_agent_category:  'mobile_safari' | 'desktop_chrome' | ...
  token_used_id:        uuid | null          # magic-link token row if applicable
  via:                  string | null        # e.g. 'delivery_alert' from §7.2
  auth_event_id:        uuid                 # FK to the paired auth_events row
```

Consumed by: Tribunal export (§8.4 portal-login timeline appendix), tenant-side POPIA export (§9.7).

Why dual-write is right:

- **Retention divergence.** `auth_events` purges monthly (BUILD_62 §4.2). `audit_log` keeps business/legal records for the Prescription Act window. A Tribunal dispute three years post-eviction needs the login history; `auth_events` won't have it.
- **Consumer divergence.** `auth_events` feeds step-up logic reading the last 5–30 minutes of activity. `audit_log` feeds lease-period exports reading the last several years. Joining at query time would couple the two tables' lifecycles.
- **Failure mode divergence.** If `auth_events` insert fails (CHECK constraint mismatch, table missing pre-BUILD_62), the login still proceeds and `audit_log` still captures the evidentiary record. If `audit_log` insert fails, security telemetry still lands. Each table's availability is independent.

**Link key:** `session_id` is the same UUID in both rows. Generated at session-creation time, before either insert. Tribunal export (§8.4) reads `audit_log` as authoritative and can join to `auth_events` via `session_id` when step-up context is needed.

**Pre-BUILD_62 behaviour:** if BUILD_63 ships before BUILD_62 (not the planned order, but possible), the `auth_events` write must no-op gracefully. Wrap the insert in a try/catch that swallows "relation auth_events does not exist." `audit_log` write is unconditional.

Why hashed IP and categorical UA (same in both rows): raw IP is POPIA-sensitive and not justified by the audit purpose. Hashing preserves the ability to detect multiple sessions from the same origin (repeat access = corroborating evidence) without storing raw PII. Categorical UA is enough for Tribunal ("tenant accessed from mobile browser") without fingerprinting-adjacent full UA strings.

### 9.3 Unread mandatory notice surfacing on login

On every portal session creation, the portal dashboard checks for unread mandatory comms targeted at this tenant (`tenant_id` match, `is_mandatory=true`, no `portal_view` event yet). If any, a prominent banner surfaces on the dashboard:

> **You have {n} unread notice(s) that require your attention.** Review now →

This turns the tenant's ordinary portal activity (checking rent, logging maintenance) into a delivery channel for mandatory comms. A tenant who logs in for any reason sees the banner, and the subsequent view is audit-logged. The landlord's Tribunal position becomes: the tenant had {n} portal sessions during the relevant period, each of which surfaced the unread notice.

### 9.4 Schema additions

**`communication_delivery_events.event_type` extended** to include `portal_view`:

```sql
ALTER TABLE communication_delivery_events
  DROP CONSTRAINT communication_delivery_events_event_type_check;
ALTER TABLE communication_delivery_events
  ADD CONSTRAINT communication_delivery_events_event_type_check
    CHECK (event_type IN (
      'queued','sent','delivered','opened','clicked',
      'bounced_hard','bounced_soft','complained','unsubscribed','failed',
      'page_view',      -- anonymous public-notice-page view (§7)
      'portal_view'     -- authenticated tenant-portal view (§9)
    ));

ALTER TABLE communication_delivery_events
  DROP CONSTRAINT communication_delivery_events_provider_check;
ALTER TABLE communication_delivery_events
  ADD CONSTRAINT communication_delivery_events_provider_check
    CHECK (provider IN (
      'resend','africastalking_sms','africastalking_whatsapp',
      'pleks_portal'    -- portal_view events use this
    ));
```

**New RLS policy on `communication_log`** — the current `org_comms_read` policy is agent-side (via `user_orgs`). Tenants need read access to their own comms:

```sql
CREATE POLICY "tenant_read_own_comms" ON communication_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT uot.tenant_id FROM user_orgs_tenants uot
      WHERE uot.user_id = auth.uid()
    )
    OR contact_id IN (
      SELECT t.contact_id FROM tenants t
      JOIN user_orgs_tenants uot ON uot.tenant_id = t.id
      WHERE uot.user_id = auth.uid()
    )
  );
```

The policy is read-only. Tenants cannot insert, update, or delete comm log rows — the log is immutable from their side as it is from the agent's.

### 9.5 Delivery-alert integration

When the delivery-alert fires (§7.2), the link target is chosen based on tenant portal status:

- **Tenant has active portal account** (`user_orgs_tenants` row exists, portal not revoked) → deep link to `app.pleks.co.za/login?redirect=/tenant/communications/{id}&via=delivery_alert`. The tenant authenticates via the central login gateway (role-resolution sets active_role=tenant; see ADDENDUM_61B), lands directly on the comm, and the resulting `portal_view` event is written with stronger evidentiary weight than an anonymous page view.
- **No portal account yet** → anonymous `app.pleks.co.za/public/notice/{token}` with `page_view` tracking.

The `via=delivery_alert` parameter is captured in the portal-login audit's `payload.via` field so the Tribunal export can reconstruct the chain: *"primary send failed → retries failed → delivery alert sent via WhatsApp → tenant authenticated to portal via delivery alert → tenant viewed notice."*

### 9.6 Tribunal export extension

The PDF export (§8.4) now includes, per mandatory comm:

- Delivery-chain section extended with any `portal_view` events (timestamp, auth method used for the session, session id).
- New appendix at end of the PDF: **portal-login timeline** listing every session creation during the lease period, with method, timestamp, hashed IP, UA category, and a flag indicating which sessions touched the communications page or specific mandatory comms.

This is the single most significant Tribunal evidence upgrade in BUILD_63. The landlord's position moves from *"notice was delivered"* (which is sometimes contestable) to *"tenant was actively using the portal during this period, the notice was surfaced on their dashboard, and the logs show when and how they engaged with it."*

### 9.7 Tenant-side POPIA export

Tenants can self-serve their own communications export from the portal at `/tenant/account/data-export` — POPIA s23 (data subject access). Generates the same PDF but scoped to the tenant's own records only. Acts as a safety-valve for tenants who want their comms history without asking the agency.

---

## 10 · Implementation phases

Sized to ship independently. No big-bang dependency.

### Phase 1 — Channel router + audit foundation

The keystone phase. Everything downstream depends on it.

- `lib/messaging/router.ts` implementation
- Schema migration (§4.2.2) — includes §9.4 additions (`portal_view` event type, `pleks_portal` provider, `tenant_read_own_comms` RLS policy)
- `whatsapp_template_variants` seeded (empty rows, ready for Meta-approval imports)
- Webhook endpoints (Resend + Africa's Talking delivery)
- `/api/legal/comm-export` endpoint with portal-view + portal-login timeline extensions (§9.6)
- `tenant-comms/mandatory-retry/route.ts` cron
- Portal login audit writes in existing `getTenantSession()` path (§9.2)
- `sendEmail`/`sendSMS`/`sendWhatsApp` extended to write `body_full`, `template_version_hash`, `tone_variant` when called through the router
- Every mandatory template gains a letterhead PDF render target (generalising the LOD letter pattern — §5.5)

Acceptance: existing sends (legacy arrears SMS, CPA s14, portal invite) continue to fire; new audit columns populated on all future sends; webhooks landing delivery events; portal sessions writing audit_log entries.

### Phase 2 — Arrears completion + SMS→WhatsApp migration

Highest legal risk. Ships immediately after Phase 1.

- `arrears-sequence` cron rewritten: resolves step → template_key → tone variant → router call. No more hardcoded SMS.
- Per-step content written across three tones for A1/A2 (relational) and single formal voice for A3/A4 (legal).
- `arrears.letter_of_demand` (mandatory) and `arrears.final_notice` (mandatory) wired via email primary + WhatsApp formal-notice backup.
- Event-fired: `arrears.arrangement_confirm`, `arrears.payment_received`, `arrears.resolved`.
- Professional-tone WhatsApp variants submitted to Meta first; friendly/firm follow.

### Phase 3 — Deposit lifecycle completion

- Wire `deposit.received` (F4) from payment allocation action.
- Wire `deposit.return_schedule` (D2, mandatory) from deposit case state.
- Wire `deposit.returned` (D3, mandatory) from refund action.
- Add deposit interest statement (F5) — annual + move-out triggers.
- Pre-move-out inspection reminder cron (D1).

### Phase 4 — Inspection lifecycle

- Wire I1–I6 from action sites and T-24h cron.
- Move-in report (I4, mandatory) — new template content.
- Dispute window (I6, mandatory) — existing template, wire trigger.

### Phase 5 — Lease lifecycle

- Wire L1–L11 from action sites and daily cron.
- Portal auto-invite on activation (P1).
- New templates: `lease.amended`, `lease.escalation_notice`, `lease.notice_acknowledged`.

### Phase 6 — Maintenance lifecycle

- Wire M1–M6 from action sites.
- Emergency (M5, mandatory) — parallel multi-channel.
- New template: `maintenance.delay`.

### Phase 7 — Financial operational (non-DebiCheck)

- Rent invoice emailed on issue (F1).
- Payment receipt on allocation (F2).
- Monthly statement cron (F3).

### Phase 8 — Polish, retry dashboard, surrender surfacing, portal comms

- Agent dashboard widget for surrendered mandatory comms requiring manual dispatch (with the pre-generated letterhead PDF available for download per §5.5).
- Per-tenant comms history view on agent side.
- **Tenant portal `/tenant/communications` list page** (§9.1).
- **Tenant portal `/tenant/communications/{id}` detail page** with full body, letterhead PDF download, delivery-chain timeline, and "I've read this" acknowledgement (§9.1).
- **Unread mandatory notice banner** on portal dashboard (§9.3).
- **Tenant-side POPIA export** at `/tenant/account/data-export` (§9.7).
- Delivery-alert link preference logic: portal deep-link for portal-enabled tenants; anonymous public-notice page otherwise (§9.5).

---

## 11 · Frequency and bundling rules

Enforced in the router (new: `lib/messaging/frequency.ts`), not per-template.

| Topic group | Max outbound per 48h | Bundling |
|-------------|----------------------|----------|
| Arrears | 1 | Step-sequenced (step 1 → step 2 → LOD → final). Cannot skip steps. |
| Inspection | 2 (scheduled + T-24h reminder) | Rescheduled replaces the scheduled notification, not in addition. |
| Maintenance | 1 per state change | Internal progress updates (e.g. contractor ETA) not fired; only state transitions. |
| Lease | 1 per day | Renewal, expiry, escalation can cluster near term-end — router deduplicates. |
| Monthly statement | 1 per month | All financial activity for the month bundled. |
| Portal | 1 invite + 1 reminder | After reminder, silence until agent re-invites manually. |

Cross-topic: two different topic groups on the same day both send. No cross-topic throttling.

---

## 12 · Out of scope

### 12.1 DebiCheck communications — **deferred**

DebiCheck collections (F3/F4/F5 in earlier drafts of this spec) are deferred until the platform has a proven client base and is operationally healthy. Per Stéan: the unit economics and operational load of running DebiCheck mandates at low volume are not viable pre-PMF. The mandates framework (BUILD_10) stays in the codebase; tenant-facing comms around collection attempts, successes, and failures are not wired in Phase 1.

When DebiCheck is switched back on, a follow-up addendum (tentative: ADDENDUM_63A_DEBICHECK_COMMS) covers:

- `debicheck.pre_notification` (T-2 business days, SMS/WhatsApp)
- `debicheck.collection_success` (email/WhatsApp)
- `debicheck.collection_failed` (SMS/WhatsApp/email, urgent)
- Peach webhook extension for delivery-event capture

BUILD_63 leaves no hooks for these — when DebiCheck comms go live, they can slot in without schema changes (the router and retry infrastructure accommodate any new template key).

### 12.2 Bulk announcement / broadcast

Agencies sending "the pool will be closed Thursday" to all tenants of a property. Needs its own spec: approval flow, unsubscribe handling, per-recipient frequency caps. Future BUILD.

### 12.3 Two-way WhatsApp conversation

Agent-side inbox for tenants replying to WhatsApp notifications. BUILD_58 ships inbound path; agent UI is separate scope.

### 12.4 Owner / broker / scheme comms

Owner statements (BUILD_08), owner info requests (BUILD_60), broker and scheme notifications (BUILD_59 + BUILD_60) are separate tracks. BUILD_63 is tenant-only.

### 12.5 Language localisation

Phase 1 is English-only. Afrikaans / isiZulu / isiXhosa variants deferred. Architecture supports it (`whatsapp_template_variants.language_code` exists; email components can be namespaced by locale) — not shipped now.

### 12.6 Tenant-level tone preference

§6.3 step 1 is flagged but not implemented in Phase 1. Tenant-level override lands in a future addendum if needed.

### 12.7 Comm cost tracking per org

Per-message cost attribution for tier billing. `messaging_usage` (BUILD_58) provides hooks; agent-facing reporting is out of scope here.

---

## 13 · Risks

### R1 · Resend / Africa's Talking webhook configuration

If webhooks don't land, `communication_delivery_events` stays empty and the retry queue can't distinguish "sent but not delivered" from "sent and delivered." Mitigation: the retry cron treats the absence of a `delivered` event within 30 minutes as failure for mandatory comms. False-positive retries (double-sending) are strictly better than false-negative silent failures on legal notices.

### R2 · State-change storms

A bulk lease migration (TPN import) could state-change 200 leases to `active` in a minute, firing 200 welcome packs + 200 portal invites simultaneously. Mitigation: event handlers are idempotent and rate-limited per org (30 sends/minute default). Imports set `suppress_notifications=true` to skip event comms.

### R3 · Mandatory comm surrender

A tenant with bouncing email, no phone, no WhatsApp consent. The retry queue exhausts after N attempts and surrenders. Silent surrender is the worst case. Mitigation: dashboard widget surfaces surrendered mandatories with a "mark manually dispatched" action recording the manual step in `communication_log` for audit continuity.

### R4 · Meta template approval delays

A newly-added relational template that hasn't had its WhatsApp variants approved will fall back to SMS/email until Meta approves. Not a bug — the tone_variant field records what actually went out — but it's a visible quality dip if a significant approval queue builds up. Mitigation: professional-tone variants submitted first so SOMETHING WhatsApp-capable exists for every relational key.

### R5 · Template source drift vs audit snapshot

An org (or Pleks) edits a template after a comm is sent. Template source changes; stored `body_full` + `template_version_hash` do not. Tribunal export shows what was actually sent. Mitigation: hash is non-reversible; we never claim to re-render past sends from current templates.

### R6 · Legacy SMS call sites missed in the migration

The codebase has `sendSMS()` calls outside `arrears-sequence` (per Stéan's note). Phase 2 rewires arrears; later phases encounter SMS legacy elsewhere. Mitigation: a grep-and-migrate pass in each phase, with an acceptance criterion that no new phase ships direct `sendSMS()` calls — every SMS goes through the router.

### R7 · Resend free-tier exhaustion at month-end

Monthly statement cron + rent invoice cron + arrears acceleration → high outbound volume. Resend free tier is 3000/month; paid tier starts at 50k. Need paid tier before Phase 7. Webhook ordering is not guaranteed — delivery-event handlers must be idempotent.

### R8 · WhatsApp template cost per message

Meta charges per conversation once outside the 24-hour CS window. Template-initiated conversations have a fee (authentication, utility, marketing categories priced differently). At low volume negligible, but worth watching as tenant counts grow. `messaging_usage` captures this; billing attribution is future scope (§12.7).

---

## 14 · Acceptance criteria

- [ ] Every template key in `template-registry.ts` categories {arrears, deposits, inspections, leases, maintenance, portal, rent} has an automated code path that fires it. No "registered but unwired" state.
- [ ] Every mandatory template writes `body_full` and `template_version_hash` to `communication_log`.
- [ ] Every mandatory template generates a letterhead PDF at send time, attached to the outbound email and stored for download.
- [ ] `/api/legal/comm-export?lease_id={id}&format=pdf` produces a Tribunal-ready PDF for any active or historical lease, including portal-view events and portal-login timeline appendix.
- [ ] Webhook endpoints for Resend and Africa's Talking write to `communication_delivery_events` within 5 seconds of provider callback.
- [ ] Mandatory-comm retry cron drains the queue with the documented cascade (1h/6h/24h + delivery alert + 72h) and surrenders with dashboard surfacing.
- [ ] Arrears sequence fires per-step email/WhatsApp/SMS based on step `action_type`, not hardcoded SMS.
- [ ] No direct `sendSMS()` call remains outside `lib/messaging/router.ts` and `lib/messaging/whatsapp/sms-fallback.ts`.
- [ ] Router channel cascade: WhatsApp → SMS → email for non-mandatory urgent; email → WhatsApp (formal) → SMS (summary) for mandatory.
- [ ] WhatsApp sends only fire for recipients with consent + (CS window OR approved template variant).
- [ ] When a requested tone variant is not approved on WhatsApp, send falls back to professional variant; when nothing approved, WhatsApp is skipped and SMS attempts.
- [ ] A lease activation fires `lease.activated`, welcome pack, and portal invite within 60 seconds (unless `suppress_notifications=true`).
- [ ] Bulk imports set `suppress_notifications=true`; no event-driven comm fires for imported records unless the agent explicitly opts into portal invites.
- [ ] A move-out inspection completion fires `inspection.dispute_window` with the 7-day RHA notice.
- [ ] A deposit deduction case transitioning to `deductions_proposed` fires the itemised schedule email within 1 hour.
- [ ] Frequency limits enforced: no tenant receives more than 1 arrears outbound per 48 hours.
- [ ] Monthly statement fires for every active lease on the org's configured statement day.
- [ ] POPIA purge policy honours mandatory-retention override.
- [ ] No non-mandatory comm sends to a hard-bounced email address.
- [ ] Dashboard surfaces surrendered mandatory comms with a "mark manually dispatched" action.
- [ ] `tone_variant` column populated on every `communication_log` row matching the tone actually applied.
- [ ] `/tenant/communications` lists every comm addressed to the session tenant with category, channel, status, mandatory badge, and deadline countdown where applicable.
- [ ] `/tenant/communications/{id}` shows full `body_full`, letterhead PDF download, delivery-chain timeline, and "I've read this" acknowledgement for mandatories.
- [ ] Every portal session creation writes TWO rows: one `auth_events` row (BUILD_62 substrate) and one `audit_log` row (Tribunal evidence), linked by `session_id`. See §9.2 for dual-write rationale.
- [ ] Unread mandatory notice banner fires on the portal dashboard when `is_mandatory=true` comms exist without `portal_view` events for the tenant.
- [ ] Delivery-alert link targets authenticated `app.pleks.co.za/login?redirect=/tenant/communications/{id}&via=delivery_alert` for portal-enabled tenants; anonymous `app.pleks.co.za/public/notice/{token}` otherwise.
- [ ] `portal_view` events in `communication_delivery_events` short-circuit remaining retries on the originating comm.
- [ ] Tenant-side POPIA export available at `/tenant/account/data-export`.

---

## 15 · Resolved decisions

All open decisions from the prior drafts are now resolved. Recorded here for reference; spec sections above reflect these choices.

1. **Monthly statement date** — per-org configurable setting, not a platform default. New field `organisations.settings.preferences.monthly_statement_day` (integer 1–28, default `3`). Configured via `/settings/configuration` UI (ADDENDUM_57E's config page). The `tenant-comms/monthly-statement` cron reads this per org and fires on each org's chosen day.
2. **Post fallback for no-email tenants** — no API integration. Every mandatory comm produces a letterhead PDF at send time (generalising the existing LOD letter-generation pattern to all mandatory templates). PDF is attached to outbound email AND stored for download via the existing letter-download endpoint. On surrender, agent downloads the already-generated PDF, dispatches physically, marks `manually_dispatched` with optional evidence upload. Retry cascade with delivery-alert side channel (§7) keeps most cases out of the surrender bucket; tenant portal (§9) provides a further delivery channel for portal-enabled tenants.
3. **Portal auto-invite on activation** — auto when tenant has email + POPIA consent. Silence otherwise.
4. **Bulk import suppression** — full suppression of event-driven comms on imported leases. Imports set `suppress_notifications=true` on the lease row (or pass it to the activation action) and event handlers skip. Import wizard final step offers a tickbox *"Also send portal invites to imported tenants? (off by default)"* for agencies who want to onboard tenants to the portal as part of the import. No other event-driven comms fire for imported records.
5. **Retry cascade** — T+1h, T+6h, T+24h on primary channel; delivery-alert side channel at T+24h+1min; final primary retry at T+72h; surrender at T+72h+1min if still failed. Documented in full at §7.
6. **Phase ordering** — Phase 1 (channel router + audit foundation + portal audit schema) before Phase 2 (arrears completion). Confirmed.
7. **Tenant-level tone override** — deferred. Org-level `tone_tenant` is sufficient granularity for Phase 1. Per-tenant voice selection within an org (e.g., firm-tier agency wanting friendly voice for one tenant and firm for another) adds complexity without evidenced demand. Add only if a production customer specifically asks.
8. **Meta template ownership** — platform-owned in v1 (Pleks submits templates to Meta; agencies consume them). Firm-tier WABA ownership (agencies running their own WhatsApp Business Account with their own template authoring) deferred to v2 — explicitly noted as a future feature, not a Phase 1 gap.
9. **Tenant portal comms surface** — full integration in scope. Portal lists every comm targeted at the tenant, shows full body + letterhead PDF + delivery chain per comm, surfaces unread mandatory notices on dashboard, audit-logs every portal session with auth method + hashed IP, extends Tribunal export with portal-view events and portal-login timeline. RLS policy added to `communication_log` so tenants can read their own comms without service-role queries. Delivery-alert side channel prefers authenticated portal deep-link over anonymous public page for portal-enabled tenants.
