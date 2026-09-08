import { Pool, PoolClient } from 'pg';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { IIdempotencyManager, IdempotencyRecord, IdempotencyStatus } from '../../domain/common/idempotency/IIdempotencyManager';
import { IdempotencyKeyReusedWithDifferentRequestError, IdempotencyRequestInProgressError } from '../../domain/common/idempotency/IdempotencyErrors';

export class PostgresIdempotencyManager implements IIdempotencyManager {
    constructor(private pool: Pool) {}

    private getClient(tx?: ITransaction): PoolClient | Pool {
        return tx ? tx.getConnection() : this.pool;
    }

    async checkOrAcquire(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        requestHash: string,
        tx?: ITransaction
    ): Promise<IdempotencyRecord | null> {
        const client = this.getClient(tx);

        // Attempt to insert as IN_PROGRESS
        const res = await client.query(
            `INSERT INTO idempotency_record (tenant_id, operation, idempotency_key, request_hash, status) 
             VALUES ($1, $2, $3, $4, 'IN_PROGRESS') 
             ON CONFLICT (tenant_id, operation, idempotency_key) DO NOTHING
             RETURNING *`,
            [tenantId, operation, idempotencyKey, requestHash]
        );
        
        if (res.rowCount && res.rowCount > 0) {
            return null; // Successfully acquired lock
        }

        // If we reach here, record exists
        const existingRes = await client.query(
            `SELECT * FROM idempotency_record WHERE tenant_id = $1 AND operation = $2 AND idempotency_key = $3`,
            [tenantId, operation, idempotencyKey]
        );
        
        if (existingRes.rowCount === 0) {
            throw new Error("Concurrency collision but record not found."); // Should theoretically not happen
        }
        
        const existing = existingRes.rows[0];

        // Check request hash
        if (existing.request_hash !== requestHash) {
            throw new IdempotencyKeyReusedWithDifferentRequestError(operation, idempotencyKey);
        }

        if (existing.status === 'IN_PROGRESS') {
            throw new IdempotencyRequestInProgressError(operation, idempotencyKey);
        }

        return {
            id: existing.id,
            tenantId: existing.tenant_id,
            idempotencyKey: existing.idempotency_key,
            operation: existing.operation,
            requestHash: existing.request_hash,
            status: existing.status as IdempotencyStatus,
            resourceType: existing.resource_type,
            resourceId: existing.resource_id,
            responseStatus: existing.response_status,
            responsePayload: existing.response_payload,
            createdAt: existing.created_at,
            updatedAt: existing.updated_at
        };
    }

    async complete(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        resourceType: string,
        resourceId: string,
        responseStatus: number,
        responsePayload: any,
        tx?: ITransaction
    ): Promise<void> {
        const client = this.getClient(tx);
        await client.query(
            `UPDATE idempotency_record 
             SET status = 'COMPLETED', resource_type = $1, resource_id = $2, response_status = $3, response_payload = $4 
             WHERE tenant_id = $5 AND operation = $6 AND idempotency_key = $7`,
            [resourceType, resourceId, responseStatus, responsePayload, tenantId, operation, idempotencyKey]
        );
    }

    async fail(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        responseStatus: number,
        responsePayload: any,
        tx?: ITransaction
    ): Promise<void> {
        const client = this.getClient(tx);
        await client.query(
            `UPDATE idempotency_record 
             SET status = 'FAILED', response_status = $1, response_payload = $2 
             WHERE tenant_id = $3 AND operation = $4 AND idempotency_key = $5`,
            [responseStatus, responsePayload, tenantId, operation, idempotencyKey]
        );
    }
}
