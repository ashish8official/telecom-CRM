import { Pool, PoolClient } from 'pg';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { CreateCustomerInput, Customer, CustomerStatus, UpdateCustomerInput } from '../../domain/customer/CustomerTypes';

export class PostgresCustomerRepository implements ICustomerRepository {
    constructor(private pool: Pool) {}

    private getClient(tx?: ITransaction): PoolClient | Pool {
        return tx ? tx.getConnection() as PoolClient : this.pool;
    }

    private mapToCustomer(row: any): Customer {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            partyId: row.party_id,
            status: row.status as CustomerStatus,
            customerCategory: row.customer_category,
            customerSegment: row.customer_segment,
            effectiveFrom: row.effective_from,
            effectiveTo: row.effective_to,
            version: row.version,
            createdAt: row.created_at,
            createdBy: row.created_by,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by
        };
    }

    async createCustomer(tenantId: string, data: CreateCustomerInput, tx?: ITransaction): Promise<Customer> {
        const client = this.getClient(tx);
        const res = await client.query(
            `INSERT INTO customer (
                tenant_id, party_id, status, customer_category, customer_segment, effective_from, effective_to, created_by
            ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8) RETURNING *`,
            [
                tenantId, 
                data.partyId, 
                data.status || CustomerStatus.ACTIVE, 
                data.customerCategory, 
                data.customerSegment, 
                data.effectiveFrom, 
                data.effectiveTo,
                data.createdBy
            ]
        );
        return this.mapToCustomer(res.rows[0]);
    }

    async getCustomerById(tenantId: string, customerId: string, tx?: ITransaction): Promise<Customer | null> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM customer WHERE tenant_id = $1 AND id = $2`,
            [tenantId, customerId]
        );
        if (res.rowCount === 0) return null;
        return this.mapToCustomer(res.rows[0]);
    }

    async getCustomerByPartyId(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM customer WHERE tenant_id = $1 AND party_id = $2 ORDER BY created_at DESC LIMIT 1`,
            [tenantId, partyId]
        );
        if (res.rowCount === 0) return null;
        return this.mapToCustomer(res.rows[0]);
    }

    async updateCustomer(tenantId: string, customerId: string, data: UpdateCustomerInput, tx?: ITransaction): Promise<Customer> {
        const client = this.getClient(tx);
        const res = await client.query(
            `UPDATE customer 
             SET customer_category = COALESCE($1, customer_category),
                 customer_segment = COALESCE($2, customer_segment),
                 effective_to = COALESCE($3, effective_to),
                 updated_by = COALESCE($4, updated_by),
                 version = version + 1
             WHERE tenant_id = $5 AND id = $6 RETURNING *`,
            [data.customerCategory, data.customerSegment, data.effectiveTo, data.updatedBy, tenantId, customerId]
        );
        return this.mapToCustomer(res.rows[0]);
    }

    async updateCustomerStatus(
        tenantId: string, 
        customerId: string, 
        status: CustomerStatus, 
        version: number,
        updatedBy?: string, 
        tx?: ITransaction
    ): Promise<Customer> {
        const client = this.getClient(tx);
        const res = await client.query(
            `UPDATE customer SET status = $1, updated_by = $2, version = version + 1 
             WHERE tenant_id = $3 AND id = $4 AND version = $5 RETURNING *`,
            [status, updatedBy, tenantId, customerId, version]
        );
        if (res.rowCount === 0) {
            throw new Error(`Customer status update failed: Concurrent modification or not found. (version: ${version})`);
        }
        return this.mapToCustomer(res.rows[0]);
    }
    
    async insertStatusHistory(tenantId: string, data: any, tx?: ITransaction): Promise<any> {
        const client = this.getClient(tx);
        const res = await client.query(
            `INSERT INTO customer_status_history (
                tenant_id, customer_id, previous_status, new_status, reason_code, reason_description, changed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [tenantId, data.customerId, data.previousStatus || null, data.newStatus, data.reasonCode, data.reasonDescription || null, data.changedBy || null]
        );
        const row = res.rows[0];
        return {
            id: row.id,
            tenantId: row.tenant_id,
            customerId: row.customer_id,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reasonCode: row.reason_code,
            reasonDescription: row.reason_description,
            changedAt: row.changed_at,
            changedBy: row.changed_by
        };
    }

    async findExistingActiveCustomer(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM customer 
             WHERE tenant_id = $1 AND party_id = $2 AND status IN ('ACTIVE', 'SUSPENDED')`,
            [tenantId, partyId]
        );
        if (res.rowCount === 0) return null;
        return this.mapToCustomer(res.rows[0]);
    }
}
