import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { ChangeSubscriberStatusInput, Subscriber, SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { SubscriberNotFoundError, InvalidSubscriberStatusTransitionError } from '../../domain/subscriber/SubscriberErrors';
import { IIdempotencyManager } from '../../domain/common/idempotency/IIdempotencyManager';
import * as crypto from 'crypto';

export class ChangeSubscriberStatus {
    constructor(
        private subscriberRepo: ISubscriberRepository,
        private txManager: ITransactionManager,
        private idempotencyManager?: IIdempotencyManager
    ) {}

    private hashRequest(input: ChangeSubscriberStatusInput): string {
        return crypto.createHash('sha256').update(JSON.stringify({
            newStatus: input.newStatus,
            reasonCode: input.reasonCode
        })).digest('hex');
    }

    async execute(tenantId: string, subscriberId: string, input: ChangeSubscriberStatusInput, idempotencyKey?: string): Promise<Subscriber> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!subscriberId) throw new ValidationError("Subscriber ID is required");
        if (!input.newStatus) throw new ValidationError("New status is required");
        if (!input.reasonCode) throw new ValidationError("Reason code is required");
        if (input.version === undefined) throw new ValidationError("Version is required for concurrency control");

        const operation = 'CHANGE_SUBSCRIBER_STATUS';
        const requestHash = this.hashRequest(input);

        const tx = await this.txManager.beginTransaction();
        try {
            if (idempotencyKey && this.idempotencyManager) {
                const existingRecord = await this.idempotencyManager.checkOrAcquire(
                    tenantId,
                    operation,
                    idempotencyKey,
                    requestHash,
                    tx
                );

                if (existingRecord) {
                    if (existingRecord.status === 'COMPLETED') {
                        await tx.commit();
                        return existingRecord.responsePayload as Subscriber;
                    }
                }
            }

            const subscriber = await this.subscriberRepo.getSubscriber(tenantId, subscriberId, tx);
            if (!subscriber) {
                throw new SubscriberNotFoundError(subscriberId, tenantId);
            }

            this.validateTransition(subscriber.status, input.newStatus);

            const updatedSubscriber = await this.subscriberRepo.updateSubscriberStatus(
                tenantId,
                subscriberId,
                input.newStatus,
                input.version,
                input.updatedBy,
                tx
            );

            await this.subscriberRepo.insertStatusHistory(tenantId, {
                subscriberId: subscriberId,
                previousStatus: subscriber.status,
                newStatus: input.newStatus,
                reasonCode: input.reasonCode,
                reasonDescription: input.reasonDescription,
                changedBy: input.updatedBy
            }, tx);

            if (idempotencyKey && this.idempotencyManager) {
                await this.idempotencyManager.complete(
                    tenantId,
                    operation,
                    idempotencyKey,
                    'Subscriber',
                    subscriberId,
                    200,
                    updatedSubscriber,
                    tx
                );
            }

            await tx.commit();
            return updatedSubscriber;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }

    private validateTransition(current: SubscriberStatus, target: SubscriberStatus): void {
        if (current === target) {
            throw new InvalidSubscriberStatusTransitionError(current, target);
        }

        const validTransitions: Record<SubscriberStatus, SubscriberStatus[]> = {
            [SubscriberStatus.PENDING]: [SubscriberStatus.ACTIVE, SubscriberStatus.DISCONNECTED],
            [SubscriberStatus.ACTIVE]: [SubscriberStatus.SUSPENDED, SubscriberStatus.BARRED, SubscriberStatus.DISCONNECTED],
            [SubscriberStatus.SUSPENDED]: [SubscriberStatus.ACTIVE, SubscriberStatus.DISCONNECTED],
            [SubscriberStatus.BARRED]: [SubscriberStatus.ACTIVE, SubscriberStatus.DISCONNECTED],
            [SubscriberStatus.DISCONNECTED]: [SubscriberStatus.TERMINATED],
            [SubscriberStatus.TERMINATED]: []
        };

        const allowed = validTransitions[current];
        if (!allowed || !allowed.includes(target)) {
            throw new InvalidSubscriberStatusTransitionError(current, target);
        }
    }
}
