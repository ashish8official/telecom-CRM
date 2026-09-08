import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer } from '../../domain/customer/CustomerTypes';
import { CustomerNotFoundError } from '../../domain/customer/CustomerErrors';
import { } from '../../domain/party/PartyErrors';

export class GetCustomerByParty {
    constructor(private customerRepo: ICustomerRepository) {}

    async execute(tenantId: string, partyId: string): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!partyId) throw new ValidationError("Party ID is required");

        const customer = await this.customerRepo.getCustomerByPartyId(tenantId, partyId);
        if (!customer) {
            // We return a not found for the customer relationship, not the party.
            throw new CustomerNotFoundError(`by partyId ${partyId}`, tenantId);
        }
        
        return customer;
    }
}
