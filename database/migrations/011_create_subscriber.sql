CREATE TABLE subscriber (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    subscriber_code VARCHAR(100) NOT NULL,
    customer_account_id UUID NOT NULL,
    service_category VARCHAR(100) NOT NULL,
    service_mode VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    
    -- Geographic Context (Optional)
    location_level VARCHAR(50),
    location_code VARCHAR(100),
    location_external_id VARCHAR(255),
    
    -- Concurrency and Idempotency
    version INT NOT NULL DEFAULT 1,
    idempotency_key VARCHAR(255),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255),
    
    CONSTRAINT pk_subscriber PRIMARY KEY (id),
    CONSTRAINT uq_subscriber_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_subscriber_code UNIQUE (tenant_id, subscriber_code),
    CONSTRAINT uq_subscriber_idempotency UNIQUE (tenant_id, idempotency_key),
    
    CONSTRAINT fk_subscriber_account FOREIGN KEY (tenant_id, customer_account_id) REFERENCES customer_account(tenant_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_subscriber_status CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'BARRED', 'DISCONNECTED', 'TERMINATED'))
);

CREATE UNIQUE INDEX idx_subscriber_idempotency_not_null ON subscriber(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- Ensure idempotency key is unique only where not null, so drop the standard unique constraint if it enforces global null uniqueness in older PG versions, but modern PG ignores nulls in UNIQUE. Just to be safe:
ALTER TABLE subscriber DROP CONSTRAINT uq_subscriber_idempotency;
ALTER TABLE subscriber ADD CONSTRAINT uq_subscriber_idempotency UNIQUE (tenant_id, idempotency_key);

CREATE TABLE subscriber_status_history (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    subscriber_id UUID NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    reason_description TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by VARCHAR(255),
    
    CONSTRAINT pk_subscriber_status_history PRIMARY KEY (id),
    CONSTRAINT fk_ssh_subscriber FOREIGN KEY (tenant_id, subscriber_id) REFERENCES subscriber(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_subscriber_account ON subscriber(tenant_id, customer_account_id);
CREATE INDEX idx_ssh_subscriber ON subscriber_status_history(tenant_id, subscriber_id);

CREATE TRIGGER trg_subscriber_updated_at
BEFORE UPDATE ON subscriber
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
