import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { ChangeSubscriberStatusInput, Subscriber, SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { SubscriberNotFoundError, InvalidSubscriberStatusTransitionError } from '../../domain/subscriber/SubscriberErrors';

export class ChangeSubscriberStatus {
    constructor(
        private subscriberRepo: ISubscriberRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, subscriberId: string, input: ChangeSubscriberStatusInput): Promise<Subscriber> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!subscriberId) throw new ValidationError("Subscriber ID is required");
        if (!input.newStatus) throw new ValidationError("New status is required");
        if (!input.reasonCode) throw new ValidationError("Reason code is required");
        if (input.version === undefined) throw new ValidationError("Version is required for concurrency control");

        const tx = await this.txManager.beginTransaction();
        try {
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
