-- Fix 1: Add missing foreign key / relationship indexes
CREATE INDEX idx_customer_party ON customer(tenant_id, party_id);
CREATE INDEX idx_customer_account_customer ON customer_account(tenant_id, customer_id);
CREATE INDEX idx_customer_account_parent ON customer_account(tenant_id, parent_account_id);

-- Fix 2: Remove redundant index (duplicates uq_party_tenant_id UNIQUE constraint)
DROP INDEX IF EXISTS idx_party_tenant;
