import { Pool, PoolClient } from 'pg';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { CustomerAccount, AccountStatus, AccountLevel, UpdateCustomerAccountInput } from '../../domain/customer_account/CustomerAccountTypes';

export class PostgresCustomerAccountRepository implements ICustomerAccountRepository {
    constructor(private pool: Pool) {}

    private getClient(tx?: ITransaction): PoolClient | Pool {
        return tx ? tx.getConnection() as PoolClient : this.pool;
    }

    private mapToAccount(row: any): CustomerAccount {
        return {
            id: row.id,
            tenantId: row.tenant_id,
            customerId: row.customer_id,
            parentAccountId: row.parent_account_id,
            accountLevel: row.account_level as AccountLevel,
            status: row.status as AccountStatus,
            billingResponsibleFlag: row.billing_responsible_flag,
            effectiveFrom: row.effective_from,
            effectiveTo: row.effective_to,
            version: row.version,
            createdAt: row.created_at,
            createdBy: row.created_by,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by
        };
    }

    async createAccount(
        tenantId: string, 
        data: { customerId: string, parentAccountId: string | null, accountLevel: AccountLevel, billingResponsibleFlag: boolean, effectiveFrom: Date, effectiveTo?: Date, createdBy?: string }, 
        tx?: ITransaction
    ): Promise<CustomerAccount> {
        const client = this.getClient(tx);
        const res = await client.query(
            `INSERT INTO customer_account (
                tenant_id, customer_id, parent_account_id, account_level, billing_responsible_flag, effective_from, effective_to, created_by
            ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()), $7, $8) RETURNING *`,
            [
                tenantId, 
                data.customerId, 
                data.parentAccountId, 
                data.accountLevel, 
                data.billingResponsibleFlag, 
                data.effectiveFrom, 
                data.effectiveTo, 
                data.createdBy
            ]
        );
        return this.mapToAccount(res.rows[0]);
    }

    async findAccountById(tenantId: string, accountId: string, tx?: ITransaction): Promise<CustomerAccount | null> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM customer_account WHERE tenant_id = $1 AND id = $2`,
            [tenantId, accountId]
        );
        if (res.rowCount === 0) return null;
        return this.mapToAccount(res.rows[0]);
    }

    async findAccountsByCustomerId(tenantId: string, customerId: string, tx?: ITransaction): Promise<CustomerAccount[]> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM customer_account WHERE tenant_id = $1 AND customer_id = $2 ORDER BY created_at ASC`,
            [tenantId, customerId]
        );
        return res.rows.map(row => this.mapToAccount(row));
    }

    async hasActiveChildren(tenantId: string, accountId: string, tx?: ITransaction): Promise<boolean> {
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT 1 FROM customer_account 
             WHERE tenant_id = $1 AND parent_account_id = $2 AND status IN ('ACTIVE', 'SUSPENDED') 
             LIMIT 1`,
            [tenantId, accountId]
        );
        return res.rowCount !== null && res.rowCount > 0;
    }

    async updateAccount(tenantId: string, accountId: string, data: UpdateCustomerAccountInput, tx?: ITransaction): Promise<CustomerAccount> {
        const client = this.getClient(tx);
        const res = await client.query(
            `UPDATE customer_account 
             SET effective_to = COALESCE($1, effective_to),
                 updated_by = COALESCE($2, updated_by),
                 version = version + 1
             WHERE tenant_id = $3 AND id = $4 RETURNING *`,
            [data.effectiveTo, data.updatedBy, tenantId, accountId]
        );
        return this.mapToAccount(res.rows[0]);
    }

    async updateAccountStatus(
        tenantId: string, 
        accountId: string, 
        status: AccountStatus, 
        version: number,
        updatedBy?: string, 
        tx?: ITransaction
    ): Promise<CustomerAccount> {
        const client = this.getClient(tx);
        const res = await client.query(
            `UPDATE customer_account SET status = $1, updated_by = $2, version = version + 1 
             WHERE tenant_id = $3 AND id = $4 AND version = $5 RETURNING *`,
            [status, updatedBy, tenantId, accountId, version]
        );
        if (res.rowCount === 0) {
            throw new Error(`Account status update failed: Concurrent modification or not found. (version: ${version})`);
        }
        return this.mapToAccount(res.rows[0]);
    }

    async insertStatusHistory(tenantId: string, data: any, tx?: ITransaction): Promise<any> {
        const client = this.getClient(tx);
        const res = await client.query(
            `INSERT INTO customer_account_status_history (
                tenant_id, customer_account_id, previous_status, new_status, reason_code, reason_description, changed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [tenantId, data.customerAccountId, data.previousStatus || null, data.newStatus, data.reasonCode, data.reasonDescription || null, data.changedBy || null]
        );
        const row = res.rows[0];
        return {
            id: row.id,
            tenantId: row.tenant_id,
            customerAccountId: row.customer_account_id,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reasonCode: row.reason_code,
            reasonDescription: row.reason_description,
            changedAt: row.changed_at,
            changedBy: row.changed_by
        };
    }
}
