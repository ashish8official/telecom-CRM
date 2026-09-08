import { ITransaction } from '../transaction/ITransaction';

export enum IdempotencyStatus {
    IN_PROGRESS = 'IN_PROGRESS',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED'
}

export interface IdempotencyRecord {
    id: string;
    tenantId: string;
    idempotencyKey: string;
    operation: string;
    requestHash: string;
    status: IdempotencyStatus;
    resourceType?: string;
    resourceId?: string;
    responseStatus?: number;
    responsePayload?: any;
    createdAt: Date;
    updatedAt: Date;
}

export interface IIdempotencyManager {
    /**
     * Checks if an idempotency key exists, validates the request hash, and if not exists, creates it as IN_PROGRESS.
     */
    checkOrAcquire(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        requestHash: string,
        tx?: ITransaction
    ): Promise<IdempotencyRecord | null>; // Returns null if acquired (meaning you should proceed), or the existing record if already exists (completed or failed). Throws if in progress or hash mismatch.

    /**
     * Completes an idempotency record with success.
     */
    complete(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        resourceType: string,
        resourceId: string,
        responseStatus: number,
        responsePayload: any,
        tx?: ITransaction
    ): Promise<void>;

    /**
     * Marks an idempotency record as failed (validation or internal error).
     */
    fail(
        tenantId: string,
        operation: string,
        idempotencyKey: string,
        responseStatus: number,
        responsePayload: any,
        tx?: ITransaction
    ): Promise<void>;
}
