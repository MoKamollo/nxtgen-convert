-- Governed loyalty programs, append-only points ledger, referrals, tiers, and fraud review.
CREATE TABLE IF NOT EXISTS loyalty_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','paused','archived')),
  active_version_id uuid,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_programs_org_id_uidx ON loyalty_programs(organization_id,id);
CREATE INDEX IF NOT EXISTS loyalty_programs_org_status_idx ON loyalty_programs(organization_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS loyalty_program_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_id uuid NOT NULL REFERENCES loyalty_programs(id),
  version integer NOT NULL,
  definition jsonb NOT NULL,
  checksum text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_program_versions_number_uidx ON loyalty_program_versions(organization_id,program_id,version);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_program_versions_checksum_uidx ON loyalty_program_versions(organization_id,program_id,checksum);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_program_versions_org_id_uidx ON loyalty_program_versions(organization_id,id);
ALTER TABLE loyalty_programs
  ADD CONSTRAINT loyalty_programs_active_version_fk FOREIGN KEY (active_version_id) REFERENCES loyalty_program_versions(id) NOT VALID;

CREATE TABLE IF NOT EXISTS loyalty_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_version_id uuid NOT NULL REFERENCES loyalty_program_versions(id),
  name text NOT NULL,
  minimum_lifetime_points integer NOT NULL DEFAULT 0 CHECK (minimum_lifetime_points >= 0),
  benefits jsonb NOT NULL DEFAULT '[]'::jsonb,
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_tiers_name_uidx ON loyalty_tiers(organization_id,program_version_id,name);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_tiers_org_id_uidx ON loyalty_tiers(organization_id,id);
CREATE INDEX IF NOT EXISTS loyalty_tiers_threshold_idx ON loyalty_tiers(organization_id,program_version_id,minimum_lifetime_points);

CREATE TABLE IF NOT EXISTS loyalty_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_id uuid NOT NULL REFERENCES loyalty_programs(id),
  contact_id uuid NOT NULL REFERENCES contacts(id),
  current_balance integer NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  lifetime_earned integer NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_redeemed integer NOT NULL DEFAULT 0 CHECK (lifetime_redeemed >= 0),
  current_tier_id uuid REFERENCES loyalty_tiers(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_contact_program_uidx ON loyalty_accounts(organization_id,program_id,contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_accounts_org_id_uidx ON loyalty_accounts(organization_id,id);
CREATE INDEX IF NOT EXISTS loyalty_accounts_tier_idx ON loyalty_accounts(organization_id,program_id,current_tier_id);

CREATE TABLE IF NOT EXISTS loyalty_point_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  account_id uuid NOT NULL REFERENCES loyalty_accounts(id),
  program_version_id uuid NOT NULL REFERENCES loyalty_program_versions(id),
  transaction_type text NOT NULL CHECK (transaction_type IN ('earn','redeem','adjustment','expiration','reversal','hold_release')),
  points integer NOT NULL CHECK (points <> 0),
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','held','rejected')),
  source_type text NOT NULL,
  source_id text,
  description text,
  idempotency_key text NOT NULL,
  related_transaction_id uuid REFERENCES loyalty_point_transactions(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id),
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_point_transactions_idempotency_uidx ON loyalty_point_transactions(organization_id,idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_point_transactions_org_id_uidx ON loyalty_point_transactions(organization_id,id);
CREATE INDEX IF NOT EXISTS loyalty_point_transactions_account_idx ON loyalty_point_transactions(organization_id,account_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS loyalty_point_transactions_status_idx ON loyalty_point_transactions(organization_id,status,created_at DESC);

CREATE OR REPLACE FUNCTION nxtgen_prevent_loyalty_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Loyalty point transactions are append-only';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS loyalty_point_transactions_immutable ON loyalty_point_transactions;
CREATE TRIGGER loyalty_point_transactions_immutable BEFORE UPDATE OR DELETE ON loyalty_point_transactions
FOR EACH ROW EXECUTE FUNCTION nxtgen_prevent_loyalty_ledger_mutation();

CREATE TABLE IF NOT EXISTS customer_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  program_id uuid NOT NULL REFERENCES loyalty_programs(id),
  referrer_contact_id uuid NOT NULL REFERENCES contacts(id),
  referred_contact_id uuid REFERENCES contacts(id),
  referral_code_hash text NOT NULL,
  referral_code_hint text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','qualified','rewarded','rejected','cancelled')),
  qualification_event text,
  qualified_at timestamp,
  rewarded_at timestamp,
  reward_transaction_id uuid REFERENCES loyalty_point_transactions(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (referred_contact_id IS NULL OR referred_contact_id <> referrer_contact_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_referrals_code_uidx ON customer_referrals(organization_id,referral_code_hash);
CREATE UNIQUE INDEX IF NOT EXISTS customer_referrals_org_id_uidx ON customer_referrals(organization_id,id);
CREATE INDEX IF NOT EXISTS customer_referrals_referrer_idx ON customer_referrals(organization_id,program_id,referrer_contact_id,status);
CREATE INDEX IF NOT EXISTS customer_referrals_referred_idx ON customer_referrals(organization_id,program_id,referred_contact_id,status);

CREATE TABLE IF NOT EXISTS loyalty_fraud_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  transaction_id uuid REFERENCES loyalty_point_transactions(id),
  referral_id uuid REFERENCES customer_referrals(id),
  risk_level text NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected','resolved')),
  reason_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  assigned_user_id uuid REFERENCES users(id),
  resolution_notes text,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CHECK (transaction_id IS NOT NULL OR referral_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_fraud_reviews_transaction_uidx ON loyalty_fraud_reviews(organization_id,transaction_id) WHERE transaction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS loyalty_fraud_reviews_referral_uidx ON loyalty_fraud_reviews(organization_id,referral_id) WHERE referral_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS loyalty_fraud_reviews_open_idx ON loyalty_fraud_reviews(organization_id,status,risk_level,created_at DESC);

DO $$
DECLARE table_name text;
DECLARE policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'loyalty_programs','loyalty_program_versions','loyalty_tiers','loyalty_accounts',
    'loyalty_point_transactions','customer_referrals','loyalty_fraud_reviews'
  ]
  LOOP
    policy_name := table_name || '_tenant_isolation';
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname=current_schema() AND tablename=table_name AND policyname=policy_name) THEN
      EXECUTE format('CREATE POLICY %I ON %I USING (organization_id = nxtgen_current_tenant()) WITH CHECK (organization_id = nxtgen_current_tenant())', policy_name, table_name);
    END IF;
  END LOOP;
END $$;
