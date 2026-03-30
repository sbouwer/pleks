-- 027_waitlist_role_check.sql — Add role CHECK to waitlist

ALTER TABLE waitlist ADD CONSTRAINT waitlist_role_check
  CHECK (role IS NULL OR role IN ('agent', 'portfolio_manager', 'landlord', 'other'));
