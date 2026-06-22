-- ═══════════════════════════════════════════════════════════════════════════════
-- 011_documents_messaging.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Documents, templates, signatures, messaging (email / SMS / WhatsApp), and
-- the storage buckets that hold their artefacts.
--
-- This file absorbs:
--   • 57E Templates, Signatures, Document Editor & Messaging
--   • BUILD_58 WhatsApp Business API integration
--   • Storage buckets for signatures, lease templates, property documents
--   • Path-scoped storage RLS policies
--   • lease_documents vault
--   • communication_log delivery-tracking & polymorphic reference columns
--
-- AMEND-FORWARD RULE: new document types, template system features, messaging
-- channels (future: Telegram, Signal, in-app), new storage buckets for
-- generated artefacts — all go as a new §N section at the bottom of this file.
--
-- Fully idempotent — safe to re-run on any DB state.
-- ═══════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════
-- §1  ORGANISATION DOCUMENT BRANDING & CUSTOM LEASE METADATA
-- ═══════════════════════════════════════════════════════════════════════════════
-- Note: custom_template_path and custom_template_active are defined in
-- 001_foundation.sql (as part of the lease customisation fields).  The
-- additional companion columns below track filename and upload timestamp
-- for the templates UI (57E).

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS eaab_ffc                    text,
  ADD COLUMN IF NOT EXISTS logo_path                   text,
  ADD COLUMN IF NOT EXISTS document_footer_text        text,
  ADD COLUMN IF NOT EXISTS document_primary_font       text DEFAULT 'inter',
  ADD COLUMN IF NOT EXISTS document_brand_colour       text DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS settings                    jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_template_filename    text,
  ADD COLUMN IF NOT EXISTS custom_template_uploaded_at timestamptz;

