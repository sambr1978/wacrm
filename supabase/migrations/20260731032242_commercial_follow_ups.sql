-- ============================================================
-- Commercial follow-ups
--
-- Adds an operational follow-up layer for acquisition,
-- relationship maintenance, and reactivation without changing
-- existing pipeline routes or API contracts.
-- ============================================================

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS follow_ups (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (
    activity_type IN (
      'whatsapp',
      'phone',
      'email',
      'meeting',
      'proposal',
      'agreed_return',
      'post_sale',
      'rebuy',
      'reactivation',
      'internal_note'
    )
  ),
  channel TEXT NOT NULL CHECK (
    channel IN ('whatsapp', 'phone', 'email', 'meeting', 'internal', 'other')
  ),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (
    priority IN ('low', 'normal', 'high', 'urgent')
  ),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'completed', 'cancelled', 'rescheduled')
  ),
  due_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  result TEXT,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  rescheduled_from_id UUID REFERENCES follow_ups(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT follow_ups_has_context CHECK (
    contact_id IS NOT NULL OR deal_id IS NOT NULL OR conversation_id IS NOT NULL
  ),
  CONSTRAINT follow_ups_completed_has_timestamp CHECK (
    status <> 'completed' OR completed_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_account_due
  ON follow_ups(account_id, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_follow_ups_account_status
  ON follow_ups(account_id, status, due_at);

CREATE INDEX IF NOT EXISTS idx_follow_ups_assigned_due
  ON follow_ups(account_id, assigned_to, due_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_follow_ups_contact
  ON follow_ups(account_id, contact_id, due_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_ups_deal
  ON follow_ups(account_id, deal_id, due_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_ups_one_active_primary_per_deal
  ON follow_ups(account_id, deal_id)
  WHERE is_primary = TRUE AND status = 'pending' AND deal_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_ups_one_active_primary_per_contact
  ON follow_ups(account_id, contact_id)
  WHERE is_primary = TRUE
    AND status = 'pending'
    AND deal_id IS NULL
    AND contact_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON follow_ups;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read follow-ups" ON follow_ups;
CREATE POLICY "Members can read follow-ups"
  ON follow_ups FOR SELECT
  TO authenticated
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create follow-ups" ON follow_ups;
CREATE POLICY "Agents can create follow-ups"
  ON follow_ups FOR INSERT
  TO authenticated
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Agents can update follow-ups" ON follow_ups;
CREATE POLICY "Agents can update follow-ups"
  ON follow_ups FOR UPDATE
  TO authenticated
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

CREATE TABLE IF NOT EXISTS follow_up_events (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  follow_up_id UUID NOT NULL REFERENCES follow_ups(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'created',
      'completed',
      'cancelled',
      'rescheduled',
      'reopened',
      'decision',
      'note'
    )
  ),
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('pending', 'completed', 'cancelled', 'rescheduled')
  ),
  to_status TEXT CHECK (
    to_status IS NULL OR to_status IN ('pending', 'completed', 'cancelled', 'rescheduled')
  ),
  from_due_at TIMESTAMPTZ,
  to_due_at TIMESTAMPTZ,
  decision TEXT,
  note TEXT,
  result TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_events_follow_up_created
  ON follow_up_events(follow_up_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_events_account_created
  ON follow_up_events(account_id, created_at DESC);

ALTER TABLE follow_up_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read follow-up events" ON follow_up_events;
CREATE POLICY "Members can read follow-up events"
  ON follow_up_events FOR SELECT
  TO authenticated
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS "Agents can create follow-up events" ON follow_up_events;
CREATE POLICY "Agents can create follow-up events"
  ON follow_up_events FOR INSERT
  TO authenticated
  WITH CHECK (is_account_member(account_id, 'agent'));
