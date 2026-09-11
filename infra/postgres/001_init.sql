CREATE TABLE IF NOT EXISTS app_user (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exchange_connection (
  id UUID PRIMARY KEY,
  environment TEXT NOT NULL CHECK (environment IN ('testnet','live')),
  api_key TEXT NOT NULL,
  encrypted_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(environment)
);
ALTER TABLE exchange_connection ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_event (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  environment TEXT,
  client_order_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS audit_client_order_id_unique ON audit_event(client_order_id) WHERE client_order_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS candidate_pool (
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  environment TEXT NOT NULL CHECK (environment IN ('testnet','live')),
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('LONG','SHORT')),
  rule_hash TEXT NOT NULL,
  closed_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, environment, symbol)
);
CREATE INDEX IF NOT EXISTS candidate_pool_valid_idx ON candidate_pool(user_id, environment, expires_at);
