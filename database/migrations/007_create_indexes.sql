-- Tenant scoped Party lookup
CREATE INDEX idx_party_tenant ON party(tenant_id, id);

-- Party type filtering
CREATE INDEX idx_party_type ON party(tenant_id, party_type);

-- Active Party lookup (partial index for active records)
CREATE INDEX idx_active_party ON party(tenant_id, id) WHERE deleted_at IS NULL;

-- Individual name lookup (B-tree on last_name for sorting/prefix search)
CREATE INDEX idx_individual_last_name ON individual(tenant_id, last_name);

-- Organization legal name lookup
CREATE INDEX idx_org_legal_name ON organization(tenant_id, legal_name);
