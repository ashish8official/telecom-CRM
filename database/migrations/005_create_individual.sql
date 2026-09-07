CREATE TABLE individual (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    party_id UUID NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    middle_name VARCHAR(255),
    last_name VARCHAR(255) NOT NULL,
    title VARCHAR(50),
    gender VARCHAR(50),
    date_of_birth DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_individual PRIMARY KEY (id),
    CONSTRAINT fk_individual_party FOREIGN KEY (tenant_id, party_id) REFERENCES party(tenant_id, id) ON DELETE CASCADE,
    CONSTRAINT uq_individual_party UNIQUE (tenant_id, party_id)
);

CREATE TRIGGER trg_individual_updated_at
BEFORE UPDATE ON individual
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
