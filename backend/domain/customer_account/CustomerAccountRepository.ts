import { ITransaction } from '../common/transaction/ITransaction';
import { CustomerAccount, AccountStatus, UpdateCustomerAccountInput, AccountLevel, CustomerAccountStatusHistory } from './CustomerAccountTypes';

export interface ICustomerAccountRepository {
    createAccount(
        tenantId: string, 
        data: { 
            customerId: string, 
            parentAccountId: string | null, 
            accountLevel: AccountLevel, 
            billingResponsibleFlag: boolean, 
            effectiveFrom: Date, 
            effectiveTo?: Date, 
            createdBy?: string 
        }, 
        tx?: ITransaction
    ): Promise<CustomerAccount>;
    
    findAccountById(tenantId: string, accountId: string, tx?: ITransaction): Promise<CustomerAccount | null>;
    
    findAccountsByCustomerId(tenantId: string, customerId: string, tx?: ITransaction): Promise<CustomerAccount[]>;
    
    hasActiveChildren(tenantId: string, accountId: string, tx?: ITransaction): Promise<boolean>;
    
    updateAccount(tenantId: string, accountId: string, data: UpdateCustomerAccountInput, tx?: ITransaction): Promise<CustomerAccount>;
    
    updateAccountStatus(
        tenantId: string, 
        accountId: string, 
        status: AccountStatus, 
        version: number,
        updatedBy?: string, 
        tx?: ITransaction
    ): Promise<CustomerAccount>;
    
    insertStatusHistory(tenantId: string, data: Omit<CustomerAccountStatusHistory, 'id' | 'tenantId' | 'changedAt'>, tx?: ITransaction): Promise<CustomerAccountStatusHistory>;
}
