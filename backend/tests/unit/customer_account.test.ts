import { CreateMasterAccount } from '../../application/customer_account/CreateMasterAccount';
import { CreateChildAccount } from '../../application/customer_account/CreateChildAccount';
import { GetCustomerAccountHierarchy } from '../../application/customer_account/GetCustomerAccountHierarchy';
import { ChangeCustomerAccountStatus } from '../../application/customer_account/ChangeCustomerAccountStatus';
import { ICustomerAccountRepository } from '../../domain/customer_account/CustomerAccountRepository';
import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { CustomerAccount, AccountLevel, AccountStatus } from '../../domain/customer_account/CustomerAccountTypes';
import { ITransactionManager } from '../../application/party/ITransactionManager';
import { Customer, CustomerStatus } from '../../domain/customer/CustomerTypes';
import { AccountHasActiveChildrenError, CrossCustomerAccountHierarchyError, InvalidAccountStateTransitionError, InvalidParentAccountError } from '../../domain/customer_account/CustomerAccountErrors';

class MockTxManager implements ITransactionManager {
    async beginTransaction() { return { commit: async () => {}, rollback: async () => {}, release: () => {}, getConnection: () => ({}) }; }
}

class MockCustomerAccountRepo implements ICustomerAccountRepository {
    accounts: CustomerAccount[] = [];
    async createAccount(tenantId: string, data: any) {
        const acc = { id: 'a' + this.accounts.length, tenantId, status: AccountStatus.ACTIVE, effectiveFrom: new Date(), ...data };
        this.accounts.push(acc);
        return acc;
    }
    async findAccountById(tenantId: string, accountId: string) { return this.accounts.find(a => a.tenantId === tenantId && a.id === accountId) || null; }
    async findAccountsByCustomerId(tenantId: string, customerId: string) { return this.accounts.filter(a => a.tenantId === tenantId && a.customerId === customerId); }
    async hasActiveChildren(tenantId: string, accountId: string) { return this.accounts.some(a => a.tenantId === tenantId && a.parentAccountId === accountId && a.status !== AccountStatus.CLOSED); }
    async updateAccount(t: string, id: string, data: any) { return {} as any; }
    async updateAccountStatus(tenantId: string, accountId: string, status: AccountStatus) {
        const acc = await this.findAccountById(tenantId, accountId);
        if (acc) acc.status = status;
        return acc as CustomerAccount;
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
        changeStatus = new ChangeCustomerAccountStatus(accountRepo);
        getHierarchy = new GetCustomerAccountHierarchy(accountRepo);
    });

    test('Create Master Account', async () => {
        const acc = await createMaster.execute('t1', { customerId: 'c1' });
        expect(acc.accountLevel).toBe(AccountLevel.MASTER);
        expect(acc.billingResponsibleFlag).toBe(true);
        expect(acc.parentAccountId).toBeNull();
    });

    test('Create Child Account', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const child = await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id });
        expect(child.accountLevel).toBe(AccountLevel.CHILD);
        expect(child.billingResponsibleFlag).toBe(false);
        expect(child.parentAccountId).toBe(master.id);
    });

    test('Create Child Account - Invalid Cross-Customer Hierarchy', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        await expect(createChild.execute('t1', { customerId: 'c2', parentAccountId: master.id }))
            .rejects.toThrow(CrossCustomerAccountHierarchyError);
    });

    test('Create Child Account - Parent not MASTER', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const child = await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id });
        await expect(createChild.execute('t1', { customerId: 'c1', parentAccountId: child.id }))
            .rejects.toThrow(InvalidParentAccountError);
    });

    test('Change Status - Valid Transition', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const updated = await changeStatus.execute('t1', master.id, AccountStatus.SUSPENDED);
        expect(updated.status).toBe(AccountStatus.SUSPENDED);
    });

    test('Change Status - Prevent Closing Master with Active Children', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id }); // ACTIVE child
        await expect(changeStatus.execute('t1', master.id, AccountStatus.CLOSED))
            .rejects.toThrow(AccountHasActiveChildrenError);
    });

    test('Change Status - Can Close Master with Closed Children', async () => {
        const master = await createMaster.execute('t1', { customerId: 'c1' });
        const child = await createChild.execute('t1', { customerId: 'c1', parentAccountId: master.id }); 
        await changeStatus.execute('t1', child.id, AccountStatus.CLOSED);
        await changeStatus.execute('t1', master.id, AccountStatus.CLOSED); // Should succeed now
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