COMMENT ON COLUMN organisations.settings IS
  'Org-wide configuration defaults. Schema: { preferences_version, communication: { tone_tenant, tone_owner, managed_by_label, sms_fallback_enabled, sms_fallback_delay_hours } }';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §2  USER SIGNATURES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_signatures (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  org_id       uuid        NOT NULL REFERENCES organisations(id),
  storage_path text        NOT NULL,
  width_px     int,
  height_px    int,
  source       text        NOT NULL CHECK (source IN (
                             'qr_phone', 'mouse_desktop', 'uploaded_file', 'typed_name'
                           )),
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_ip   inet
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_signatures_active
  ON user_signatures(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_signatures_user
  ON user_signatures(user_id);

ALTER TABLE user_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own signatures" ON user_signatures;
CREATE POLICY "Users manage own signatures" ON user_signatures
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §3  SIGNATURE SIGN TOKENS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Short-lived tokens for the QR-phone signature capture flow.

CREATE TABLE IF NOT EXISTS signature_sign_tokens (
  token        text        PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  org_id       uuid        NOT NULL REFERENCES organisations(id),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_tokens_expires
  ON signature_sign_tokens(expires_at);

ALTER TABLE signature_sign_tokens ENABLE ROW LEVEL SECURITY;

-- Users can read their own tokens; no INSERT via client (server-side only)
DROP POLICY IF EXISTS "Users view own tokens" ON signature_sign_tokens;
CREATE POLICY "Users view own tokens" ON signature_sign_tokens
  FOR SELECT USING (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §4  DOCUMENT TEMPLATES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Unified table for letter, email, and WhatsApp templates.
-- scope = 'system' (platform-provided seeds, org_id NULL) or 'organisation'.
-- Meta approval columns track submission status for WhatsApp templates.

CREATE TABLE IF NOT EXISTS document_templates (
  id                              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                          uuid  REFERENCES organisations(id),  -- NULL for system scope
  scope                           text  NOT NULL CHECK (scope IN ('system', 'organisation')),
  template_type                   text  NOT NULL CHECK (template_type IN ('letter', 'email', 'whatsapp')),
  name                            text  NOT NULL,
  description                     text,
  category                        text  NOT NULL DEFAULT 'other',
  -- Body content
  body_html                       text,               -- letters + emails (HTML)
  body_json                       jsonb,              -- TipTap document JSON
  body_variants                   jsonb,              -- {friendly, professional, firm} for system templates
  subject                         text,               -- emails only
  whatsapp_header                 text,
  whatsapp_body                   text,               -- professional variant default
  whatsapp_footer                 text,
  -- Meta (WhatsApp Business) approval
  meta_template_id                text,
  meta_template_name              text,               -- human-readable id used by AT approval webhook
  meta_template_status            text  CHECK (meta_template_status IN ('pending', 'approved', 'rejected')),
  whatsapp_meta_variable_map      jsonb,
  whatsapp_meta_category          text  CHECK (whatsapp_meta_category IN ('utility', 'marketing', 'authentication')),
  whatsapp_meta_submitted_at      timestamptz,
  whatsapp_meta_approved_at       timestamptz,
  whatsapp_meta_rejection_reason  text,
  -- Metadata
  legal_flag                      text  CHECK (legal_flag IN ('wet_ink_only', 'aes_recommended')),
  merge_fields                    text[],
  usage_count                     int   NOT NULL DEFAULT 0,
  last_used_at                    timestamptz,
  is_deletable                    boolean NOT NULL DEFAULT true,
  created_by                      uuid  REFERENCES auth.users(id),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX        IF NOT EXISTS idx_document_templates_org        ON document_templates(org_id);
CREATE INDEX        IF NOT EXISTS idx_document_templates_scope_type ON document_templates(scope, template_type);
CREATE INDEX        IF NOT EXISTS idx_document_templates_category   ON document_templates(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_templates_meta_name
  ON document_templates(meta_template_name)
  WHERE meta_template_name IS NOT NULL;

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "System templates visible to all" ON document_templates;
CREATE POLICY "System templates visible to all" ON document_templates
  FOR SELECT USING (scope = 'system');

DROP POLICY IF EXISTS "Org templates visible to org members" ON document_templates;
CREATE POLICY "Org templates visible to org members" ON document_templates
  FOR SELECT USING (
    scope = 'organisation'
    AND org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Only admins modify org templates" ON document_templates;
CREATE POLICY "Only admins modify org templates" ON document_templates
  FOR ALL USING (
    scope = 'organisation'
    AND org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND is_admin = true
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §5  USER TEMPLATE FAVOURITES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_template_favourites (
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);

ALTER TABLE user_template_favourites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own favourites" ON user_template_favourites;
CREATE POLICY "Users manage own favourites" ON user_template_favourites
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §6  ORG WHATSAPP TEMPLATE PREFERENCES
-- ═══════════════════════════════════════════════════════════════════════════════
-- Per-org opt-in + tone variant selection for system WhatsApp templates.

CREATE TABLE IF NOT EXISTS org_whatsapp_template_preferences (
  org_id       uuid NOT NULL REFERENCES organisations(id),
  template_id  uuid NOT NULL REFERENCES document_templates(id),
  opted_in     boolean NOT NULL DEFAULT false,
  tone_variant text    NOT NULL DEFAULT 'professional'
               CHECK (tone_variant IN ('friendly', 'professional', 'firm')),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, template_id)
);

ALTER TABLE org_whatsapp_template_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins manage WA preferences" ON org_whatsapp_template_preferences;
CREATE POLICY "Org admins manage WA preferences" ON org_whatsapp_template_preferences
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND is_admin = true
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §7  DOCUMENT GENERATION JOBS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS document_generation_jobs (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid  NOT NULL REFERENCES organisations(id),
  user_id             uuid  NOT NULL REFERENCES auth.users(id),
  lease_id            uuid  REFERENCES leases(id),
  property_id         uuid  REFERENCES properties(id),
  template_id         uuid  REFERENCES document_templates(id),
  status              text  NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'generating', 'generated', 'sent', 'failed')),
  body_html           text  NOT NULL DEFAULT '',
  subject             text,
  recipient_email     text,
  recipient_name      text,
  generated_pdf_path  text,
  signature_id        uuid  REFERENCES user_signatures(id),
  delivery_method     text  CHECK (delivery_method IN ('email', 'download', 'draft')),
  resend_message_id   text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_gen_jobs_lease   ON document_generation_jobs(lease_id);
CREATE INDEX IF NOT EXISTS idx_doc_gen_jobs_user    ON document_generation_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_gen_jobs_status  ON document_generation_jobs(status);
CREATE INDEX IF NOT EXISTS idx_doc_gen_jobs_org     ON document_generation_jobs(org_id);

ALTER TABLE document_generation_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view org doc jobs" ON document_generation_jobs;
CREATE POLICY "Org members view org doc jobs" ON document_generation_jobs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users modify own doc jobs" ON document_generation_jobs;
CREATE POLICY "Users modify own doc jobs" ON document_generation_jobs
  FOR ALL USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §8  LEASE DOCUMENTS VAULT  (was 015_lease_documents.sql)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Permanent storage of PDFs associated with a lease: signed lease, welcome
-- packs, letters of demand, s14/s4 notices, tribunal submissions, statements,
-- inspection reports, amendments, and generated letters from §7 jobs.

CREATE TABLE IF NOT EXISTS lease_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organisations(id),
  lease_id        uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  doc_type        text NOT NULL CHECK (doc_type IN (
                    'signed_lease',
                    'welcome_pack_tenant',
                    'welcome_pack_landlord',
                    'lod',
                    's14_notice',
                    'section_4_notice',
                    'tribunal_submission',
                    'statement_tenant',
                    'statement_owner',
                    'inspection_report',
                    'amendment',
                    'generated_letter',
                    'other'
                  )),
  title             text NOT NULL,
  storage_path      text NOT NULL,
  file_size_bytes   bigint,
  generated_by      text,
  generation_job_id uuid REFERENCES document_generation_jobs(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_documents_lease ON lease_documents(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_org   ON lease_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_lease_documents_type  ON lease_documents(doc_type);

ALTER TABLE lease_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lease_docs_org_select" ON lease_documents;
CREATE POLICY "lease_docs_org_select" ON lease_documents
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_insert" ON lease_documents;
CREATE POLICY "lease_docs_org_insert" ON lease_documents
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_delete" ON lease_documents;
CREATE POLICY "lease_docs_org_delete" ON lease_documents
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL)
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §9  SYSTEM TEMPLATE SEEDS  (letters, emails, WhatsApp)
-- ═══════════════════════════════════════════════════════════════════════════════
-- 27 system templates (8 letters + 8 emails + 11 WhatsApp). Idempotent via
-- NOT EXISTS guard — re-running will not create duplicates.

-- ── 9a. Letter templates ──────────────────────────────────────────────────────
INSERT INTO document_templates (scope, template_type, name, description, category, body_html, merge_fields, legal_flag, is_deletable)
SELECT * FROM (VALUES
  (
    'system', 'letter', 'Letter of Demand',
    'Formal letter of demand for outstanding rent arrears.',
    'arrears_and_lod',
    '<p>Dear {{tenant.full_name}},</p><p>RE: LETTER OF DEMAND — ARREARS OF RENT</p><p>We refer to your lease agreement in respect of {{unit.number}}, {{property.name}} and write to advise that your rental account is in arrears of <strong>{{arrears.total}}</strong>.</p><p>TAKE NOTICE that demand is hereby made for payment of the full arrears amount of {{arrears.total}} within <strong>5 (five) business days</strong> of the date of this letter.</p><p>Should you fail to make payment or enter into a written payment arrangement within the stipulated period, we shall, without further notice, proceed to apply for your eviction in terms of the Prevention of Illegal Eviction from and Unlawful Occupation of Land Act 19 of 1998 (PIE Act), or pursue such other legal remedies as may be available.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{arrears.total}}','{{today}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'CPA s14 Auto-renewal Notice',
    'Notice required under CPA section 14 before fixed-term lease auto-renews.',
    'compliance',
    '<p>Dear {{tenant.full_name}},</p><p>RE: NOTICE IN TERMS OF SECTION 14 OF THE CONSUMER PROTECTION ACT 68 OF 2008 — AUTO-RENEWAL OF LEASE</p><p>We write to advise you that your fixed-term lease agreement in respect of {{unit.number}}, {{property.name}} is due to expire on <strong>{{lease.end_date}}</strong>.</p><p>In terms of section 14(2) of the Consumer Protection Act, you are hereby notified that unless you provide written notice of your intention to vacate at least <strong>20 (twenty) business days</strong> before {{lease.end_date}}, the lease will automatically renew on a month-to-month basis at the current rental rate of {{lease.rent_amount}} per month.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{lease.end_date}}','{{lease.rent_amount}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'Section 4 Eviction Notice',
    'Notice of eviction proceedings under PIE Act. Requires wet-ink signature.',
    'notices',
    '<p>Dear {{tenant.full_name}},</p><p>RE: NOTICE IN TERMS OF SECTION 4(2) OF THE PREVENTION OF ILLEGAL EVICTION FROM AND UNLAWFUL OCCUPATION OF LAND ACT 19 OF 1998 (PIE ACT)</p><p>TAKE NOTICE that the owner of {{unit.number}}, {{property.name}} intends to apply for an order for your eviction from the above premises.</p><p>The application will be made to the Magistrates Court on a date to be determined. You are entitled to appear and defend the application.</p><p>PLEASE NOTE: You have the right to legal representation. If you cannot afford an attorney, you may approach Legal Aid South Africa.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{today}}'],
    'wet_ink_only', false
  ),
  (
    'system', 'letter', 'Inspection Request',
    'Letter notifying tenant of a scheduled property inspection.',
    'inspections',
    '<p>Dear {{tenant.full_name}},</p><p>RE: PROPERTY INSPECTION — {{unit.number}}, {{property.name}}</p><p>We hereby provide notice of a routine property inspection to be conducted at the above-mentioned premises.</p><p>Please contact us to confirm a mutually convenient date and time. Reasonable notice will be provided in accordance with the terms of your lease agreement.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{agent.name}}','{{agent.phone}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'Rent Escalation Notice',
    'Formal notice of upcoming rent increase.',
    'notices',
    '<p>Dear {{tenant.full_name}},</p><p>RE: RENT ESCALATION NOTICE</p><p>We write to advise you that in accordance with the escalation clause contained in your lease agreement, your monthly rental will increase by <strong>{{lease.escalation_percent}}</strong> with effect from the next rental period.</p><p>Your new monthly rental will be <strong>{{lease.rent_amount}}</strong>.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{lease.escalation_percent}}','{{lease.rent_amount}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'Arrears Reminder',
    'First reminder for overdue rent. Friendly but direct.',
    'arrears_and_lod',
    '<p>Dear {{tenant.full_name}},</p><p>RE: OVERDUE RENTAL — {{unit.number}}, {{property.name}}</p><p>We write to bring to your attention that your rental account reflects an outstanding balance of <strong>{{arrears.total}}</strong>.</p><p>Please arrange for immediate payment of the outstanding amount. If you have already made payment, kindly disregard this notice and forward your proof of payment for our records.</p><p>Should you have any queries, please do not hesitate to contact us.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{arrears.total}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'Payment Acknowledgement',
    'Confirms receipt of a rent payment.',
    'correspondence',
    '<p>Dear {{tenant.full_name}},</p><p>RE: PAYMENT ACKNOWLEDGEMENT</p><p>We write to acknowledge receipt of your rental payment for {{unit.number}}, {{property.name}}.</p><p>Your account is now up to date. Thank you for your prompt payment.</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}'],
    NULL, false
  ),
  (
    'system', 'letter', 'General Correspondence',
    'Blank general-purpose letter with full letterhead.',
    'correspondence',
    '<p>Dear {{tenant.full_name}},</p><p>RE: [SUBJECT]</p><p>[Insert your message here]</p><p>Yours faithfully,</p>',
    ARRAY['{{tenant.full_name}}','{{org.name}}','{{agent.name}}','{{today}}'],
    NULL, false
  )
) AS v(scope, template_type, name, description, category, body_html, merge_fields, legal_flag, is_deletable)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates
  WHERE scope = 'system' AND template_type = 'letter' AND name = v.name
);

-- ── 9b. Email templates ───────────────────────────────────────────────────────
INSERT INTO document_templates (scope, template_type, name, description, category, subject, body_html, body_variants, merge_fields, is_deletable)
SELECT scope, template_type, name, description, category, subject, body_html, body_variants_json::jsonb, merge_fields, is_deletable FROM (VALUES
  (
    'system', 'email', 'Arrears Reminder — Level 1',
    'First automated arrears notification. Gentle reminder.',
    'arrears_and_lod',
    'Rental arrears — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>Your rental account for {{unit.number}}, {{property.name}} reflects an outstanding balance of <strong>{{arrears.total}}</strong>. Please arrange payment as soon as possible.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, just a heads up that your rental account for {{unit.number}} has an outstanding balance of {{arrears.total}}. Please arrange payment at your earliest convenience — let us know if you need assistance.</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>Your rental account for {{unit.number}}, {{property.name}} reflects an outstanding balance of <strong>{{arrears.total}}</strong>. Please arrange payment as soon as possible.</p>","firm":"<p>{{tenant.full_name}},</p><p>Your rental account for {{unit.number}}, {{property.name}} is in arrears by {{arrears.total}}. Immediate payment is required to avoid further action.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{arrears.total}}'],
    false
  ),
  (
    'system', 'email', 'Arrears Reminder — Level 2',
    'Second arrears notification. Escalated tone.',
    'arrears_and_lod',
    'URGENT: Rental arrears — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>Despite our previous notification, your rental account for {{unit.number}} remains in arrears of <strong>{{arrears.total}}</strong>. Immediate payment is required.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, we''re following up on our earlier message regarding arrears of {{arrears.total}} for {{unit.number}}. This is the second reminder — please arrange payment urgently or contact us to discuss a payment plan.</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>Despite our previous notification, your rental account for {{unit.number}} remains in arrears of <strong>{{arrears.total}}</strong>. Immediate payment is required. Failure to pay may result in legal action.</p>","firm":"<p>{{tenant.full_name}},</p><p>Second and final notice: arrears of {{arrears.total}} for {{unit.number}} remain unpaid. Legal proceedings will commence without further notice if payment is not received within 5 business days.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{arrears.total}}'],
    false
  ),
  (
    'system', 'email', 'Arrears Reminder — Level 3',
    'Final arrears notice before Letter of Demand.',
    'arrears_and_lod',
    'Final notice — rental arrears — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>This is your final notice regarding arrears of <strong>{{arrears.total}}</strong> for {{unit.number}}. A formal Letter of Demand will follow if payment is not received within 5 business days.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, this is an urgent message — your arrears of {{arrears.total}} for {{unit.number}} require immediate attention. Please contact us before {{today}} to avoid formal legal proceedings.</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>This is your final notice regarding arrears of <strong>{{arrears.total}}</strong> for {{unit.number}}. A formal Letter of Demand will be issued if payment is not received within 5 business days from {{today}}.</p>","firm":"<p>{{tenant.full_name}},</p><p>FINAL NOTICE: Arrears of {{arrears.total}} for {{unit.number}} are overdue. A Letter of Demand will be issued within 5 business days. Continued non-payment will result in eviction proceedings.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{arrears.total}}','{{today}}'],
    false
  ),
  (
    'system', 'email', 'Inspection Scheduled',
    'Notifies tenant of an upcoming property inspection.',
    'inspections',
    'Property inspection — {{unit.number}}, {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>This is a reminder that a property inspection is scheduled at {{unit.number}}, {{property.name}}. Please ensure the property is accessible. Contact us if you need to reschedule.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, just a reminder that we have a property inspection coming up at {{unit.number}}. Please ensure the property is accessible and let us know if you have any questions!</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>This is a reminder that a property inspection is scheduled at {{unit.number}}, {{property.name}}. Please ensure the property is accessible at the agreed time. Contact {{agent.name}} on {{agent.phone}} if you need to reschedule.</p>","firm":"<p>{{tenant.full_name}},</p><p>Property inspection notice: {{unit.number}}, {{property.name}}. You are required to provide access at the scheduled time in terms of your lease agreement.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{agent.name}}','{{agent.phone}}'],
    false
  ),
  (
    'system', 'email', 'Lease for Signing',
    'Sends the lease document for digital signing via DocuSeal.',
    'welcome_and_onboarding',
    'Your lease is ready to sign — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>Your lease agreement for {{unit.number}}, {{property.name}} is ready for your signature. Please click the link below to review and sign the document digitally.</p>',
    NULL,
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{lease.start_date}}','{{lease.rent_amount}}'],
    false
  ),
  (
    'system', 'email', 'Welcome to Your New Home',
    'Welcome email sent when a lease is activated.',
    'welcome_and_onboarding',
    'Welcome to {{unit.number}}, {{property.name}}!',
    '<p>Dear {{tenant.full_name}},</p><p>Welcome to your new home at {{unit.number}}, {{property.name}}. We are delighted to have you as a tenant.</p><p>Your lease commences on {{lease.start_date}} and your monthly rental is {{lease.rent_amount}}, due on the 1st of each month.</p><p>Please do not hesitate to reach out to {{agent.name}} at {{agent.email}} or {{agent.phone}} with any questions.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}! 🎉 Welcome to {{unit.number}}, {{property.name}} — we''re excited to have you! Your lease starts {{lease.start_date}} and rent of {{lease.rent_amount}} is due monthly. Reach out to {{agent.name}} anytime at {{agent.email}}.</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>Welcome to {{unit.number}}, {{property.name}}. Your lease commences on {{lease.start_date}} and your monthly rental is {{lease.rent_amount}}, due on the 1st of each month. Please contact {{agent.name}} at {{agent.email}} or {{agent.phone}} with any queries.</p>","firm":"<p>{{tenant.full_name}},</p><p>Your lease at {{unit.number}}, {{property.name}} commences on {{lease.start_date}}. Monthly rental: {{lease.rent_amount}}. Payment is due on the 1st. Contact {{agent.name}} at {{agent.email}} for administration matters.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{lease.start_date}}','{{lease.rent_amount}}','{{agent.name}}','{{agent.email}}','{{agent.phone}}'],
    false
  ),
  (
    'system', 'email', 'Payment Received Confirmation',
    'Confirms receipt of a rent payment.',
    'statements',
    'Payment received — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>Thank you — your rental payment for {{unit.number}}, {{property.name}} has been received and your account is up to date.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, thanks for your payment! Your account for {{unit.number}} is up to date. 👍</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>Thank you — your rental payment for {{unit.number}}, {{property.name}} has been received and your account is up to date.</p>","firm":"<p>{{tenant.full_name}},</p><p>Payment received. Your rental account for {{unit.number}}, {{property.name}} is now up to date.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}'],
    false
  ),
  (
    'system', 'email', 'Rent Escalation Notice',
    'Email notification of upcoming rent increase.',
    'notices',
    'Rent increase notice — {{property.name}}',
    '<p>Dear {{tenant.full_name}},</p><p>Your monthly rental for {{unit.number}}, {{property.name}} will increase by {{lease.escalation_percent}} to {{lease.rent_amount}} from the next rental period.</p>',
    '{"friendly":"<p>Hi {{tenant.full_name}}, just a heads up that your rent for {{unit.number}} increases by {{lease.escalation_percent}} to {{lease.rent_amount}} from next month, as per your lease. Let us know if you have questions!</p>","professional":"<p>Dear {{tenant.full_name}},</p><p>Please be advised that your monthly rental for {{unit.number}}, {{property.name}} will increase by {{lease.escalation_percent}} to {{lease.rent_amount}} with effect from the next rental period.</p>","firm":"<p>{{tenant.full_name}},</p><p>Rent escalation notice: your monthly rental for {{unit.number}} increases to {{lease.rent_amount}} from the next rental period in accordance with your lease agreement.</p>"}',
    ARRAY['{{tenant.full_name}}','{{unit.number}}','{{property.name}}','{{lease.escalation_percent}}','{{lease.rent_amount}}'],
    false
  )
) AS v(scope, template_type, name, description, category, subject, body_html, body_variants_json, merge_fields, is_deletable)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates
  WHERE scope = 'system' AND template_type = 'email' AND name = v.name
);

