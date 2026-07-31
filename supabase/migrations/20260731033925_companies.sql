-- ============================================================
-- Companies as commercial CRM entities
--
-- Introduces account-scoped companies while preserving the legacy
-- contacts.company text field for API/backward compatibility.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.normalize_company_name(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT lower(
    trim(regexp_replace(
      regexp_replace(
        extensions.unaccent(coalesce(input, '')),
        '[^[:alnum:]]+',
        ' ',
        'g'
      ),
      '\s+',
      ' ',
      'g'
    ))
  );
$$;

CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  legal_name TEXT,
  trade_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  tax_id TEXT,
  commercial_status TEXT NOT NULL DEFAULT 'prospect' CHECK (
    commercial_status IN ('prospect', 'active_customer', 'at_risk', 'inactive', 'reactivated', 'archived')
  ),
  segment TEXT,
  website TEXT,
  primary_phone TEXT,
  general_email TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  region TEXT,
  postal_code TEXT,
  country TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT companies_has_name CHECK (
    length(trim(coalesce(trade_name, ''))) > 0
    OR length(trim(coalesce(legal_name, ''))) > 0
  ),
  CONSTRAINT companies_normalized_name_not_blank CHECK (normalized_name <> '')
);

CREATE OR REPLACE FUNCTION public.set_company_normalized_name()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.normalized_name := public.normalize_company_name(
    COALESCE(NULLIF(NEW.trade_name, ''), NULLIF(NEW.legal_name, ''))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_normalized_name ON companies;
CREATE TRIGGER set_company_normalized_name
  BEFORE INSERT OR UPDATE OF trade_name, legal_name, normalized_name ON companies
  FOR EACH ROW EXECUTE FUNCTION public.set_company_normalized_name();

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_account_normalized_active
  ON companies(account_id, normalized_name)
  WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_id_account
  ON companies(id, account_id);

CREATE INDEX IF NOT EXISTS idx_companies_account_status
  ON companies(account_id, commercial_status);

CREATE INDEX IF NOT EXISTS idx_companies_assigned
  ON companies(account_id, assigned_to)
  WHERE archived_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON companies;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companies_select ON companies;
CREATE POLICY companies_select
  ON companies FOR SELECT
  TO authenticated
  USING (is_account_member(account_id, 'viewer'));

DROP POLICY IF EXISTS companies_insert ON companies;
CREATE POLICY companies_insert
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (
    is_account_member(account_id, 'agent')
    AND user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS companies_update ON companies;
CREATE POLICY companies_update
  ON companies FOR UPDATE
  TO authenticated
  USING (is_account_member(account_id, 'agent'))
  WITH CHECK (is_account_member(account_id, 'agent'));

REVOKE ALL ON FUNCTION public.normalize_company_name(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_company_name(TEXT) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_company_normalized_name() FROM PUBLIC;

REVOKE ALL ON companies FROM PUBLIC;
REVOKE ALL ON companies FROM anon;
REVOKE ALL ON companies FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON companies TO authenticated;
GRANT ALL ON companies TO service_role;

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_title TEXT,
  ADD COLUMN IF NOT EXISTS commercial_role TEXT CHECK (
    commercial_role IS NULL OR commercial_role IN ('buyer', 'decision_maker', 'finance', 'technical_user', 'other')
  ),
  ADD COLUMN IF NOT EXISTS is_primary_company_contact BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

ALTER TABLE follow_ups
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.ensure_company_account_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  company_account UUID;
BEGIN
  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT account_id INTO company_account
  FROM companies
  WHERE id = NEW.company_id;

  IF company_account IS NULL OR company_account <> NEW.account_id THEN
    RAISE EXCEPTION 'company_id does not belong to the row account_id'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_contacts_company_account ON contacts;
CREATE TRIGGER ensure_contacts_company_account
  BEFORE INSERT OR UPDATE OF account_id, company_id ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_account_match();

DROP TRIGGER IF EXISTS ensure_deals_company_account ON deals;
CREATE TRIGGER ensure_deals_company_account
  BEFORE INSERT OR UPDATE OF account_id, company_id ON deals
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_account_match();

DROP TRIGGER IF EXISTS ensure_follow_ups_company_account ON follow_ups;
CREATE TRIGGER ensure_follow_ups_company_account
  BEFORE INSERT OR UPDATE OF account_id, company_id ON follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.ensure_company_account_match();

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_company_account_fk,
  ADD CONSTRAINT contacts_company_account_fk
    FOREIGN KEY (company_id, account_id)
    REFERENCES companies(id, account_id)
    ON DELETE SET NULL (company_id);

ALTER TABLE deals
  DROP CONSTRAINT IF EXISTS deals_company_account_fk,
  ADD CONSTRAINT deals_company_account_fk
    FOREIGN KEY (company_id, account_id)
    REFERENCES companies(id, account_id)
    ON DELETE SET NULL (company_id);

ALTER TABLE follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_company_account_fk,
  ADD CONSTRAINT follow_ups_company_account_fk
    FOREIGN KEY (company_id, account_id)
    REFERENCES companies(id, account_id)
    ON DELETE SET NULL (company_id);

ALTER TABLE contacts
  DROP CONSTRAINT IF EXISTS contacts_primary_company_contact_has_company,
  ADD CONSTRAINT contacts_primary_company_contact_has_company CHECK (
    is_primary_company_contact = FALSE OR company_id IS NOT NULL
  );

CREATE OR REPLACE FUNCTION public.sync_contact_company_legacy_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_company_name TEXT;
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.is_primary_company_contact := FALSE;
    IF TG_OP = 'INSERT' OR NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      NEW.company := NULL;
    END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trade_name, ''), NULLIF(legal_name, ''))
    INTO linked_company_name
  FROM companies
  WHERE id = NEW.company_id
    AND account_id = NEW.account_id;

  IF linked_company_name IS NULL THEN
    RAISE EXCEPTION 'company_id does not belong to the row account_id'
      USING ERRCODE = '23514';
  END IF;

  NEW.company := linked_company_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_contacts_company_legacy_fields ON contacts;
CREATE TRIGGER sync_contacts_company_legacy_fields
  BEFORE INSERT OR UPDATE OF account_id, company_id, company, is_primary_company_contact ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.sync_contact_company_legacy_fields();

CREATE OR REPLACE FUNCTION public.sync_contacts_after_company_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  linked_company_name TEXT;
BEGIN
  linked_company_name := COALESCE(NULLIF(NEW.trade_name, ''), NULLIF(NEW.legal_name, ''));

  IF linked_company_name IS DISTINCT FROM COALESCE(NULLIF(OLD.trade_name, ''), NULLIF(OLD.legal_name, '')) THEN
    UPDATE contacts
    SET company = linked_company_name,
        updated_at = NOW()
    WHERE company_id = NEW.id
      AND account_id = NEW.account_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_contacts_after_company_rename ON companies;
CREATE TRIGGER sync_contacts_after_company_rename
  AFTER UPDATE OF trade_name, legal_name ON companies
  FOR EACH ROW EXECUTE FUNCTION public.sync_contacts_after_company_rename();

REVOKE ALL ON FUNCTION public.ensure_company_account_match() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_contact_company_legacy_fields() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_contacts_after_company_rename() FROM PUBLIC;

CREATE INDEX IF NOT EXISTS idx_contacts_company
  ON contacts(account_id, company_id)
  WHERE company_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_one_primary_per_company
  ON contacts(account_id, company_id)
  WHERE company_id IS NOT NULL AND is_primary_company_contact = TRUE;

CREATE INDEX IF NOT EXISTS idx_deals_company
  ON deals(account_id, company_id)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follow_ups_company
  ON follow_ups(account_id, company_id, due_at DESC)
  WHERE company_id IS NOT NULL;

-- Backfill companies from distinct legacy contacts.company values.
WITH source_names AS (
  SELECT
    account_id,
    (array_agg(user_id ORDER BY created_at, id))[1] AS user_id,
    trim(company) AS display_name,
    public.normalize_company_name(company) AS normalized_name
  FROM contacts
  WHERE company IS NOT NULL
    AND trim(company) <> ''
  GROUP BY account_id, public.normalize_company_name(company), trim(company)
),
deduped_names AS (
  SELECT DISTINCT ON (account_id, normalized_name)
    account_id,
    user_id,
    display_name,
    normalized_name
  FROM source_names
  WHERE normalized_name <> ''
  ORDER BY account_id, normalized_name, length(display_name), display_name
)
INSERT INTO companies(account_id, user_id, trade_name, normalized_name)
SELECT account_id, user_id, display_name, normalized_name
FROM deduped_names
WHERE NOT EXISTS (
  SELECT 1
  FROM companies existing
  WHERE existing.account_id = deduped_names.account_id
    AND existing.normalized_name = deduped_names.normalized_name
    AND existing.archived_at IS NULL
);

-- Link contacts when their legacy company text resolves to exactly one
-- active company in the same account.
WITH candidate_companies AS (
  SELECT
    account_id,
    normalized_name,
    id AS company_id,
    count(*) OVER (PARTITION BY account_id, normalized_name) AS candidate_count
  FROM companies
  WHERE archived_at IS NULL
),
candidate_links AS (
  SELECT
    c.id AS contact_id,
    candidate_companies.company_id,
    candidate_companies.candidate_count
  FROM contacts c
  JOIN candidate_companies
    ON candidate_companies.account_id = c.account_id
   AND candidate_companies.normalized_name = public.normalize_company_name(c.company)
  WHERE c.company_id IS NULL
    AND c.company IS NOT NULL
    AND trim(c.company) <> ''
)
UPDATE contacts c
SET company_id = candidate_links.company_id
FROM candidate_links
WHERE c.id = candidate_links.contact_id
  AND candidate_links.candidate_count = 1;

UPDATE deals d
SET company_id = c.company_id
FROM contacts c
WHERE d.contact_id = c.id
  AND d.company_id IS NULL
  AND c.company_id IS NOT NULL;

UPDATE follow_ups f
SET company_id = c.company_id
FROM contacts c
WHERE f.contact_id = c.id
  AND f.company_id IS NULL
  AND c.company_id IS NOT NULL;

ALTER TABLE follow_ups
  DROP CONSTRAINT IF EXISTS follow_ups_has_context;

ALTER TABLE follow_ups
  ADD CONSTRAINT follow_ups_has_context CHECK (
    company_id IS NOT NULL
    OR contact_id IS NOT NULL
    OR deal_id IS NOT NULL
    OR conversation_id IS NOT NULL
  );
