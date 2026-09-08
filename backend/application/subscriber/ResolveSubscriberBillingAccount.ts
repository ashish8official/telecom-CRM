import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ISubscriberRepository } from '../../domain/subscriber/SubscriberRepository';
import { CustomerAccount } from '../../domain/customer_account/CustomerAccountTypes';
import { SubscriberNotFoundError } from '../../domain/subscriber/SubscriberErrors';
import { CustomerAccountNotFoundError } from '../../domain/customer_account/CustomerAccountErrors';
import { ValidationError } from '../../domain/common/errors/ValidationError';

export class ResolveSubscriberBillingAccount {
    constructor(
        private subscriberRepo: ISubscriberRepository,
        private accountRepo: ICustomerAccountRepository
    ) {}

    async execute(tenantId: string, subscriberId: string): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!subscriberId) throw new ValidationError("Subscriber ID is required");

        const subscriber = await this.subscriberRepo.getSubscriber(tenantId, subscriberId);
        if (!subscriber) {
            throw new SubscriberNotFoundError(subscriberId, tenantId);
        }

        return this.resolveBillingAccount(tenantId, subscriber.customerAccountId);
    }

    private async resolveBillingAccount(tenantId: string, accountId: string): Promise<CustomerAccount> {
        const account = await this.accountRepo.findAccountById(tenantId, accountId);
        if (!account) {
            throw new CustomerAccountNotFoundError(accountId, tenantId);
        }

        // If this account is billing responsible (MASTER), return it
        if (account.billingResponsibleFlag) {
            return account;
        }

        // If it's a child account, it must have a parent
        if (!account.parentAccountId) {
            throw new ValidationError(`Account ${accountId} is not billing responsible but has no parent account`);
        }

        // Recursively resolve up the hierarchy (or just query the parent, since currently it's 1-level deep, but recursive is safer)
        return this.resolveBillingAccount(tenantId, account.parentAccountId);
    }
}
