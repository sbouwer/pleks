-- 012_bank_recon.sql
-- Bank statement imports and extracted transaction lines

CREATE TABLE bank_statement_imports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  bank_account_id   uuid NOT NULL REFERENCES bank_accounts(id),
  original_filename  text NOT NULL,
  storage_path       text NOT NULL,
  file_size_bytes    integer,
  mime_type          text DEFAULT 'application/pdf',
  detected_bank      text CHECK (detected_bank IN (
                       'fnb', 'absa', 'standard_bank', 'nedbank',
                       'capitec', 'investec', 'other'
                     )),
  statement_period_from date,
  statement_period_to   date,
  statement_account_number text,
  opening_balance_cents   integer,
  closing_balance_cents   integer,
  extraction_status  text NOT NULL DEFAULT 'pending'
                     CHECK (extraction_status IN (
                       'pending', 'extracting', 'extracted',
                       'matching', 'complete', 'failed'
                     )),
  extracted_at       timestamptz,
  matched_at         timestamptz,
  transaction_count  integer DEFAULT 0,
  matched_count      integer DEFAULT 0,
  unmatched_count    integer DEFAULT 0,
  reconciled         boolean DEFAULT false,
  reconciled_by      uuid REFERENCES auth.users(id),
  reconciled_at      timestamptz,
  recon_notes        text,
  pleks_calculated_closing_cents integer,
  balance_discrepancy_cents      integer,
  created_by         uuid REFERENCES auth.users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_bank_statement_imports_updated_at
  BEFORE UPDATE ON bank_statement_imports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_bank_imports_org ON bank_statement_imports(org_id);
CREATE INDEX idx_bank_imports_account ON bank_statement_imports(bank_account_id);

ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_bank_imports" ON bank_statement_imports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Bank statement lines (individual transactions)
CREATE TABLE bank_statement_lines (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL,
  import_id         uuid NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  transaction_date  date NOT NULL,
  description_raw   text NOT NULL,
  reference_raw     text,
  debit_cents       integer DEFAULT 0,
  credit_cents      integer DEFAULT 0,
  balance_cents     integer,
  description_clean text,
  reference_clean   text,
  amount_cents      integer NOT NULL,
  direction         text NOT NULL CHECK (direction IN ('credit', 'debit')),
  match_status      text NOT NULL DEFAULT 'unmatched'
                    CHECK (match_status IN (
                      'matched_exact', 'matched_fuzzy', 'matched_ai',
                      'matched_manual', 'unmatched', 'ignored', 'split'
                    )),
  match_confidence  numeric(3,2),
  matched_invoice_id       uuid REFERENCES rent_invoices(id),
  matched_payment_id       uuid REFERENCES payments(id),
  matched_supplier_inv_id  uuid REFERENCES supplier_invoices(id),
  matched_trust_txn_id     uuid REFERENCES trust_transactions(id),
  ai_match_suggestion      jsonb,
  ai_match_confirmed       boolean DEFAULT false,
  ai_match_confirmed_by    uuid REFERENCES auth.users(id),
  resolved_by              uuid REFERENCES auth.users(id),
  resolved_at              timestamptz,
  ignore_reason            text,
  line_sequence            integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stmt_lines_import ON bank_statement_lines(import_id);
CREATE INDEX idx_stmt_lines_match_status ON bank_statement_lines(match_status);
CREATE INDEX idx_stmt_lines_date ON bank_statement_lines(transaction_date);
CREATE INDEX idx_stmt_lines_reference ON bank_statement_lines(reference_clean);

ALTER TABLE bank_statement_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_stmt_lines" ON bank_statement_lines
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