-- ── 9c. WhatsApp templates ────────────────────────────────────────────────────
INSERT INTO document_templates (
  scope, template_type, name, description, category,
  whatsapp_body, body_variants, meta_template_status, merge_fields, is_deletable
)
SELECT scope, template_type, name, description, category, whatsapp_body, body_variants_json::jsonb, meta_template_status, merge_fields, is_deletable FROM (VALUES
  (
    'system', 'whatsapp', 'Rent Due Reminder',
    'Monthly reminder that rent is due.',
    'statements',
    'Dear {{tenant.primary_contact_name}}, this is a reminder that rent of {{lease.rent_amount}} is due on the 1st for {{unit.number}}.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, just a reminder that rent of {{lease.rent_amount}} is due on the 1st for {{unit.number}}. Thanks!","professional":"Dear {{tenant.primary_contact_name}}, this is a reminder that rent of {{lease.rent_amount}} is due on the 1st for {{unit.number}}.","firm":"{{tenant.primary_contact_name}}, rent of {{lease.rent_amount}} is due on the 1st for {{unit.number}}. Please ensure timely payment."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{lease.rent_amount}}','{{unit.number}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Payment Received',
    'Confirms receipt of a rent payment.',
    'statements',
    'Dear {{tenant.primary_contact_name}}, your payment of {{lease.rent_amount}} for {{unit.number}} has been received. Your account is up to date.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, great news — your payment of {{lease.rent_amount}} for {{unit.number}} is in. Your account is all clear! 👍","professional":"Dear {{tenant.primary_contact_name}}, your payment of {{lease.rent_amount}} for {{unit.number}} has been received. Your account is up to date.","firm":"{{tenant.primary_contact_name}}, payment of {{lease.rent_amount}} for {{unit.number}} received. Account up to date."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{lease.rent_amount}}','{{unit.number}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Arrears Reminder — Level 1',
    'First gentle arrears reminder.',
    'arrears_and_lod',
    'Dear {{tenant.primary_contact_name}}, your rental account for {{unit.number}} has an outstanding balance of {{arrears.total}}. Please make payment as soon as possible.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, just a gentle reminder that your rental for {{unit.number}} has an outstanding balance of {{arrears.total}}. Please pay when you can, or contact us if you need help.","professional":"Dear {{tenant.primary_contact_name}}, your rental account for {{unit.number}} has an outstanding balance of {{arrears.total}}. Please make payment as soon as possible.","firm":"{{tenant.primary_contact_name}}, arrears of {{arrears.total}} are outstanding for {{unit.number}}. Immediate payment is required."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{arrears.total}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Arrears Reminder — Level 2',
    'Escalated arrears follow-up.',
    'arrears_and_lod',
    'Dear {{tenant.primary_contact_name}}, your rental arrears for {{unit.number}} of {{arrears.total}} remain unpaid. Please make payment urgently or contact us to arrange a payment plan.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, this is a follow-up on your rental arrears of {{arrears.total}} for {{unit.number}}. Please pay urgently or reach out to us to work something out.","professional":"Dear {{tenant.primary_contact_name}}, your rental arrears for {{unit.number}} of {{arrears.total}} remain unpaid. Please make payment urgently or contact us to arrange a payment plan.","firm":"{{tenant.primary_contact_name}}, second notice: arrears of {{arrears.total}} for {{unit.number}} are overdue. Payment or a payment arrangement is required within 48 hours."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{arrears.total}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Arrears — Final Notice',
    'Final WhatsApp notice before formal Letter of Demand.',
    'arrears_and_lod',
    'Dear {{tenant.primary_contact_name}}, this is your final notice regarding arrears of {{arrears.total}} for {{unit.number}}. A formal demand letter will follow if payment is not received.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, this is an urgent message — arrears of {{arrears.total}} for {{unit.number}} need your immediate attention. Please contact us today before formal action is taken.","professional":"Dear {{tenant.primary_contact_name}}, this is your final notice regarding arrears of {{arrears.total}} for {{unit.number}}. A formal demand letter will follow if payment is not received within 5 business days.","firm":"{{tenant.primary_contact_name}}, FINAL NOTICE: arrears of {{arrears.total}} for {{unit.number}}. Legal proceedings commence in 5 business days if payment is not received."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{arrears.total}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Inspection Scheduled',
    'Notifies tenant of an upcoming inspection.',
    'inspections',
    'Dear {{tenant.primary_contact_name}}, a property inspection is scheduled for {{unit.number}}. Please ensure the property is accessible at the agreed time.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, heads up — we have a property inspection coming up for {{unit.number}}. Please make sure access is available. Let us know if you need to reschedule!","professional":"Dear {{tenant.primary_contact_name}}, a property inspection is scheduled for {{unit.number}}. Please ensure the property is accessible at the agreed time. Contact us if you need to reschedule.","firm":"{{tenant.primary_contact_name}}, inspection notice: {{unit.number}}. You are required to provide access at the scheduled time per your lease agreement."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Inspection Confirmation Reminder',
    'Day-before reminder of scheduled inspection.',
    'inspections',
    'Dear {{tenant.primary_contact_name}}, reminder: property inspection at {{unit.number}} is scheduled for tomorrow. Please ensure access is available.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, just a reminder — your property inspection at {{unit.number}} is tomorrow! Please make sure access is available. See you then 👋","professional":"Dear {{tenant.primary_contact_name}}, reminder: property inspection at {{unit.number}} is scheduled for tomorrow. Please ensure access is available.","firm":"{{tenant.primary_contact_name}}, reminder: inspection at {{unit.number}} is tomorrow. Access must be provided."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Maintenance Request Acknowledged',
    'Confirms receipt of a maintenance request.',
    'maintenance',
    'Dear {{tenant.primary_contact_name}}, we have received your maintenance request for {{unit.number}} and will be in touch shortly.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, got your maintenance request for {{unit.number}} — we''re on it and will be in touch soon! 🔧","professional":"Dear {{tenant.primary_contact_name}}, we have received your maintenance request for {{unit.number}} and will be in touch shortly regarding the next steps.","firm":"{{tenant.primary_contact_name}}, maintenance request for {{unit.number}} received. You will be contacted shortly."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Lease Renewal Reminder',
    'Reminds tenant that their lease is coming up for renewal.',
    'notices',
    'Dear {{tenant.primary_contact_name}}, your lease for {{unit.number}} expires on {{lease.end_date}}. Please contact us if you would like to renew.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, your lease at {{unit.number}} expires on {{lease.end_date}}. We''d love to have you stay — please reach out if you want to renew!","professional":"Dear {{tenant.primary_contact_name}}, your lease for {{unit.number}} expires on {{lease.end_date}}. Please contact us if you would like to discuss renewal terms.","firm":"{{tenant.primary_contact_name}}, lease expiry notice: {{unit.number}} lease expires {{lease.end_date}}. Contact us immediately if you intend to renew."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{lease.end_date}}'],
    false
  ),
  (
    'system', 'whatsapp', 'CPA s14 Notice Companion',
    'Short WhatsApp companion to the formal CPA s14 notice email.',
    'compliance',
    'Dear {{tenant.primary_contact_name}}, your lease at {{unit.number}} expires on {{lease.end_date}}. A formal CPA s14 notice has been emailed to you. Please review it at your earliest convenience.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, we''ve sent you a formal CPA s14 notice about your lease at {{unit.number}} expiring on {{lease.end_date}}. Please check your email and let us know if you have questions!","professional":"Dear {{tenant.primary_contact_name}}, your lease at {{unit.number}} expires on {{lease.end_date}}. A formal CPA s14 notice has been emailed to you. Please review it at your earliest convenience.","firm":"{{tenant.primary_contact_name}}, CPA s14 notice for {{unit.number}} (expiry: {{lease.end_date}}) has been sent by email. Please review immediately and respond within the required period."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{lease.end_date}}'],
    false
  ),
  (
    'system', 'whatsapp', 'Welcome Message',
    'Welcome message sent when a lease is activated.',
    'welcome_and_onboarding',
    'Dear {{tenant.primary_contact_name}}, welcome to {{unit.number}}, {{property.name}}! Your lease begins on {{lease.start_date}}. We look forward to serving you.',
    '{"friendly":"Hi {{tenant.primary_contact_name}}, welcome to {{unit.number}}, {{property.name}}! 🏠 We''re so glad to have you. Your lease starts {{lease.start_date}} — reach out anytime if you need anything!","professional":"Dear {{tenant.primary_contact_name}}, welcome to {{unit.number}}, {{property.name}}. Your lease commences on {{lease.start_date}}. Please don''t hesitate to contact us with any queries.","firm":"{{tenant.primary_contact_name}}, lease activated: {{unit.number}}, {{property.name}}. Commencement: {{lease.start_date}}. Rental: {{lease.rent_amount}}/month. Contact {{agent.name}} for administration."}',
    'approved',
    ARRAY['{{tenant.primary_contact_name}}','{{unit.number}}','{{property.name}}','{{lease.start_date}}','{{lease.rent_amount}}','{{agent.name}}'],
    false
  )
) AS v(scope, template_type, name, description, category, whatsapp_body, body_variants_json, meta_template_status, merge_fields, is_deletable)
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates
  WHERE scope = 'system' AND template_type = 'whatsapp' AND name = v.name
);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §10  COMMUNICATION LOG EXTENSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
-- communication_log is defined in 002_contacts.sql (immutable message log).
-- These additional columns added for WhatsApp delivery tracking & polymorphic
-- entity references (BUILD_58).
--
-- entity_type/entity_id: polymorphic foreign key to whatever the comm relates to
--   (lease, maintenance request, application, invoice, etc.)
-- delivered_at / opened_at / failed_reason: delivery lifecycle tracking populated
--   from provider webhooks (Resend, Africa's Talking)
-- provider_response: raw webhook payload for debugging / reconciliation
-- metadata: free-form JSON for template variables, channel-specific flags, etc.
-- triggered_by: auth.users.id of the user who triggered the send (cron = NULL)

ALTER TABLE communication_log
  ADD COLUMN IF NOT EXISTS entity_type       text,
  ADD COLUMN IF NOT EXISTS entity_id         uuid,
  ADD COLUMN IF NOT EXISTS metadata          jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_response jsonb,
  ADD COLUMN IF NOT EXISTS delivered_at      timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at         timestamptz,
  ADD COLUMN IF NOT EXISTS failed_reason     text,
  ADD COLUMN IF NOT EXISTS triggered_by      uuid REFERENCES auth.users(id);


-- ═══════════════════════════════════════════════════════════════════════════════
-- §11  WHATSAPP INTEGRATION  (BUILD_58)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 11a. whatsapp_messages
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  lease_id              uuid REFERENCES leases(id),
  tenant_id             uuid REFERENCES tenants(id),
  direction             text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  template_id           uuid REFERENCES document_templates(id),
  tone_variant          text CHECK (tone_variant IN ('friendly', 'professional', 'firm')),
  phone_number          text NOT NULL,
  message_body          text NOT NULL,
  merge_context         jsonb,
  provider              text NOT NULL DEFAULT 'africastalking',
  provider_message_id   text,
  meta_template_name    text,
  status                text NOT NULL CHECK (status IN (
                          'submitted','sent','delivered','read','failed','received'
                        )),
  failure_reason        text,
  submitted_at          timestamptz NOT NULL DEFAULT now(),
  sent_at               timestamptz,
  delivered_at          timestamptz,
  read_at               timestamptz,
  failed_at             timestamptz,
  sms_fallback_sent_at  timestamptz,
  sent_within_cs_window boolean NOT NULL DEFAULT false,
  cost_cents            int,
  communication_log_id  uuid REFERENCES communication_log(id)
);

