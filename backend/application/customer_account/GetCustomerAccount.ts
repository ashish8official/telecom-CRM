import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CustomerAccount } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerAccountNotFoundError } from '../../domain/customer_account/CustomerAccountErrors';
import { ValidationError } from '../../domain/party/PartyErrors';

export class GetCustomerAccount {
    constructor(private accountRepo: ICustomerAccountRepository) {}

    async execute(tenantId: string, accountId: string): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!accountId) throw new ValidationError("Account ID is required");

        const account = await this.accountRepo.findAccountById(tenantId, accountId);
        if (!account) {
            throw new CustomerAccountNotFoundError(accountId, tenantId);
        }
        return account;
    }
}
