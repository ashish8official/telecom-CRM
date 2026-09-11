import { ITransaction } from '../common/transaction/ITransaction';
import { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerStatus, CustomerStatusHistory } from './CustomerTypes';

export interface ICustomerRepository {
    createCustomer(tenantId: string, data: CreateCustomerInput, tx?: ITransaction): Promise<Customer>;
    
    getCustomerById(tenantId: string, customerId: string, tx?: ITransaction): Promise<Customer | null>;
    
    getCustomerByPartyId(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null>;
    
    updateCustomer(tenantId: string, customerId: string, data: UpdateCustomerInput, tx?: ITransaction): Promise<Customer>;
    
    updateCustomerStatus(
        tenantId: string, 
        customerId: string, 
        status: CustomerStatus, 
        version: number,
        updatedBy?: string, 
        tx?: ITransaction
    ): Promise<Customer>;
    
    insertStatusHistory(tenantId: string, data: Omit<CustomerStatusHistory, 'id' | 'tenantId' | 'changedAt'>, tx?: ITransaction): Promise<CustomerStatusHistory>;
    
    findExistingActiveCustomer(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null>;
}
