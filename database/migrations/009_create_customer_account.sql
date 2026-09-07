CREATE TABLE customer_account (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    parent_account_id UUID,
    account_level VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    billing_responsible_flag BOOLEAN NOT NULL,
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(255),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by VARCHAR(255),
    
    CONSTRAINT pk_customer_account PRIMARY KEY (id),
    CONSTRAINT uq_customer_account_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT fk_ca_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT fk_ca_parent FOREIGN KEY (tenant_id, parent_account_id) REFERENCES customer_account(tenant_id, id) ON DELETE RESTRICT,
    
    CONSTRAINT chk_ca_no_self_parent CHECK (parent_account_id IS NULL OR parent_account_id <> id),
    CONSTRAINT chk_ca_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
    CONSTRAINT chk_ca_level CHECK (account_level IN ('MASTER', 'CHILD')),
    
    -- Master vs Child strictly enforced
    CONSTRAINT chk_ca_rules CHECK (
        (account_level = 'MASTER' AND parent_account_id IS NULL AND billing_responsible_flag = true)
        OR
        (account_level = 'CHILD' AND parent_account_id IS NOT NULL AND billing_responsible_flag = false)
    ),
    
    CONSTRAINT chk_ca_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TRIGGER trg_customer_account_updated_at
BEFORE UPDATE ON customer_account
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
