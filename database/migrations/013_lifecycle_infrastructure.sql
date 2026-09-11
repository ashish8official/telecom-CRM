-- Migration 013: Lifecycle Infrastructure
-- Adds version column for optimistic locking to customer and customer_account
-- Creates status history tables for customer and customer_account

ALTER TABLE customer ADD COLUMN version INT NOT NULL DEFAULT 1;
ALTER TABLE customer_account ADD COLUMN version INT NOT NULL DEFAULT 1;

CREATE TABLE customer_status_history (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    reason_description TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by VARCHAR(255),
    
    CONSTRAINT pk_customer_status_history PRIMARY KEY (id),
    CONSTRAINT fk_csh_customer FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_csh_customer ON customer_status_history(tenant_id, customer_id);

CREATE TABLE customer_account_status_history (
    id UUID DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL,
    customer_account_id UUID NOT NULL,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    reason_code VARCHAR(100) NOT NULL,
    reason_description TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    changed_by VARCHAR(255),
    
    CONSTRAINT pk_customer_account_status_history PRIMARY KEY (id),
    CONSTRAINT fk_cash_account FOREIGN KEY (tenant_id, customer_account_id) REFERENCES customer_account(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_cash_account ON customer_account_status_history(tenant_id, customer_account_id);
