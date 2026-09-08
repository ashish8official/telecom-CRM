CREATE TABLE idempotency_record (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    request_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),
    response_status INT,
    response_payload JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    
    CONSTRAINT pk_idempotency_record PRIMARY KEY (id),
    CONSTRAINT uq_idempotency_key UNIQUE (tenant_id, operation, idempotency_key),
    CONSTRAINT chk_idempotency_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED'))
);

CREATE TRIGGER trg_idempotency_record_updated_at
BEFORE UPDATE ON idempotency_record
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Drop idempotency_key from subscriber table
ALTER TABLE subscriber DROP CONSTRAINT IF EXISTS uq_subscriber_idempotency;
DROP INDEX IF EXISTS idx_subscriber_idempotency_not_null;
ALTER TABLE subscriber DROP COLUMN IF EXISTS idempotency_key;
