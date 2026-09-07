import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer } from '../../domain/customer/CustomerTypes';
import { CustomerNotFoundError } from '../../domain/customer/CustomerErrors';
import { ValidationError } from '../../domain/party/PartyErrors';

export class GetCustomer {
    constructor(private customerRepo: ICustomerRepository) {}

    async execute(tenantId: string, customerId: string): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");

        const customer = await this.customerRepo.getCustomerById(tenantId, customerId);
        if (!customer) {
            throw new CustomerNotFoundError(customerId, tenantId);
        }
        
        return customer;
    }
}
