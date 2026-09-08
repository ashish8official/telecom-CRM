import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer, CustomerStatus } from '../../domain/customer/CustomerTypes';
import { CustomerNotFoundError, InvalidCustomerStateTransitionError } from '../../domain/customer/CustomerErrors';
import { } from '../../domain/party/PartyErrors';

export class ChangeCustomerStatus {
    constructor(private customerRepo: ICustomerRepository) {}

    async execute(tenantId: string, customerId: string, newStatus: CustomerStatus, updatedBy?: string): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");

        const customer = await this.customerRepo.getCustomerById(tenantId, customerId);
        if (!customer) {
            throw new CustomerNotFoundError(customerId, tenantId);
        }

        this.validateTransition(customer.status, newStatus);

        return await this.customerRepo.updateCustomerStatus(tenantId, customerId, newStatus, updatedBy);
    }

    private validateTransition(current: CustomerStatus, next: CustomerStatus) {
        if (current === next) return;

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

        if (!validTransitions[current].includes(next)) {
            throw new InvalidCustomerStateTransitionError(current, next);
        }
    }
}
