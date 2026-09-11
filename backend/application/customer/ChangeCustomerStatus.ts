import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer, CustomerStatus, ChangeCustomerStatusInput } from '../../domain/customer/CustomerTypes';
import { CustomerNotFoundError, InvalidCustomerStateTransitionError } from '../../domain/customer/CustomerErrors';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { IIdempotencyManager } from '../../domain/common/idempotency/IIdempotencyManager';
import * as crypto from 'crypto';

export class ChangeCustomerStatus {
    constructor(
        private customerRepo: ICustomerRepository,
        private txManager: ITransactionManager,
        private idempotencyManager?: IIdempotencyManager
    ) {}

    private hashRequest(input: ChangeCustomerStatusInput): string {
        return crypto.createHash('sha256').update(JSON.stringify({
            newStatus: input.newStatus,
            reasonCode: input.reasonCode
        })).digest('hex');
    }

    async execute(tenantId: string, customerId: string, input: ChangeCustomerStatusInput, idempotencyKey?: string): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");
        if (!input.newStatus) throw new ValidationError("New status is required");
        if (!input.reasonCode) throw new ValidationError("Reason code is required");
        if (input.version === undefined) throw new ValidationError("Version is required for concurrency control");

        const operation = 'CHANGE_CUSTOMER_STATUS';
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
                        return existingRecord.responsePayload as Customer;
                    }
                    // If FAILED, we could theoretically retry, but current architecture might block it or return it. 
                    // Let's assume we allow re-execution or it throws inside checkOrAcquire.
                }
            }

            const customer = await this.customerRepo.getCustomerById(tenantId, customerId, tx);
            if (!customer) {
                throw new CustomerNotFoundError(customerId, tenantId);
            }

            this.validateTransition(customer.status, input.newStatus);

            const updatedCustomer = await this.customerRepo.updateCustomerStatus(
                tenantId,
                customerId,
                input.newStatus,
                input.version,
                input.updatedBy,
                tx
            );

            await this.customerRepo.insertStatusHistory(tenantId, {
                customerId: customerId,
                previousStatus: customer.status,
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
                    'Customer',
                    customerId,
                    200,
                    updatedCustomer,
                    tx
                );
            }

            await tx.commit();
            return updatedCustomer;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }

    private validateTransition(current: CustomerStatus, next: CustomerStatus) {
        if (current === next) {
            throw new InvalidCustomerStateTransitionError(current, next);
        }

        // TERMINATED is a terminal state
        if (current === CustomerStatus.TERMINATED) {
            throw new InvalidCustomerStateTransitionError(current, next);
        }

        const validTransitions: Record<CustomerStatus, CustomerStatus[]> = {
            [CustomerStatus.INACTIVE]: [CustomerStatus.ACTIVE, CustomerStatus.TERMINATED],
            [CustomerStatus.ACTIVE]: [CustomerStatus.SUSPENDED, CustomerStatus.TERMINATED],
            [CustomerStatus.SUSPENDED]: [CustomerStatus.ACTIVE, CustomerStatus.TERMINATED],
            [CustomerStatus.TERMINATED]: []
        };

        const allowed = validTransitions[current];
        if (!allowed || !allowed.includes(next)) {
            throw new InvalidCustomerStateTransitionError(current, next);
        }
    }
}
