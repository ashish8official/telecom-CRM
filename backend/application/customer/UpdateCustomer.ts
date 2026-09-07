import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer, UpdateCustomerInput } from '../../domain/customer/CustomerTypes';
import { CustomerNotFoundError, InvalidTemporalDatesError } from '../../domain/customer/CustomerErrors';
import { ValidationError } from '../../domain/party/PartyErrors';

export class UpdateCustomer {
    constructor(private customerRepo: ICustomerRepository) {}

    async execute(tenantId: string, customerId: string, data: UpdateCustomerInput): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");

        const existingCustomer = await this.customerRepo.getCustomerById(tenantId, customerId);
        if (!existingCustomer) {
            throw new CustomerNotFoundError(customerId, tenantId);
        }

        if (data.effectiveTo && new Date(data.effectiveTo) < new Date(existingCustomer.effectiveFrom)) {
            throw new InvalidTemporalDatesError();
        }

        return await this.customerRepo.updateCustomer(tenantId, customerId, data);
    }
}
