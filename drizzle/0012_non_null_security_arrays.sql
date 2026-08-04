-- Security-sensitive array columns must never be NULL. Existing NULL values are
-- normalized before the constraints are applied so this migration is additive.
UPDATE connector_accounts SET scopes = ARRAY[]::text[] WHERE scopes IS NULL;
UPDATE api_keys SET scopes = ARRAY[]::text[] WHERE scopes IS NULL;
UPDATE webhook_endpoints SET events = ARRAY[]::text[] WHERE events IS NULL;

ALTER TABLE connector_accounts ALTER COLUMN scopes SET DEFAULT ARRAY[]::text[];
ALTER TABLE connector_accounts ALTER COLUMN scopes SET NOT NULL;
ALTER TABLE api_keys ALTER COLUMN scopes SET DEFAULT ARRAY[]::text[];
ALTER TABLE api_keys ALTER COLUMN scopes SET NOT NULL;
ALTER TABLE webhook_endpoints ALTER COLUMN events SET DEFAULT ARRAY[]::text[];
ALTER TABLE webhook_endpoints ALTER COLUMN events SET NOT NULL;
