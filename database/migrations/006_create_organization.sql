CREATE TABLE organization (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    party_id UUID NOT NULL,
    legal_name VARCHAR(255) NOT NULL,
    trading_name VARCHAR(255),
    registration_number VARCHAR(100),
    established_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_organization PRIMARY KEY (id),
    CONSTRAINT fk_organization_party FOREIGN KEY (tenant_id, party_id) REFERENCES party(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_organization_party UNIQUE (tenant_id, party_id)
);

CREATE TRIGGER trg_organization_updated_at
BEFORE UPDATE ON organization
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
