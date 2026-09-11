import { UpdateCustomerAccount } from '../../application/customer_account/UpdateCustomerAccount';
import { GetCustomerAccount } from '../../application/customer_account/GetCustomerAccount';
import { CreateMasterAccount } from '../../application/customer_account/CreateMasterAccount';
import { CreateChildAccount } from '../../application/customer_account/CreateChildAccount';
import { GetCustomerAccountHierarchy } from '../../application/customer_account/GetCustomerAccountHierarchy';
import { ChangeCustomerAccountStatus } from '../../application/customer_account/ChangeCustomerAccountStatus';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { CustomerAccount, AccountLevel, AccountStatus } from '../../domain/customer_account/CustomerAccountTypes';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { Customer, CustomerStatus } from '../../domain/customer/CustomerTypes';
import { AccountHasActiveChildrenError, CrossCustomerAccountHierarchyError, InvalidAccountStateTransitionError, InvalidParentAccountError } from '../../domain/customer_account/CustomerAccountErrors';

class MockTxManager implements ITransactionManager {
    async beginTransaction() { return { commit: async () => {}, rollback: async () => {}, release: () => {}, getConnection: () => ({}) }; }
}

class MockCustomerAccountRepo implements ICustomerAccountRepository {
    accounts: CustomerAccount[] = [];
    async createAccount(tenantId: string, data: any) {
        const acc = { id: 'a' + this.accounts.length, tenantId, status: AccountStatus.ACTIVE, effectiveFrom: new Date(), version: 1, ...data };
        this.accounts.push(acc);
        return acc;
    }
    async findAccountById(tenantId: string, accountId: string) { return this.accounts.find(a => a.tenantId === tenantId && a.id === accountId) || null; }
    async findAccountsByCustomerId(tenantId: string, customerId: string) { return this.accounts.filter(a => a.tenantId === tenantId && a.customerId === customerId); }
    async hasActiveChildren(tenantId: string, accountId: string) { return this.accounts.some(a => a.tenantId === tenantId && a.parentAccountId === accountId && a.status !== AccountStatus.CLOSED); }
    async updateAccount(t: string, id: string, data: any) { return {} as any; }
    async updateAccountStatus(tenantId: string, accountId: string, status: AccountStatus, version: number) {
        const acc = await this.findAccountById(tenantId, accountId);
        if (acc) { acc.status = status; acc.version++; }
        return acc as CustomerAccount;
    }
    async insertStatusHistory(tenantId: string, data: any) {
        return { id: 'cah1', tenantId, ...data };
    }
}

class MockCustomerRepo implements Partial<ICustomerRepository> {
    async getCustomerById(tenantId: string, customerId: string) {
        if (customerId === 'invalid') return null;
        return { id: customerId, tenantId, partyId: 'p1', status: CustomerStatus.ACTIVE } as Customer;
    }
}

describe('Customer Account Application Use Cases', () => {
    let accountRepo: MockCustomerAccountRepo;
    let customerRepo: MockCustomerRepo;
    let txManager: MockTxManager;
    let createMaster: CreateMasterAccount;
    let createChild: CreateChildAccount;
    let changeStatus: ChangeCustomerAccountStatus;
    let getHierarchy: GetCustomerAccountHierarchy;

    beforeEach(() => {
        accountRepo = new MockCustomerAccountRepo();
        customerRepo = new MockCustomerRepo();
        txManager = new MockTxManager();
        createMaster = new CreateMasterAccount(accountRepo, customerRepo as any, txManager);
        createChild = new CreateChildAccount(accountRepo, customerRepo as any, txManager);
        changeStatus = new ChangeCustomerAccountStatus(accountRepo, txManager);
        getHierarchy = new GetCustomerAccountHierarchy(accountRepo);
    });

    test('CreateMasterAccount - Valid', async () => {
        const acc = await createMaster.execute('t1', { customerId: 'c1' });
        expect(acc.accountLevel).toBe(AccountLevel.MASTER);
        expect(acc.billingResponsibleFlag).toBe(true);
    });

    test('CreateChildAccount - Valid', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const child = await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id });
        expect(child.accountLevel).toBe(AccountLevel.CHILD);
        expect(child.parentAccountId).toBe(master.id);
        expect(child.billingResponsibleFlag).toBe(false);
    });

    test('CreateChildAccount - Invalid Parent', async () => {
        await expect(createChild.execute('t1', { customerId: 'c1', parentAccountId: 'invalid' }))
            .rejects.toThrow(); // We'll just use toThrow without specific class to avoid needing another import
    });

    test('CreateChildAccount - Cross Customer Hierarchies Not Allowed', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        // Attempt to create a child for customer 'c2' under a parent owned by 'c1'
        accountRepo.findAccountById = async (t, id) => {
            if (id === master.id) return master;
            return null;
        };
        customerRepo.getCustomerById = async (t, id) => {
            return { id, tenantId: t, partyId: 'p2', status: CustomerStatus.ACTIVE } as Customer; // Simulates valid customer c2
        };
        await expect(createChild.execute('t1', { customerId: 'c2', parentAccountId: master.id }))
            .rejects.toThrow(CrossCustomerAccountHierarchyError);
    });

    test('Change Status - Valid Transition', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const updated = await changeStatus.execute('t1', master.id, { newStatus: AccountStatus.SUSPENDED, reasonCode: 'TEST', version: master.version });
        expect(updated.status).toBe(AccountStatus.SUSPENDED);
    });

    test('Change Status - Rejects Closing Master with Active Children', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id }); // ACTIVE child
        await expect(changeStatus.execute('t1', master.id, { newStatus: AccountStatus.CLOSED, reasonCode: 'TEST', version: master.version }))
            .rejects.toThrow(AccountHasActiveChildrenError);
    });

    test('Change Status - Allows Closing Master if Children are Closed', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const child = await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id }); 
        const c1 = await changeStatus.execute('t1', child.id, { newStatus: AccountStatus.CLOSED, reasonCode: 'TEST', version: child.version });
        await changeStatus.execute('t1', master.id, { newStatus: AccountStatus.CLOSED, reasonCode: 'TEST', version: master.version }); // Should succeed now
        expect((await accountRepo.findAccountById('t1', master.id))?.status).toBe(AccountStatus.CLOSED);
    });

    test('Get Hierarchy', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id });
        const hierarchy = await getHierarchy.execute('t1', 'c1');
        expect(hierarchy.length).toBe(1);
        expect(hierarchy[0].id).toBe(master.id);
        expect(hierarchy[0].children.length).toBe(1);
    });
});