CREATE INDEX IF NOT EXISTS idx_wa_messages_org          ON whatsapp_messages(org_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_lease        ON whatsapp_messages(lease_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_tenant       ON whatsapp_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_status       ON whatsapp_messages(status);
CREATE INDEX IF NOT EXISTS idx_wa_messages_provider_id  ON whatsapp_messages(provider_message_id);

ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wa_messages_select" ON whatsapp_messages;
CREATE POLICY "wa_messages_select" ON whatsapp_messages
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "wa_messages_insert" ON whatsapp_messages;
CREATE POLICY "wa_messages_insert" ON whatsapp_messages
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));

-- 11b. tenant_messaging_consent
CREATE TABLE IF NOT EXISTS tenant_messaging_consent (
  tenant_id             uuid PRIMARY KEY REFERENCES tenants(id),
  org_id                uuid NOT NULL REFERENCES organisations(id),
  email_enabled         boolean NOT NULL DEFAULT true,
  whatsapp_enabled      boolean NOT NULL DEFAULT false,
  sms_enabled           boolean NOT NULL DEFAULT false,
  consent_captured_at   timestamptz,
  consent_captured_by   text,
  consent_captured_ip   inet,
  last_updated          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tenant_messaging_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "consent_select" ON tenant_messaging_consent;
CREATE POLICY "consent_select" ON tenant_messaging_consent
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "consent_all_admins" ON tenant_messaging_consent;
CREATE POLICY "consent_all_admins" ON tenant_messaging_consent
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()) AND is_admin = true)
  );

