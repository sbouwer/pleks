-- 028_application_report_reuse.sql — 30-day credit report reuse

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS reused_from_application_id uuid
    REFERENCES applications(id);
