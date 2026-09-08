-- Rollback for Fix 2
CREATE INDEX idx_party_tenant ON party(tenant_id, id);

-- Rollback for Fix 1
DROP INDEX IF EXISTS idx_customer_account_parent;
DROP INDEX IF EXISTS idx_customer_account_customer;
DROP INDEX IF EXISTS idx_customer_party;