-- 11c. whatsapp_cs_windows (24-hour customer service windows)
CREATE TABLE IF NOT EXISTS whatsapp_cs_windows (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id            uuid NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  opened_at           timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL,
  trigger_message_id  uuid REFERENCES whatsapp_messages(id),
  is_active           boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_cs_windows_lease   ON whatsapp_cs_windows(lease_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cs_windows_expires ON whatsapp_cs_windows(expires_at);

ALTER TABLE whatsapp_cs_windows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_windows_select" ON whatsapp_cs_windows;
CREATE POLICY "cs_windows_select" ON whatsapp_cs_windows
  FOR SELECT USING (
    lease_id IN (
      SELECT id FROM leases WHERE org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid()))
    )
  );

-- 11d. messaging_usage (monthly quota and overage tracking)
CREATE TABLE IF NOT EXISTS messaging_usage (
  org_id              uuid NOT NULL REFERENCES organisations(id),
  period              date NOT NULL,
  whatsapp_count      int NOT NULL DEFAULT 0,
  sms_count           int NOT NULL DEFAULT 0,
  email_count         int NOT NULL DEFAULT 0,
  quota_whatsapp      int NOT NULL DEFAULT 400,
  quota_email         int NOT NULL DEFAULT 5000,
  overage_whatsapp    int NOT NULL DEFAULT 0,
  overage_email       int NOT NULL DEFAULT 0,
  overage_cents       int NOT NULL DEFAULT 0,
  last_updated        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, period)
);

