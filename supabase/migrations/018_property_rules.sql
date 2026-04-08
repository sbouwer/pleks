-- 018_property_rules.sql
-- BUILD_44: Property Rules Library + AI Reformat
--
-- Replaces the flat property_rules table (004_leases_financials.sql, old schema)
-- with a template-based row-per-rule system.
-- Credits are tracked at the property level (not unit level).

-- =============================================================================
-- DROP OLD SCHEMA (if it exists from the pre-BUILD_44 flat schema)
-- Detect by presence of the `version` column, which only existed in the old schema.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'property_rules' AND column_name = 'version'
  ) THEN
    -- Remove FK on leases first
    ALTER TABLE leases DROP COLUMN IF EXISTS property_rules_id;
    ALTER TABLE leases DROP COLUMN IF EXISTS property_rules_version;
    DROP TABLE IF EXISTS property_rules CASCADE;
  END IF;
END $$;


-- =============================================================================
-- RULE TEMPLATES (seeded library — free for all tiers)
-- =============================================================================

CREATE TABLE IF NOT EXISTS rule_templates (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key       text UNIQUE NOT NULL,
  title          text NOT NULL,
  body_template  text NOT NULL,
  category       text NOT NULL,
  feature_key    text,                      -- matches unit features for auto-suggestion
  default_params jsonb DEFAULT '{}',        -- default token values
  sort_order     int DEFAULT 100,
  created_at     timestamptz DEFAULT now()
);


-- =============================================================================
-- PROPERTY RULES (user-configured per property, row-per-rule)
-- =============================================================================

CREATE TABLE IF NOT EXISTS property_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organisations(id),
  rule_template_id uuid REFERENCES rule_templates(id),   -- NULL for custom rules
  title            text NOT NULL,
  body_text        text NOT NULL,                         -- final rendered / saved text
  params           jsonb DEFAULT '{}',                    -- configured token values
  is_custom        boolean DEFAULT false,                 -- true if AI-reformatted
  sort_order       int DEFAULT 100,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE property_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_property_rules" ON property_rules
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM user_orgs WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

CREATE TRIGGER update_property_rules_updated_at
  BEFORE UPDATE ON property_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_property_rules_property ON property_rules(property_id);
CREATE INDEX IF NOT EXISTS idx_property_rules_org      ON property_rules(org_id);


-- =============================================================================
-- AI REFORMAT CREDITS — tracked at PROPERTY level
-- =============================================================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS ai_reformat_count int DEFAULT 0;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ai_reformat_bonus int DEFAULT 0;


-- =============================================================================
-- HOA SCHEME RULES — path stored on the managing scheme (contractor record)
-- =============================================================================

ALTER TABLE contractors ADD COLUMN IF NOT EXISTS scheme_rules_path text;
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS scheme_rules_uploaded_at timestamptz;


-- =============================================================================
-- AI CREDIT PURCHASES (PayFast top-up tracking, property-level)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_credit_purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organisations(id),
  property_id       uuid NOT NULL REFERENCES properties(id),
  user_id           uuid NOT NULL,
  credits           int NOT NULL DEFAULT 5,
  amount_cents      int NOT NULL DEFAULT 5000,   -- R50.00
  payment_reference text,                         -- PayFast reference
  status            text DEFAULT 'pending'
                    CHECK (status IN ('pending', 'completed', 'failed')),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_purchases_property ON ai_credit_purchases(property_id);
CREATE INDEX IF NOT EXISTS idx_ai_purchases_org      ON ai_credit_purchases(org_id);


-- =============================================================================
-- SEED RULE TEMPLATES (20 library rules)
-- =============================================================================

