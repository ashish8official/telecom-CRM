CREATE TABLE party (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    party_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255),
    deleted_at TIMESTAMPTZ,
    
    CONSTRAINT pk_party PRIMARY KEY (id),
    CONSTRAINT fk_party_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE RESTRICT,
    CONSTRAINT uq_party_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT chk_party_type CHECK (party_type IN ('INDIVIDUAL', 'ORGANIZATION')),
    CONSTRAINT chk_party_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'TERMINATED'))
);

CREATE TRIGGER trg_party_updated_at
BEFORE UPDATE ON party
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
