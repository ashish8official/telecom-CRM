import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { CustomerAccount, AccountStatus, AccountLevel } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerAccountNotFoundError, InvalidAccountStateTransitionError, AccountHasActiveChildrenError } from '../../domain/customer_account/CustomerAccountErrors';
import { ValidationError } from '../../domain/party/PartyErrors';

export class ChangeCustomerAccountStatus {
    constructor(private accountRepo: ICustomerAccountRepository) {}

    async execute(tenantId: string, accountId: string, newStatus: AccountStatus, updatedBy?: string): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!accountId) throw new ValidationError("Account ID is required");

        const account = await this.accountRepo.findAccountById(tenantId, accountId);
        if (!account) {
            throw new CustomerAccountNotFoundError(accountId, tenantId);
        }

        this.validateTransition(account.status, newStatus);

        if (newStatus === AccountStatus.CLOSED && account.accountLevel === AccountLevel.MASTER) {
            const hasActiveChildren = await this.accountRepo.hasActiveChildren(tenantId, accountId);
            if (hasActiveChildren) {
                throw new AccountHasActiveChildrenError(accountId);
            }
        }

        return await this.accountRepo.updateAccountStatus(tenantId, accountId, newStatus, updatedBy);
    }

    private validateTransition(current: AccountStatus, next: AccountStatus) {
        if (current === next) return;

        if (current === AccountStatus.CLOSED) {
            throw new InvalidAccountStateTransitionError(current, next);
        }

        const validTransitions: Record<AccountStatus, AccountStatus[]> = {
            [AccountStatus.ACTIVE]: [AccountStatus.SUSPENDED, AccountStatus.CLOSED],
            [AccountStatus.SUSPENDED]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
            [AccountStatus.CLOSED]: []
        };

        if (!validTransitions[current].includes(next)) {
            throw new InvalidAccountStateTransitionError(current, next);
        }
    }
}