INSERT INTO rule_templates (rule_key, title, body_template, category, feature_key, default_params, sort_order) VALUES
  ('quiet_hours',
   'Quiet hours',
   'The Lessee shall observe quiet hours between {{quiet_hours_start}} and {{quiet_hours_end}} daily. The Lessee shall ensure that no noise audible beyond the boundaries of the Premises is created during these hours, and shall take reasonable steps to ensure that all occupants, guests, and visitors comply with this requirement.',
   'Noise', NULL, '{"quiet_hours_start":"22:00","quiet_hours_end":"07:00"}', 10),

  ('music_entertainment',
   'Music and entertainment',
   'The Lessee shall not play amplified music or conduct any entertainment that creates noise audible beyond the boundaries of the Premises after 22:00 on any day. All gatherings on the Premises shall be conducted with due consideration for neighbouring occupants.',
   'Noise', NULL, '{}', 11),

  ('smoking',
   'Smoking restrictions',
   'Smoking is prohibited inside the Premises and on all balconies and enclosed areas. The Lessee shall ensure that smoking is confined to designated outdoor areas, if any, and shall be responsible for the proper disposal of all smoking materials.',
   'Smoking', NULL, '{"areas":"inside the Premises and on all balconies"}', 20),

  ('braai_usage',
   'Braai and BBQ usage',
   'The use of braai or barbecue facilities is permitted only in designated areas and shall cease by {{braai_close_time}} daily. The Lessee shall ensure that all braai equipment is properly extinguished after use and that the braai area is left clean and free of debris.',
   'Braai', NULL, '{"braai_close_time":"22:00"}', 30),

  ('pet_restrictions',
   'Pet restrictions',
   'The Lessee shall not keep any domestic animal exceeding {{max_pet_weight_kg}}kg in weight on the Premises, and shall not keep more than {{max_pet_count}} domestic animals in total. All pets must be kept under control at all times and must not cause a nuisance to other occupants or neighbours.',
   'Pets', 'Pet friendly', '{"max_pet_weight_kg":"10","max_pet_count":"2"}', 40),

  ('pet_waste',
   'Pet waste and damage',
   'The Lessee shall be responsible for the immediate removal and hygienic disposal of all pet waste from the Premises and common areas. The Lessee shall be liable for any damage caused to the Premises or common property by any animal kept by the Lessee.',
   'Pets', 'Pet friendly', '{}', 41),

  ('parking_allocated',
   'Allocated parking',
   'The Lessee is allocated parking bay(s) as specified in this Agreement. Vehicles shall be parked only in allocated bays. The parking of caravans, trailers, boats, or unregistered vehicles on the Premises is prohibited unless prior written consent is obtained from the Lessor.',
   'Parking', NULL, '{}', 50),

  ('parking_visitors',
   'Visitor parking',
   'Visitors shall use designated visitor parking only and shall not occupy allocated bays belonging to other lessees. The Lessee shall ensure that visitors comply with all parking rules applicable to the Premises.',
   'Parking', NULL, '{}', 51),

  ('parking_no_repairs',
   'No vehicle repairs',
   'The Lessee shall not carry out vehicle maintenance, repairs, or washing on the Premises other than routine cleaning. No oil, fuel, or automotive fluids shall be allowed to contaminate the parking area or any part of the Premises.',
   'Parking', NULL, '{}', 52),

  ('pool_hours',
   'Pool hours and safety',
   'The swimming pool may be used between {{pool_open}} and {{pool_close}} daily. Children under the age of 12 must be accompanied by a responsible adult at all times while using the pool. The Lessee shall shower before entering the pool and shall not permit the use of the pool by any person suffering from a communicable skin condition or open wound.',
   'Pool', 'Pool', '{"pool_open":"08:00","pool_close":"20:00"}', 60),

  ('pool_no_glass',
   'No glass at pool area',
   'No glass containers, bottles, or glassware of any kind shall be brought into or used in the pool area. Only plastic or shatter-proof containers are permitted.',
   'Pool', 'Pool', '{}', 61),

  ('garden_maintenance',
   'Garden maintenance',
   'The Lessee shall maintain all garden areas within the Premises in a neat and presentable condition. Gardens shall be watered no fewer than {{watering_frequency}} during the months of October through March. The Lessee shall not remove, damage, or materially alter any established trees, shrubs, or plants without the prior written consent of the Lessor.',
   'Garden', 'Garden', '{"watering_frequency":"twice per week"}', 70),

  ('garden_no_alterations',
   'No alterations to garden',
   'The Lessee shall not erect any structures, install trampolines or play equipment, or make any alterations to the garden or landscaping without the prior written consent of the Lessor.',
   'Garden', 'Garden', '{}', 71),

  ('laundry',
   'Washing and drying',
   'Laundry shall be hung to dry only in designated drying areas or on approved drying racks. Laundry shall not be hung on balcony railings, fences, or any area visible from the street or common areas.',
   'Laundry', NULL, '{}', 80),

  ('alarm_access',
   'Alarm and access control',
   'The Lessee shall operate the alarm system in accordance with the instructions provided by the Lessor. The Lessee shall be responsible for any call-out fees resulting from false alarms caused by the Lessee or any occupant of the Premises. Alarm codes and access credentials shall not be shared with unauthorised persons.',
   'Security', 'Alarm', '{}', 90),

  ('gate_keys',
   'Gate and key protocol',
   'The Lessee shall ensure that all gates, doors, and security barriers are locked and secured when not in use. Lost or damaged keys, remotes, or access devices must be reported to the Lessor immediately, and the Lessee shall bear the cost of replacement.',
   'Security', NULL, '{}', 91),

  ('common_areas',
   'Common area usage',
   'The Lessee shall use all common areas with due care and consideration for other occupants. No personal belongings shall be stored in common areas, passages, or stairwells. The Lessee shall not obstruct any common passage, entrance, stairway, or fire escape.',
   'Common areas', NULL, '{}', 100),

  ('refuse',
   'Refuse and recycling',
   'The Lessee shall dispose of all household refuse in the bins or receptacles provided, and shall ensure that refuse is placed out for collection on the designated collection day. Recycling shall be separated where facilities are provided. No refuse shall be left in common areas, passages, or outside the designated refuse area.',
   'Refuse', NULL, '{"collection_day":"Wednesday"}', 110),

  ('no_subletting',
   'No subletting',
   'The Lessee shall not sublet, assign, or otherwise part with occupation of the Premises or any part thereof without the prior written consent of the Lessor.',
   'Subletting', NULL, '{}', 120),

  ('no_modifications',
   'No modifications or alterations',
   'The Lessee shall not make any structural or cosmetic alterations, additions, or modifications to the Premises without the prior written consent of the Lessor. This includes, but is not limited to, painting, wallpapering, installation of fixtures, drilling into walls, and alteration of any fitted items.',
   'Alterations', NULL, '{}', 130),

  ('hazardous_materials',
   'Hazardous materials',
   'The Lessee shall not store or use any flammable, explosive, or hazardous materials on the Premises beyond normal household quantities of cleaning products. No gas cylinders other than those required for cooking appliances shall be stored on the Premises.',
   'General', NULL, '{}', 140)

ON CONFLICT (rule_key) DO NOTHING;
