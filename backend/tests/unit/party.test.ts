import { UpdateParty } from '../../application/party/UpdateParty';
import { CreateIndividualParty } from '../../application/party/CreateIndividualParty';
import { CreateOrganizationParty } from '../../application/party/CreateOrganizationParty';
import { DeleteParty } from '../../application/party/DeleteParty';
import { ChangePartyStatus } from '../../application/party/ChangePartyStatus';
import { GetParty } from '../../application/party/GetParty';
import { ITransaction } from '../../domain/common/transaction/ITransaction';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { Individual, Organization, PartyStatus, PartyType } from '../../domain/party/PartyTypes';
import { ValidationError } from '../../domain/common/errors/ValidationError';
import { InvalidPartyStateTransitionError, PartyNotFoundError, } from '../../domain/party/PartyErrors';

class MockTx implements ITransaction {
    async commit() {}
    async rollback() {}
    release() {}
    getConnection() { return {}; }
}

class MockTxManager implements ITransactionManager {
    async beginTransaction() {
        return new MockTx();
    }
}

class MockRepo implements IPartyRepository {
    parties: any[] = [];
    
    async createIndividual(tenantId: string, ind: Partial<Individual>): Promise<Individual> {
        const party = { id: '1', tenantId, partyType: PartyType.INDIVIDUAL, status: PartyStatus.ACTIVE, ...ind } as Individual;
        this.parties.push(party);
        return party;
    }
    async createOrganization(tenantId: string, org: Partial<Organization>): Promise<Organization> {
        const party = { id: '2', tenantId, partyType: PartyType.ORGANIZATION, status: PartyStatus.ACTIVE, ...org } as Organization;
        this.parties.push(party);
        return party;
    }
    async getParty(tenantId: string, partyId: string): Promise<any> {
        return this.parties.find(p => p.tenantId === tenantId && p.id === partyId && !p.deletedAt) || null;
    }
    async updateIndividual() { return {} as any; }
    async updateOrganization() { return {} as any; }
    async updateStatus(tenantId: string, partyId: string, status: PartyStatus): Promise<any> {
        const party = await this.getParty(tenantId, partyId);
        party.status = status;
        return party;
    }
    async softDelete(tenantId: string, partyId: string): Promise<void> {
        const party = await this.getParty(tenantId, partyId);
        if (party) party.deletedAt = new Date();
    }
    async findPotentialDuplicates() { return []; }
}

describe('Party Application Use Cases', () => {
    let repo: MockRepo;
    let txManager: MockTxManager;
    let createInd: CreateIndividualParty;
    let createOrg: CreateOrganizationParty;
    let deleteParty: DeleteParty;
    let changeStatus: ChangePartyStatus;
    let getParty: GetParty;

    beforeEach(() => {
        repo = new MockRepo();
        txManager = new MockTxManager();
        createInd = new CreateIndividualParty(repo, txManager);
        createOrg = new CreateOrganizationParty(repo, txManager);
        deleteParty = new DeleteParty(repo);
        changeStatus = new ChangePartyStatus(repo);
        getParty = new GetParty(repo);
    });

    test('CreateIndividualParty - Success', async () => {
        const ind = await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        expect(ind.id).toBeDefined();
        expect(ind.partyType).toBe(PartyType.INDIVIDUAL);
        expect(repo.parties.length).toBe(1);
    });

    test('CreateIndividualParty - Missing fields', async () => {
        await expect(createInd.execute('T1', { firstName: 'John' } as any)).rejects.toThrow(ValidationError);
    });

    test('CreateOrganizationParty - Success', async () => {
        const org = await createOrg.execute('T1', { legalName: 'Acme Corp' });
        expect(org.partyType).toBe(PartyType.ORGANIZATION);
        expect(repo.parties.length).toBe(1);
    });

    test('GetParty - Tenant Isolation', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await expect(getParty.execute('T2', '1')).rejects.toThrow(PartyNotFoundError);
    });

    test('SoftDeleteParty - Success', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await deleteParty.execute('T1', '1');
        await expect(getParty.execute('T1', '1')).rejects.toThrow(PartyNotFoundError);
    });

    test('ChangeStatus - Valid Transition', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        const party = await changeStatus.execute('T1', '1', PartyStatus.SUSPENDED);
        expect(party.status).toBe(PartyStatus.SUSPENDED);
    });

    test('ChangeStatus - Invalid Transition', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await changeStatus.execute('T1', '1', PartyStatus.TERMINATED);
        // Terminated is terminal, cannot go back to ACTIVE
        await expect(changeStatus.execute('T1', '1', PartyStatus.ACTIVE)).rejects.toThrow(InvalidPartyStateTransitionError);
    });
});
