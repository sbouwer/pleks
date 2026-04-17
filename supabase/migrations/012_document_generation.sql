-- ═══════════════════════════════════════════════════════════════════════════════
-- 012_document_generation.sql
-- ADDENDUM_57E — Templates, Signatures, Document Editor & Messaging
-- Creates: user_signatures, signature_sign_tokens, document_templates,
--          user_template_favourites, org_whatsapp_template_preferences,
--          document_generation_jobs
-- Amends:  lease_documents (adds generation_job_id + generated_letter doc_type)
--          organisations (adds document branding columns + settings jsonb)
-- Seeds:   system letter, email, and WhatsApp templates (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. organisations — add document branding + settings columns ────────────────
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS eaab_ffc                 text,
  ADD COLUMN IF NOT EXISTS logo_path                text,
  ADD COLUMN IF NOT EXISTS document_footer_text     text,
  ADD COLUMN IF NOT EXISTS document_primary_font    text DEFAULT 'inter',
  ADD COLUMN IF NOT EXISTS document_brand_colour    text DEFAULT '#2563eb',
  ADD COLUMN IF NOT EXISTS settings                 jsonb NOT NULL DEFAULT '{}';

COMMENT ON COLUMN organisations.settings IS
  'Org-wide configuration defaults. Schema: { preferences_version, communication: { tone_tenant, tone_owner, managed_by_label, sms_fallback_enabled, sms_fallback_delay_hours } }';

-- ── 2. user_signatures ────────────────────────────────────────────────────────
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

CREATE POLICY "Users manage own signatures" ON user_signatures
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. signature_sign_tokens ──────────────────────────────────────────────────
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
CREATE POLICY "Users view own tokens" ON signature_sign_tokens
  FOR SELECT USING (user_id = auth.uid());

-- ── 4. document_templates ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_templates (
  id                   uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               uuid  REFERENCES organisations(id),  -- NULL for system scope
  scope                text  NOT NULL CHECK (scope IN ('system', 'organisation')),
  template_type        text  NOT NULL CHECK (template_type IN ('letter', 'email', 'whatsapp')),
  name                 text  NOT NULL,
  description          text,
  category             text  NOT NULL DEFAULT 'other',
  -- Body content
  body_html            text,               -- letters + emails (HTML)
  body_json            jsonb,              -- TipTap document JSON
  body_variants        jsonb,              -- {friendly, professional, firm} for system templates
  subject              text,               -- emails only
  whatsapp_header      text,
  whatsapp_body        text,               -- professional variant default
  whatsapp_footer      text,
  -- Meta approval (whatsapp only)
  meta_template_id     text,
  meta_template_status text  CHECK (meta_template_status IN ('pending', 'approved', 'rejected')),
  -- Metadata
  legal_flag           text  CHECK (legal_flag IN ('wet_ink_only', 'aes_recommended')),
  merge_fields         text[],
  usage_count          int   NOT NULL DEFAULT 0,
  last_used_at         timestamptz,
  is_deletable         boolean NOT NULL DEFAULT true,
  created_by           uuid  REFERENCES auth.users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_org
  ON document_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_document_templates_scope_type
  ON document_templates(scope, template_type);
CREATE INDEX IF NOT EXISTS idx_document_templates_category
  ON document_templates(category);

ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System templates visible to all" ON document_templates
  FOR SELECT USING (scope = 'system');

CREATE POLICY "Org templates visible to org members" ON document_templates
  FOR SELECT USING (
    scope = 'organisation'
    AND org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
  );

CREATE POLICY "Only admins modify org templates" ON document_templates
  FOR ALL USING (
    scope = 'organisation'
    AND org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- ── 5. user_template_favourites ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_template_favourites (
  user_id     uuid NOT NULL REFERENCES auth.users(id),
  template_id uuid NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, template_id)
);

ALTER TABLE user_template_favourites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favourites" ON user_template_favourites
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 6. org_whatsapp_template_preferences ─────────────────────────────────────
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

CREATE POLICY "Org admins manage WA preferences" ON org_whatsapp_template_preferences
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs
      WHERE user_id = auth.uid() AND is_admin = true
    )
  );

-- ── 7. document_generation_jobs ───────────────────────────────────────────────
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

CREATE POLICY "Org members view org doc jobs" ON document_generation_jobs
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid())
  );

CREATE POLICY "Users modify own doc jobs" ON document_generation_jobs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 8. lease_documents — add generation_job_id + widen doc_type ───────────────
ALTER TABLE lease_documents
  ADD COLUMN IF NOT EXISTS generation_job_id uuid REFERENCES document_generation_jobs(id);

-- Widen doc_type CHECK to include generated_letter
ALTER TABLE lease_documents DROP CONSTRAINT IF EXISTS lease_documents_doc_type_check;
ALTER TABLE lease_documents ADD CONSTRAINT lease_documents_doc_type_check
  CHECK (doc_type IN (
    'signed_lease', 'welcome_pack_tenant', 'welcome_pack_landlord',
    'lod', 's14_notice', 'section_4_notice', 'tribunal_submission',
    'statement_tenant', 'statement_owner', 'inspection_report',
    'amendment', 'generated_letter', 'other'
  ));

-- ── 9. Seed system templates (idempotent) ─────────────────────────────────────

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
