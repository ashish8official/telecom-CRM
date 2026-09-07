CREATE TABLE customer (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    party_id UUID NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    customer_category VARCHAR(100),
    customer_segment VARCHAR(100),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255),
    
    CONSTRAINT pk_customer PRIMARY KEY (id),
    CONSTRAINT uq_customer_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_customer_party FOREIGN KEY (tenant_id, party_id) REFERENCES party(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT chk_customer_status CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED')),
    CONSTRAINT chk_customer_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- Partial Unique Index to enforce Cardinality:
-- One Party can have at most one ACTIVE or SUSPENDED customer relationship per tenant.
-- Allows having historical (TERMINATED) relationships while preventing multiple active ones.
CREATE UNIQUE INDEX uq_party_active_customer 
ON customer (tenant_id, party_id) 
WHERE status IN ('ACTIVE', 'SUSPENDED');

CREATE TRIGGER trg_customer_updated_at
BEFORE UPDATE ON customer
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
