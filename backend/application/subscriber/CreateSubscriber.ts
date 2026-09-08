import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CreateSubscriberInput, Subscriber, SubscriberStatus } from '../../domain/subscriber/SubscriberTypes';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { CustomerAccountNotFoundError } from '../../domain/customer_account/CustomerAccountErrors';

export class CreateSubscriber {
    constructor(
        private subscriberRepo: ISubscriberRepository,
        private accountRepo: ICustomerAccountRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: CreateSubscriberInput): Promise<Subscriber> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.subscriberCode) throw new ValidationError("Subscriber Code is required");
        if (!data.customerAccountId) throw new ValidationError("Customer Account ID is required");
        if (!data.serviceCategory) throw new ValidationError("Service Category is required");
        if (!data.serviceMode) throw new ValidationError("Service Mode is required");

        // Idempotency Check
        if (data.idempotencyKey) {
            const existing = await this.subscriberRepo.getSubscriberByIdempotencyKey(tenantId, data.idempotencyKey);
            if (existing) {
                return existing; // Idempotent return
            }
        }

        const tx = await this.txManager.beginTransaction();
        try {
            // Validate Account
            const account = await this.accountRepo.findAccountById(tenantId, data.customerAccountId, tx);
            if (!account) {
                throw new CustomerAccountNotFoundError(data.customerAccountId, tenantId);
            }

            // Create Subscriber
            const subscriber = await this.subscriberRepo.createSubscriber(tenantId, data, tx);

            // Insert initial history
            await this.subscriberRepo.insertStatusHistory(tenantId, {
                subscriberId: subscriber.id,
                newStatus: SubscriberStatus.PENDING,
                reasonCode: 'SUBSCRIBER_CREATED',
                changedBy: data.createdBy
            }, tx);

            await tx.commit();
            return subscriber;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }
}
