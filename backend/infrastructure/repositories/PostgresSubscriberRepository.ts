import { Pool, PoolClient } from 'pg';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { CreateSubscriberInput, Subscriber, SubscriberStatusHistory, SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { DuplicateSubscriberError, ConcurrentModificationError } from '../../domain/subscriber/SubscriberErrors';

export class PostgresSubscriberRepository implements ISubscriberRepository {

    constructor(private pool: Pool) {}

    private getClient(tx?: ITransaction): PoolClient | Pool {
        return tx ? tx.getConnection() : this.pool;
    }

    private mapToSubscriber(row: any): Subscriber {
        const sub: Subscriber = {
            id: row.id,
            tenantId: row.tenant_id,
            subscriberCode: row.subscriber_code,
            customerAccountId: row.customer_account_id,
            serviceCategory: row.service_category,
            serviceMode: row.service_mode,
            status: row.status as SubscriberStatus,
            version: row.version,
            createdAt: row.created_at,
            createdBy: row.created_by,
            updatedAt: row.updated_at,
            updatedBy: row.updated_by
        };

        if (row.location_level || row.location_code || row.location_external_id) {
            sub.geographic = {
                level: row.location_level,
                code: row.location_code,
                externalId: row.location_external_id
            };
        }

        return sub;
    }

    async createSubscriber(tenantId: string, data: CreateSubscriberInput, tx?: ITransaction): Promise<Subscriber> {
        const client = this.getClient(tx);
        try {
            const res = await client.query(
                `INSERT INTO subscriber (
                    tenant_id, subscriber_code, customer_account_id, service_category, service_mode, 
                    location_level, location_code, location_external_id, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING *`,
                [
                    tenantId, 
                    data.subscriberCode, 
                    data.customerAccountId, 
                    data.serviceCategory, 
                    data.serviceMode,
                    data.geographic?.level || null,
                    data.geographic?.code || null,
                    data.geographic?.externalId || null,
                    data.createdBy || null
                ]
            );
            return this.mapToSubscriber(res.rows[0]);
        } catch (e: any) {
            if (e.code === '23505') { console.log('UNIQUE VIOLATION on:', e.constraint); } { // Unique violation
                throw new DuplicateSubscriberError(data.subscriberCode || 'UNKNOWN', tenantId);
            }
            throw e;
        }
    }

    async getSubscriber(tenantId: string, subscriberId: string, tx?: ITransaction): Promise<Subscriber | null> {
        const client = this.getClient(tx);
        const res = await client.query(`SELECT * FROM subscriber WHERE tenant_id = $1 AND id = $2`, [tenantId, subscriberId]);
        if (res.rowCount === 0) return null;
        return this.mapToSubscriber(res.rows[0]);
    }

    async getSubscriberByCode(tenantId: string, subscriberCode: string, tx?: ITransaction): Promise<Subscriber | null> {
        const client = this.getClient(tx);
        const res = await client.query(`SELECT * FROM subscriber WHERE tenant_id = $1 AND subscriber_code = $2`, [tenantId, subscriberCode]);
        if (res.rowCount === 0) return null;
        return this.mapToSubscriber(res.rows[0]);
    }

    async updateSubscriberStatus(tenantId: string, subscriberId: string, newStatus: string, version: number, updatedBy?: string, tx?: ITransaction): Promise<Subscriber> {
        const client = this.getClient(tx);
        const res = await client.query(
            `UPDATE subscriber 
             SET status = $1, version = version + 1, updated_by = $2 
             WHERE tenant_id = $3 AND id = $4 AND version = $5
             RETURNING *`,
            [newStatus, updatedBy || null, tenantId, subscriberId, version]
        );
        if (res.rowCount === 0) {
            throw new ConcurrentModificationError(subscriberId);
        }
        return this.mapToSubscriber(res.rows[0]);
    }

    async insertStatusHistory(tenantId: string, data: Omit<SubscriberStatusHistory, 'id' | 'tenantId' | 'changedAt'>, tx?: ITransaction): Promise<SubscriberStatusHistory> {
        const client = this.getClient(tx);
        const res = await client.query(
            `INSERT INTO subscriber_status_history (
                tenant_id, subscriber_id, previous_status, new_status, reason_code, reason_description, changed_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [tenantId, data.subscriberId, data.previousStatus || null, data.newStatus, data.reasonCode, data.reasonDescription || null, data.changedBy || null]
        );
        const row = res.rows[0];
        return {
            id: row.id,
            tenantId: row.tenant_id,
            subscriberId: row.subscriber_id,
            previousStatus: row.previous_status,
            newStatus: row.new_status,
            reasonCode: row.reason_code,
            reasonDescription: row.reason_description,
            changedAt: row.changed_at,
            changedBy: row.changed_by
        };
    }

    async findSubscribersByAccountIds(tenantId: string, accountIds: string[], tx?: ITransaction): Promise<Subscriber[]> {
        if (!accountIds || accountIds.length === 0) return [];
        const client = this.getClient(tx);
        const res = await client.query(
            `SELECT * FROM subscriber WHERE tenant_id = $1 AND customer_account_id = ANY($2)`,
            [tenantId, accountIds]
        );
        return res.rows.map(row => this.mapToSubscriber(row));
    }
}
