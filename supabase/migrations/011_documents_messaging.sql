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
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


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
  FOR SELECT USING (user_id = auth.uid());


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
    AND org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Only admins modify org templates" ON document_templates;
CREATE POLICY "Only admins modify org templates" ON document_templates
  FOR ALL USING (
    scope = 'organisation'
    AND org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND is_admin = true
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
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


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
      WHERE user_id = auth.uid() AND is_admin = true
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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users modify own doc jobs" ON document_generation_jobs;
CREATE POLICY "Users modify own doc jobs" ON document_generation_jobs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


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
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_insert" ON lease_documents;
CREATE POLICY "lease_docs_org_insert" ON lease_documents
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "lease_docs_org_delete" ON lease_documents;
CREATE POLICY "lease_docs_org_delete" ON lease_documents
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
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
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "wa_messages_insert" ON whatsapp_messages;
CREATE POLICY "wa_messages_insert" ON whatsapp_messages
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

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
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "consent_all_admins" ON tenant_messaging_consent;
CREATE POLICY "consent_all_admins" ON tenant_messaging_consent
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND is_admin = true)
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
      SELECT id FROM leases WHERE org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
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
  FOR SELECT USING (org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid()));


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
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- 13b. Lease templates — path: {org_id}/{filename}
DROP POLICY IF EXISTS "lease_templates_org_access" ON storage.objects;
CREATE POLICY "lease_templates_org_access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'lease-templates'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
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
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    bucket_id = 'property-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_orgs
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );
