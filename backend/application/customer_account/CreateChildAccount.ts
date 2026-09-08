import { InvalidTemporalDatesError } from '../../domain/common/errors/InvalidTemporalDatesError';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { CreateChildAccountInput, CustomerAccount, AccountLevel, AccountStatus } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerNotFoundError, } from '../../domain/customer/CustomerErrors';
import { ParentAccountNotFoundError, InvalidParentAccountError, CrossCustomerAccountHierarchyError } from '../../domain/customer_account/CustomerAccountErrors';
import { } from '../../domain/party/PartyErrors';

export class CreateChildAccount {
    constructor(
        private accountRepo: ICustomerAccountRepository,
        private customerRepo: ICustomerRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: CreateChildAccountInput): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.customerId) throw new ValidationError("Customer ID is required");
        if (!data.parentAccountId) throw new ValidationError("Parent Account ID is required");

        if (data.effectiveFrom && data.effectiveTo && new Date(data.effectiveTo) < new Date(data.effectiveFrom)) {
            throw new InvalidTemporalDatesError();
        }

        const tx = await this.txManager.beginTransaction();
        try {
            const customer = await this.customerRepo.getCustomerById(tenantId, data.customerId, tx);
            if (!customer) {
                throw new CustomerNotFoundError(data.customerId, tenantId);
            }

            const parent = await this.accountRepo.findAccountById(tenantId, data.parentAccountId, tx);
            if (!parent) {
                throw new ParentAccountNotFoundError(data.parentAccountId, tenantId);
            }

            if (parent.customerId !== data.customerId) {
                throw new CrossCustomerAccountHierarchyError();
            }

            if (parent.accountLevel !== AccountLevel.MASTER) {
                throw new InvalidParentAccountError("Parent must be a MASTER account.");
            }

            if (parent.status !== AccountStatus.ACTIVE) {
                throw new InvalidParentAccountError(`Parent account must be ACTIVE, currently ${parent.status}`);
            }
            
            const effectiveFrom = data.effectiveFrom || new Date();
            if (new Date(effectiveFrom) < new Date(parent.effectiveFrom)) {
                throw new InvalidParentAccountError("Child account cannot start before parent account starts.");
            }

            const account = await this.accountRepo.createAccount(tenantId, {
                customerId: data.customerId,
                parentAccountId: data.parentAccountId,
                accountLevel: AccountLevel.CHILD,
                billingResponsibleFlag: false,
                effectiveFrom,
                effectiveTo: data.effectiveTo,
                createdBy: data.createdBy
            }, tx);
            
            await tx.commit();
            return account;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }
}
