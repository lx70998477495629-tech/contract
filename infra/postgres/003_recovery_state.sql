ALTER TABLE order_intent DROP CONSTRAINT IF EXISTS order_intent_status_check;
ALTER TABLE order_intent ADD CONSTRAINT order_intent_status_check CHECK(status IN ('INTENT','SUBMITTING','ACCEPTED','REJECTED','UNKNOWN','RECOVERED','NOT_FOUND'));
ALTER TABLE order_intent ADD COLUMN IF NOT EXISTS recovery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_intent ADD COLUMN IF NOT EXISTS first_unknown_at TIMESTAMPTZ;
ALTER TABLE order_intent ADD COLUMN IF NOT EXISTS next_recovery_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS order_intent_recovery_due_idx ON order_intent(next_recovery_at) WHERE status IN ('SUBMITTING','UNKNOWN');
