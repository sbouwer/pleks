-- 015_lease_lifecycle.sql
-- Lease lifecycle events (immutable), renewal offers

CREATE TABLE lease_lifecycle_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  lease_id        uuid NOT NULL REFERENCES leases(id),
  event_type      text NOT NULL CHECK (event_type IN (
                    'lease_created', 'lease_signed', 'cpa_notice_sent',
                    'renewal_offer_sent', 'renewal_accepted', 'renewal_declined',
                    'escalation_processed', 'escalation_amendment_signed',
                    'notice_given_tenant', 'notice_given_landlord',
                    'converted_to_month_to_month', 'deposit_timer_started',
                    'lease_expired', 'lease_renewed', 'lease_cancelled'
                  )),
  description     text,
  metadata        jsonb DEFAULT '{}',
  triggered_by    text CHECK (triggered_by IN ('system', 'agent', 'tenant', 'cron')),
  triggered_by_user uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lifecycle_lease ON lease_lifecycle_events(lease_id);
CREATE INDEX idx_lifecycle_org ON lease_lifecycle_events(org_id);

ALTER TABLE lease_lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_lifecycle_events_select" ON lease_lifecycle_events
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );
CREATE POLICY "org_lifecycle_events_insert" ON lease_lifecycle_events
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Renewal offers
CREATE TABLE lease_renewal_offers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL,
  lease_id        uuid NOT NULL REFERENCES leases(id),
  proposed_start_date   date NOT NULL,
  proposed_end_date     date,
  proposed_rent_cents   integer NOT NULL,
  proposed_escalation_percent numeric(5,2),
  proposed_deposit_cents integer,
  notes                 text,
  status          text NOT NULL DEFAULT 'sent'
                  CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired', 'superseded')),
  expires_at      timestamptz,
  ai_drafted      boolean DEFAULT false,
  responded_at    timestamptz,
  response_notes  text,
  new_lease_id    uuid REFERENCES leases(id),
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER update_lease_renewal_offers_updated_at
  BEFORE UPDATE ON lease_renewal_offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE lease_renewal_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_renewal_offers" ON lease_renewal_offers
  FOR ALL USING (
    org_id IN (SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL)
  );

-- Add deposit_return_days to leases for commercial leases
ALTER TABLE leases ADD COLUMN IF NOT EXISTS deposit_return_days integer DEFAULT 30;
