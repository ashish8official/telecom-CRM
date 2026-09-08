ALTER TABLE subscriber ADD COLUMN idempotency_key VARCHAR(255);
ALTER TABLE subscriber ADD CONSTRAINT uq_subscriber_idempotency UNIQUE (tenant_id, idempotency_key);

DROP TRIGGER IF EXISTS trg_idempotency_record_updated_at ON idempotency_record;
DROP TABLE IF EXISTS idempotency_record CASCADE;
