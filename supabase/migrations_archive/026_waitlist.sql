-- 026_waitlist.sql — Early access waitlist

CREATE TABLE IF NOT EXISTS waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text,
  created_at timestamptz DEFAULT now()
);

-- No RLS needed — public insert only, admin reads via service role
