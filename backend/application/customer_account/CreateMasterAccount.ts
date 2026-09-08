import { InvalidTemporalDatesError } from '../../domain/common/errors/InvalidTemporalDatesError';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { CreateMasterAccountInput, CustomerAccount, AccountLevel } from '../../domain/customer_account/CustomerAccountTypes';
import { CustomerNotFoundError } from '../../domain/customer/CustomerErrors';
import { } from '../../domain/party/PartyErrors';
import { } from '../../domain/customer/CustomerErrors';

export class CreateMasterAccount {
    constructor(
        private accountRepo: ICustomerAccountRepository,
        private customerRepo: ICustomerRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: CreateMasterAccountInput): Promise<CustomerAccount> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.customerId) throw new ValidationError("Customer ID is required");

        if (data.effectiveFrom && data.effectiveTo && new Date(data.effectiveTo) < new Date(data.effectiveFrom)) {
            throw new InvalidTemporalDatesError();
        }

        const tx = await this.txManager.beginTransaction();
        try {
            const customer = await this.customerRepo.getCustomerById(tenantId, data.customerId, tx);
            if (!customer) {
                throw new CustomerNotFoundError(data.customerId, tenantId);
            }

            const account = await this.accountRepo.createAccount(tenantId, {
                customerId: data.customerId,
                parentAccountId: null,
                accountLevel: AccountLevel.MASTER,
                billingResponsibleFlag: true,
                effectiveFrom: data.effectiveFrom || new Date(),
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
