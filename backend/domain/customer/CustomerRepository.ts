import { ITransaction } from '../party/PartyRepository';
import { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerStatus } from './CustomerTypes';

export interface ICustomerRepository {
    createCustomer(tenantId: string, data: CreateCustomerInput, tx?: ITransaction): Promise<Customer>;
    
    getCustomerById(tenantId: string, customerId: string, tx?: ITransaction): Promise<Customer | null>;
    
    getCustomerByPartyId(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null>;
    
    updateCustomer(tenantId: string, customerId: string, data: UpdateCustomerInput, tx?: ITransaction): Promise<Customer>;
    
    updateCustomerStatus(tenantId: string, customerId: string, status: CustomerStatus, updatedBy?: string, tx?: ITransaction): Promise<Customer>;
    
    findExistingActiveCustomer(tenantId: string, partyId: string, tx?: ITransaction): Promise<Customer | null>;
}
