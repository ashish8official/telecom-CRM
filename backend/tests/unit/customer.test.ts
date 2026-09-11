import { GetCustomerByParty } from '../../application/customer/GetCustomerByParty';
import { CreateCustomer } from '../../application/customer/CreateCustomer';
import { GetCustomer } from '../../application/customer/GetCustomer';
import { UpdateCustomer } from '../../application/customer/UpdateCustomer';
import { ChangeCustomerStatus } from '../../application/customer/ChangeCustomerStatus';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { Customer, CustomerStatus } from '../../domain/customer/CustomerTypes';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { InvalidTemporalDatesError } from '../../domain/common/errors/InvalidTemporalDatesError';
import { CustomerAlreadyExistsError, CustomerNotFoundError, InvalidCustomerStateTransitionError, PartyNotEligibleForCustomerError } from '../../domain/customer/CustomerErrors';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { PartyNotFoundError, } from '../../domain/party/PartyErrors';
import { Party, PartyStatus, PartyType } from '../../domain/party/PartyTypes';

class MockTx implements ITransaction {
    async commit() {}
    async rollback() {}
    release() {}
    getConnection() { return {}; }
}

class MockTxManager implements ITransactionManager {
    async beginTransaction() { return new MockTx(); }
}

class MockCustomerRepo implements ICustomerRepository {
    customers: Customer[] = [];
    async createCustomer(tenantId: string, data: any): Promise<Customer> {
        const c = { id: 'c1', tenantId, partyId: data.partyId, status: data.status || CustomerStatus.ACTIVE, effectiveFrom: data.effectiveFrom || new Date(), version: 1, ...data } as Customer;
        this.customers.push(c);
        return c;
    }
    async getCustomerById(tenantId: string, id: string) {
        return this.customers.find(c => c.tenantId === tenantId && c.id === id) || null;
    }
    async getCustomerByPartyId(tenantId: string, partyId: string) {
        return this.customers.find(c => c.tenantId === tenantId && c.partyId === partyId) || null;
    }
    async updateCustomer(tenantId: string, id: string, data: any) {
        const c = await this.getCustomerById(tenantId, id);
        if (c) { Object.assign(c, data); c.version++; }
        return c as Customer;
    }
    async updateCustomerStatus(tenantId: string, id: string, status: CustomerStatus, version: number) {
        const c = await this.getCustomerById(tenantId, id);
        if (c) { c.status = status; c.version++; }
        return c as Customer;
    }
    async insertStatusHistory(tenantId: string, data: any) {
        return { id: 'sh1', tenantId, ...data };
    }
    async findExistingActiveCustomer(tenantId: string, partyId: string) {
        return this.customers.find(c => c.tenantId === tenantId && c.partyId === partyId && (c.status === CustomerStatus.ACTIVE || c.status === CustomerStatus.SUSPENDED)) || null;
    }
}

class MockPartyRepo implements Partial<IPartyRepository> {
    parties: Party[] = [
        { id: 'p1', tenantId: 't1', partyType: PartyType.INDIVIDUAL, status: PartyStatus.ACTIVE },
        { id: 'p2', tenantId: 't1', partyType: PartyType.INDIVIDUAL, status: PartyStatus.ACTIVE, deletedAt: new Date() } // Soft deleted
    ];
    async getParty(tenantId: string, id: string) {
        return this.parties.find(p => p.tenantId === tenantId && p.id === id) || null;
    }
}

describe('Customer Application Use Cases', () => {
    let customerRepo: MockCustomerRepo;
    let partyRepo: MockPartyRepo;
    let txManager: MockTxManager;

    let createCustomer: CreateCustomer;
    let getCustomer: GetCustomer;
    let updateCustomer: UpdateCustomer;
    let changeStatus: ChangeCustomerStatus;

    beforeEach(() => {
        customerRepo = new MockCustomerRepo();
        partyRepo = new MockPartyRepo();
        txManager = new MockTxManager();

        createCustomer = new CreateCustomer(customerRepo, partyRepo as any, txManager);
        getCustomer = new GetCustomer(customerRepo);
        updateCustomer = new UpdateCustomer(customerRepo);
        changeStatus = new ChangeCustomerStatus(customerRepo, txManager);
    });

    test('CreateCustomer - Success', async () => {
        const c = await createCustomer.execute('t1', { partyId: 'p1' });
        expect(c.id).toBeDefined();
        expect(c.partyId).toBe('p1');
        expect(c.status).toBe(CustomerStatus.ACTIVE);
    });

    test('CreateCustomer - Party Not Found', async () => {
        await expect(createCustomer.execute('t1', { partyId: 'unknown' })).rejects.toThrow(PartyNotFoundError);
    });

    test('CreateCustomer - Party Deleted', async () => {
        await expect(createCustomer.execute('t1', { partyId: 'p2' })).rejects.toThrow(PartyNotEligibleForCustomerError);
    });

    test('CreateCustomer - Duplicate Active Customer', async () => {
        await createCustomer.execute('t1', { partyId: 'p1' });
        await expect(createCustomer.execute('t1', { partyId: 'p1' })).rejects.toThrow(CustomerAlreadyExistsError);
    });

    test('CreateCustomer - Invalid Dates', async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        await expect(createCustomer.execute('t1', { partyId: 'p1', effectiveFrom: tomorrow, effectiveTo: yesterday }))
            .rejects.toThrow(InvalidTemporalDatesError);
    });

    test('GetCustomer - Tenant Isolation', async () => {
        await createCustomer.execute('t1', { partyId: 'p1' });
        await expect(getCustomer.execute('t2', 'c1')).rejects.toThrow(CustomerNotFoundError);
    });

    test('ChangeStatus - Valid Transition', async () => {
        const cust = await createCustomer.execute('t1', { partyId: 'p1' });
        const c = await changeStatus.execute('t1', 'c1', { newStatus: CustomerStatus.SUSPENDED, reasonCode: 'TEST', version: cust.version });
        expect(c.status).toBe(CustomerStatus.SUSPENDED);
    });

    test('ChangeStatus - Invalid Transition (TERMINATED is terminal)', async () => {
        const cust = await createCustomer.execute('t1', { partyId: 'p1' });
        const c1 = await changeStatus.execute('t1', 'c1', { newStatus: CustomerStatus.TERMINATED, reasonCode: 'TEST', version: cust.version });
        
        await expect(changeStatus.execute('t1', 'c1', { newStatus: CustomerStatus.ACTIVE, reasonCode: 'TEST', version: c1.version })).rejects.toThrow(InvalidCustomerStateTransitionError);
    });

    test('UpdateCustomer - Immutable Fields (Simulated via DTO)', async () => {
        await createCustomer.execute('t1', { partyId: 'p1' });
        
        // Allowed field
        const updated = await updateCustomer.execute('t1', 'c1', { customerCategory: 'VIP' });
        expect(updated.customerCategory).toBe('VIP');
    });
});
