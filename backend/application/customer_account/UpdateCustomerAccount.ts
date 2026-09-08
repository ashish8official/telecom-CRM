import { InvalidTemporalDatesError } from '../../domain/common/errors/InvalidTemporalDatesError';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CustomerAccount, UpdateCustomerAccountInput } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerAccountNotFoundError } from '../../domain/customer_account/CustomerAccountErrors';
import { } from '../../domain/customer/CustomerErrors';
import { } from '../../domain/party/PartyErrors';

export class UpdateCustomerAccount {
    constructor(private accountRepo: ICustomerAccountRepository) {}

    async execute(tenantId: string, accountId: string, data: UpdateCustomerAccountInput): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!accountId) throw new ValidationError("Account ID is required");

        const existingAccount = await this.accountRepo.findAccountById(tenantId, accountId);
        if (!existingAccount) {
            throw new CustomerAccountNotFoundError(accountId, tenantId);
        }

        if (data.effectiveTo && new Date(data.effectiveTo) < new Date(existingAccount.effectiveFrom)) {
            throw new InvalidTemporalDatesError();
        }

        return await this.accountRepo.updateAccount(tenantId, accountId, data);
    }
}
