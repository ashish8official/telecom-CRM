DROP TRIGGER IF EXISTS trg_customer_updated_at ON customer;
DROP INDEX IF EXISTS uq_party_active_customer;
DROP TABLE IF EXISTS customer CASCADE;