ALTER TABLE messaging_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_select" ON messaging_usage;
CREATE POLICY "usage_select" ON messaging_usage
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = (SELECT auth.uid())));


-- ═══════════════════════════════════════════════════════════════════════════════
-- §12  STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════════
-- Buckets for signature images, lease template uploads, and property documents.
-- RLS policies below (§13) scope access by path prefix.
--
-- NOTE: Supabase hosted may require creating buckets via Dashboard → Storage.
-- The INSERT below works with supabase CLI local migrations.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('signatures',         'signatures',         false, 5242880,  ARRAY['image/png','image/jpeg','image/webp']),
  ('lease-templates',    'lease-templates',    false, 10485760, ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('property-documents', 'property-documents', false, 20971520, NULL)
ON CONFLICT (id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- §13  STORAGE RLS  (path-scoped — was 015_storage_rls.sql)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Path-prefix scoped access to the three buckets.
-- Server actions use the service-role client (bypasses RLS), so this doesn't
-- affect current code paths — but any future client-side storage access needs
-- proper scoping to avoid cross-org exposure.

-- 13a. Signatures — path: {org_id}/{user_id}/{filename}
-- Users may only access their own subfolder inside their org.
DROP POLICY IF EXISTS "signatures_user_access" ON storage.objects;
CREATE POLICY "signatures_user_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

-- 13b. Lease templates — path: {org_id}/{filename}
DROP POLICY IF EXISTS "lease_templates_org_access" ON storage.objects;
CREATE POLICY "lease_templates_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );

-- 13c. Property documents — path: {org_id}/{property_id}/{document_type}/{filename}
DROP POLICY IF EXISTS "property_documents_org_access" ON storage.objects;
CREATE POLICY "property_documents_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'property-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'property-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = (SELECT auth.uid()) AND deleted_at IS NULL
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §14  BUILD_63 Phase 8: communication_log — direction default + tenant RLS
-- ═══════════════════════════════════════════════════════════════════════════════
-- direction was NOT NULL without a DEFAULT, causing logToDb inserts to fail
-- silently (Supabase JS client swallows the error). Adding DEFAULT 'outbound'
-- so all email sends (which are always outbound) succeed without specifying it.
--
-- tenant_comms_read: allows magic-link authenticated tenants to SELECT their own
-- comms directly. Portal pages use service client (bypasses RLS), so this policy
-- is defence-in-depth and enables future direct-client queries from the portal.

ALTER TABLE communication_log
  ALTER COLUMN direction SET DEFAULT 'outbound';

DROP POLICY IF EXISTS "tenant_comms_read" ON communication_log;
CREATE POLICY "tenant_comms_read" ON communication_log
  FOR SELECT USING (
    tenant_id IN (
      SELECT id FROM tenants
      WHERE auth_user_id = (SELECT auth.uid())
        AND deleted_at IS NULL
    )
  );


-- ═══════════════════════════════════════════════════════════════════════════════
-- §15  BUILD_63 Phase 8: delivery_notice_tokens — anonymous notice viewing
-- ═══════════════════════════════════════════════════════════════════════════════
-- Tokens issued when the mandatory-retry delivery-alert fires for tenants with
-- no portal account. Each token maps to a communication_log row and allows
-- anonymous read-only viewing at /public/notice/{token}. Views are tracked as
-- page_view events in communication_delivery_events.
-- Expiry is set to the mandatory deadline date (or 30 days default).

CREATE TABLE IF NOT EXISTS delivery_notice_tokens (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  token                text        UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'base64url'),
  org_id               uuid        NOT NULL REFERENCES organisations(id),
  communication_log_id uuid        NOT NULL REFERENCES communication_log(id),
  tenant_id            uuid        REFERENCES tenants(id),
  expires_at           timestamptz NOT NULL,
  acknowledged_at      timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_notice_tokens_token
  ON delivery_notice_tokens(token)
  WHERE acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_notice_tokens_log
  ON delivery_notice_tokens(communication_log_id);

ALTER TABLE delivery_notice_tokens ENABLE ROW LEVEL SECURITY;
-- All access via service-role client (route handlers); no user-facing policy needed.


-- ═══════════════════════════════════════════════════════════════════════════════
-- §16  Signature kind — full signature vs initial (leases need an initial per page)
-- ═══════════════════════════════════════════════════════════════════════════════
-- A user keeps one active full signature AND one active initial. The active-uniqueness index moves from
-- (user_id) to (user_id, kind) so both can be active at once. Existing rows default to 'signature'.

ALTER TABLE user_signatures
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signature'
  CHECK (kind IN ('signature', 'initial'));

DROP INDEX IF EXISTS idx_user_signatures_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_signatures_active
  ON user_signatures(user_id, kind) WHERE is_active = true;

-- QR phone-capture tokens carry the kind so the mobile save lands on signature vs initial.
ALTER TABLE signature_sign_tokens
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'signature'
  CHECK (kind IN ('signature', 'initial'));

-- ═══════════════════════════════════════════════════════════════════════════════
-- §17  PRE-SCALE PERFORMANCE INDEXES (communication_log / documents)
--   Entity-timeline ordering, and org_id on the document tables (neither had one).
--   Additive + idempotent. See 004 / 005 / 012.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Comm timeline for an entity: WHERE entity_type, entity_id ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_comm_log_entity_created
  ON communication_log(entity_type, entity_id, created_at DESC);

-- Document tables: org-scoped reads had NO org_id index
CREATE INDEX IF NOT EXISTS idx_property_documents_org
  ON property_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_documents_org
  ON tenant_documents(org_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §18  BUILD_70 Phase 1: comms_class SSOT + "Customise" fork link
--   comms_class is the single discriminator driving the Templates surface (editable
--   correspondence vs view-only statutory) and System notices (service), and — later —
--   the dispatch mode + floor. customised_from links an org "Customise" copy back to the
--   system master so only ONE version shows (the master is hidden when a custom exists).
--   Conservative seed: whatsapp = service; legal-flagged or arrears/notices = statutory
--   (locked — Pleks-master, signing in Phase 3); everything else = correspondence.
--   The exact statutory set is legal-gated (Phase 3) — this errs on the SAFE (locked) side.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS comms_class text
  CHECK (comms_class IS NULL OR comms_class IN ('service', 'correspondence', 'statutory'));
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS customised_from uuid
  REFERENCES document_templates(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_document_templates_customised_from
  ON document_templates(customised_from) WHERE customised_from IS NOT NULL;

UPDATE document_templates SET comms_class = CASE
  WHEN template_type = 'whatsapp' THEN 'service'
  WHEN legal_flag IS NOT NULL OR category IN ('arrears_and_lod', 'notices') THEN 'statutory'
  ELSE 'correspondence'
END
WHERE comms_class IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §19  BUILD_70 Phase 2b: template_key — link an editable template to an auto-send event
--   A system master tagged with the TEMPLATE_REGISTRY key (e.g. 'rent.invoice_issued') becomes
--   customisable; an org "Customise" copy inherits the key, and the email send prefers the org's
--   body over the React-Email default for that key (non-statutory only). One custom per key per org.
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS template_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_templates_org_key
  ON document_templates(org_id, template_key) WHERE template_key IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- §20  ADDENDUM_70E: central template content model (single-source comms store)
--   Bodies move OUT of the React-Email components INTO structured blocks stored here, so
--   every external comm has ONE maintainable home (system masters + org custom forks),
--   flavours are one JSONB edit, and the legal-review pack regenerates from the DB.
--   Additive + idempotent (no behaviour change): new nullable columns + a widened
--   template_type to admit 'sms' as a first-class channel (row-per-(key,channel), D5).
--   body_blocks  = the structured body (TemplateBlock[] — lib/comms/templates/blocks/types.ts)
--   body_variants already exists (§4) and now carries flavour-keyed block arrays for non-statutory.
--   version / legal_reviewed_at / legal_review_ref / content_hash drive "changed since review"
--   (D6 instant re-review); legal_citations carries the F-1 statutory citation data (D7).
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS body_blocks       jsonb;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS version           int NOT NULL DEFAULT 1;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS legal_reviewed_at timestamptz;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS legal_review_ref  text;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS content_hash      text;
ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS legal_citations   jsonb;

-- Widen the channel enum to admit 'sms' (additive — only broadens the allowed set).
ALTER TABLE document_templates DROP CONSTRAINT IF EXISTS document_templates_template_type_check;
ALTER TABLE document_templates ADD  CONSTRAINT document_templates_template_type_check
  CHECK (template_type IN ('letter', 'email', 'whatsapp', 'sms'));

-- One system master per (template_key, channel); resolution index for the resolver.
CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_tmpl_system_key_channel
  ON document_templates(template_key, template_type)
  WHERE scope = 'system' AND template_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_doc_tmpl_key_channel
  ON document_templates(template_key, template_type) WHERE template_key IS NOT NULL;

-- ── Pilot seed (ADDENDUM_70E end-to-end): maintenance.logged_tenant, email channel ──
-- First body in the central store, transcribed verbatim from
-- lib/comms/templates/tenant/maintenance/maintenance-logged.tsx (ADDENDUM_70C §5.1).
-- Proves blocks → resolver → renderer → EmailLayout reproduces the legacy component.
INSERT INTO document_templates (
  scope, template_type, name, description, category,
  comms_class, template_key, version, legal_review_ref, merge_fields, is_deletable, body_blocks
)
SELECT
  'system', 'email', 'Maintenance Request Received',
  'Tenant acknowledgement when a maintenance request is logged (central-store pilot).',
  'maintenance', 'correspondence', 'maintenance.logged_tenant', 1, 'ADDENDUM_70C §5.1 (2026-06-13)',
  ARRAY['{{tenantName}}','{{propertyLabel}}','{{requestTitle}}','{{workOrderNumber}}','{{senderName}}'],
  false,
  '[
    {"type":"salutation","text":"Dear {{tenantName}},"},
    {"type":"heading","text":"Maintenance request received"},
    {"type":"paragraph","text":"We have received a maintenance request for **{{propertyLabel}}** and it is now under review. Our team will be in touch to arrange the next steps."},
    {"type":"dataBox","rows":[{"label":"Request","value":"{{requestTitle}}"},{"label":"Reference","value":"{{workOrderNumber}}"}]},
    {"type":"paragraph","text":"Please keep this reference number for your records. Quote it in any correspondence about this request."},
    {"type":"divider"},
    {"type":"signoff","text":"Kind regards,\n{{senderName}}"}
  ]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM document_templates
  WHERE scope = 'system' AND template_key = 'maintenance.logged_tenant' AND template_type = 'email'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_69A clause restructure (counsel-approved 2026-06-18): split rental_deposit → rental + deposit
-- ═══════════════════════════════════════════════════════════════════════════════
-- rental_deposit doubled as the rental anchor ({{ref:rental_deposit}}, used by payment + parking) AND the
-- deposit clause. Counsel split it into two single-purpose clauses. 006/007 are frozen, so the whole split
-- is expressed here (the established 011 post-INSERT pattern): INSERT the two new clauses, repoint the refs,
-- then retire rental_deposit (verified 2026-06-18: zero lease_clause_selections rows and zero custom bodies
-- reference it). Residential deposit interest is statutory (tenant) — NO beneficiary token (see below).
--
-- Bodies are stored single-line (one prose paragraph) — the same convention the retired rental_deposit used.
-- parseClauseBody auto-numbers every line of a MULTI-line body (X.1, X.2 …), which would inject numbers the
-- counsel wording does not have and double-label the (a)–(d) refund list; single-line renders the exact
-- counsel text as one justified paragraph (byte-for-byte).
--
-- Citations: Rental Housing Act 50 of 1999 §5 — the Rental Housing Amendment Act 35 of 2014 is NOT in force
-- (no presidential proclamation as of 2026-06-18, web-verified); deposit interest = §5(3)(d) (per the
-- counsel-signed F-1 matrix). ⚠ COMMENCEMENT WATCH: if the 2014 Amendment is ever proclaimed, ALL deposit
-- citations migrate §5 → §4A/4B together — here, in the F-1 matrix, and in lib/leases/deposit-deadline-breach.ts
-- (with the s21 6-month transition). Until then, §5 stands.

-- New 'rental' clause — the extracted rental anchor (required; takes rental_deposit's sort slot 500).
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, sort_order, depends_on, description, toggle_label)
VALUES (
  'rental', 'Rental',
  $$The basic monthly rental payable by the lessee to the lessor in respect of the hire of the leased premises, during the initial period, is set out in Annexure A: Rental Calculation per month for the initial period.$$,
  'both', true, true, 500, '{}',
  'States the basic monthly rental and points to Annexure A for the calculation. The rental anchor referenced by the payment and parking clauses.',
  NULL
)
ON CONFLICT (clause_key) DO UPDATE
  SET title = EXCLUDED.title, body_template = EXCLUDED.body_template, lease_type = EXCLUDED.lease_type,
      is_required = EXCLUDED.is_required, is_enabled_by_default = EXCLUDED.is_enabled_by_default,
      sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;

-- New 'deposit' clause — deposit-only, counsel-approved (RHA §5). Seeded with the verbatim counsel wording;
-- the interest accrues to the lessee as a statutory fact (s5(3)(d)) — literal, not tokenised/electable.
INSERT INTO lease_clause_library
  (clause_key, title, body_template, lease_type, is_required, is_enabled_by_default, sort_order, depends_on, description, toggle_label)
VALUES (
  'deposit', 'Deposit',
  $$As security for the lessee's obligations under this agreement, the lessee shall pay to the lessor a deposit in the amount stipulated in Annexure A: Rental Calculation, on or before the date stipulated in Annexure A, but in any event prior to occupation. The lessor shall invest the deposit in an interest-bearing account with a registered financial institution, as required by section 5(3) of the Rental Housing Act, 1999. The interest earned on the deposit shall accrue for the benefit of the lessee in accordance with section 5(3)(d) of the Rental Housing Act. The lessee may, before, during or after the period of the lease, on written request, require the lessor to provide written proof of the interest accrued, as contemplated in section 5(3)(d). Where the deposit is received and administered by the lessor's managing agent, it shall be held, invested and accounted for in accordance with the Property Practitioners Act, 2019, the rules of the Property Practitioners Regulatory Authority and any successor legislation applicable to the management of trust monies, and shall be accounted for separately from the managing agent's own funds. The deposit shall be retained as security for the lessee's obligations under this agreement and may be applied by the lessor against any amount lawfully due and payable by the lessee under this agreement — including unpaid rental, utility charges, municipal charges and any other charges recoverable from the lessee under this agreement, replacement costs, repairs and maintenance for which the lessee is liable, and damage to the leased premises beyond fair wear and tear. Should any portion of the deposit lawfully be utilised or appropriated towards a debt or liability of the lessee arising under this agreement, the lessee shall, on demand, restore it to its original amount. The lessee shall not, under any circumstances, be entitled to set off any amount payable by it to the lessor against the deposit. The lessor shall be entitled to deduct from the deposit only those amounts lawfully recoverable from the lessee under this agreement and applicable law. The parties shall inspect the leased premises jointly before the lessee takes occupation, for the purpose of recording any existing defects or damage. On termination of this agreement, the lessor shall, following reasonable written notice to the lessee, inspect the leased premises jointly with the lessee at a mutually convenient time, in accordance with section 5(3) of the Rental Housing Act, to determine any amounts that may be deducted from the deposit. On termination of this agreement, and subject always to the Rental Housing Act and to any lawful deductions arising from an early cancellation of this agreement, the deposit, together with interest, less any amounts lawfully deducted by the lessor (each deduction to be itemised in writing and supported by the outgoing inspection), shall be refunded to the lessee in accordance with section 5 of the Rental Housing Act, namely: (a) where no amount is owing by the lessee and a joint outgoing inspection has been conducted — within 7 (seven) days of expiration of the lease; (b) where the lessor fails to inspect the leased premises in the presence of the lessee — in full, without deduction, within 14 (fourteen) days of expiration of the lease; (c) where the lessor has applied any amount toward repairing damage for which the lessee is liable — the balance, together with interest, within 14 (fourteen) days after completion of the repairs, and the lessor shall, on request, provide the lessee with reasonable documentary proof of the costs incurred; and (d) where the lessee fails to respond to the lessor's reasonable written notice to arrange a joint outgoing inspection — within 21 (twenty-one) days of expiration of the lease. To the extent of any conflict between the periods stated above and the Rental Housing Act, the Rental Housing Act prevails.$$,
  'both', true, true, 510, '{}',
  'Deposit security, interest accruing to the lessee (RHA s5(3)(d)), PPRA trust handling, joint inspections, and the s5 refund timeline.',
  NULL
)
ON CONFLICT (clause_key) DO UPDATE
  SET title = EXCLUDED.title, body_template = EXCLUDED.body_template, lease_type = EXCLUDED.lease_type,
      is_required = EXCLUDED.is_required, is_enabled_by_default = EXCLUDED.is_enabled_by_default,
      sort_order = EXCLUDED.sort_order, description = EXCLUDED.description;

-- Repoint the cross-refs from the retired rental_deposit id. payment + parking reference the RENTAL anchor
-- ("the basic monthly rental referred to in …") → {{ref:rental}}; pets references the DEPOSIT twice
-- ("the deposit referred to in …") → {{ref:deposit}} (verified against the live bodies 2026-06-18).
UPDATE lease_clause_library
SET body_template = replace(body_template, '{{ref:rental_deposit}}', '{{ref:rental}}')
WHERE clause_key IN ('payment', 'parking') AND body_template LIKE '%{{ref:rental_deposit}}%';

UPDATE lease_clause_library
SET body_template = replace(body_template, '{{ref:rental_deposit}}', '{{ref:deposit}}')
WHERE clause_key = 'pets' AND body_template LIKE '%{{ref:rental_deposit}}%';

-- NO beneficiary tokenisation: residential deposit interest is STATUTORY (always the tenant, RHA s5(3)(d)) —
-- it is NOT a contractual election (the §7.2 50:50 split/written-election is a trust-pooling concept that
-- does not override the residential statutory entitlement; ownership correction 2026-06-18). So the deposit
-- and pets clauses keep the literal "for the benefit of the lessee" — there is no {{var:deposit_interest_beneficiary}}
-- token and no leases.deposit_interest_beneficiary field.

-- Retire the rental_deposit id now that rental + deposit replace it and all refs are repointed.
DELETE FROM lease_clause_library WHERE clause_key = 'rental_deposit';


-- ═══════════════════════════════════════════════════════════════════════════════
-- §21  Make org-assets PUBLIC (email logo fix)
--   fetchOrgSettings builds the email/branding logo URL via storage.getPublicUrl("org-assets", …); the bucket
--   was created private (007 §…), so that URL 403'd and every org-branded email rendered a broken logo. The
--   bucket only holds 2MB png/jpeg branding images, so public read is correct + intended. Idempotent UPDATE so
--   it applies on existing DBs and after 007 creates it private on a fresh replay.
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE storage.buckets SET public = true WHERE id = 'org-assets';

-- ═══════════════════════════════════════════════════════════════════════════════
-- §22  application-docs bucket + RLS (redesigned public application wizard)
--   Applicants (anon — they have no account at apply time) upload supporting docs to
--   applications/{org_id}/{application_id}/{filename}. Private bucket; agents read via the service client.
--   The supabase-js .upload() runs INSERT ... ON CONFLICT DO UPDATE ... RETURNING *, so the role needs
--   INSERT + UPDATE + (re-read) SELECT on the row, plus DELETE for re-uploads. The SELECT policy is REQUIRED —
--   without it RETURNING fails with "new row violates row-level security policy". All four are scoped to the
--   bucket + the applications/ prefix (same guard), granted to anon+authenticated.
-- ═══════════════════════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('application-docs', 'application-docs', false, 20971520,
        ARRAY['application/pdf','image/jpeg','image/jpg','image/png'])
ON CONFLICT (id) DO NOTHING;

DO $DOLLAR$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT * FROM (VALUES
      ('application_docs_insert', 'INSERT'),
      ('application_docs_update', 'UPDATE'),
      ('application_docs_delete', 'DELETE'),
      ('application_docs_select', 'SELECT')
    ) AS t(name, cmd)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.name);
  END LOOP;

  CREATE POLICY "application_docs_insert" ON storage.objects FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'application-docs' AND (storage.foldername(name))[1] = 'applications');
  CREATE POLICY "application_docs_update" ON storage.objects FOR UPDATE TO anon, authenticated
    USING (bucket_id = 'application-docs' AND (storage.foldername(name))[1] = 'applications')
    WITH CHECK (bucket_id = 'application-docs' AND (storage.foldername(name))[1] = 'applications');
  CREATE POLICY "application_docs_delete" ON storage.objects FOR DELETE TO anon, authenticated
    USING (bucket_id = 'application-docs' AND (storage.foldername(name))[1] = 'applications');
  CREATE POLICY "application_docs_select" ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'application-docs' AND (storage.foldername(name))[1] = 'applications');
END $DOLLAR$;
