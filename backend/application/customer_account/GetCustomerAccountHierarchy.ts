import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CustomerAccountHierarchy, AccountLevel } from '../../domain/customer_account/CustomerAccountTypes';
import { ValidationError } from '../../domain/party/PartyErrors';

export class GetCustomerAccountHierarchy {
    constructor(private accountRepo: ICustomerAccountRepository) {}

    async execute(tenantId: string, customerId: string): Promise<CustomerAccountHierarchy[]> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!customerId) throw new ValidationError("Customer ID is required");

        const accounts = await this.accountRepo.findAccountsByCustomerId(tenantId, customerId);
        
        // Assemble tree in memory
        const accountMap = new Map<string, CustomerAccountHierarchy>();
        const masters: CustomerAccountHierarchy[] = [];

        accounts.forEach(acc => {
            accountMap.set(acc.id, { ...acc, children: [] });
        });

        accounts.forEach(acc => {
            const current = accountMap.get(acc.id)!;
            if (acc.accountLevel === AccountLevel.MASTER) {
                masters.push(current);
            } else if (acc.parentAccountId) {
                const parent = accountMap.get(acc.parentAccountId);
                if (parent) {
                    parent.children.push(current);
                }
            }
        });

        return masters;
    }
}
