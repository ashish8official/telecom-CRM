"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const CreateIndividualParty_1 = require("../../application/party/CreateIndividualParty");
const CreateOrganizationParty_1 = require("../../application/party/CreateOrganizationParty");
const DeleteParty_1 = require("../../application/party/DeleteParty");
const ChangePartyStatus_1 = require("../../application/party/ChangePartyStatus");
const GetParty_1 = require("../../application/party/GetParty");
const PartyTypes_1 = require("../../domain/party/PartyTypes");
const PartyErrors_1 = require("../../domain/party/PartyErrors");
class MockTx {
    async commit() { }
    async rollback() { }
    release() { }
    getConnection() { return {}; }
}
class MockTxManager {
    async beginTransaction() {
        return new MockTx();
    }
}
class MockRepo {
    parties = [];
    async createIndividual(tenantId, ind) {
        const party = { id: '1', tenantId, partyType: PartyTypes_1.PartyType.INDIVIDUAL, status: PartyTypes_1.PartyStatus.ACTIVE, ...ind };
        this.parties.push(party);
        return party;
    }
    async createOrganization(tenantId, org) {
        const party = { id: '2', tenantId, partyType: PartyTypes_1.PartyType.ORGANIZATION, status: PartyTypes_1.PartyStatus.ACTIVE, ...org };
        this.parties.push(party);
        return party;
    }
    async getParty(tenantId, partyId) {
        return this.parties.find(p => p.tenantId === tenantId && p.id === partyId && !p.deletedAt) || null;
    }
    async updateIndividual() { return {}; }
    async updateOrganization() { return {}; }
    async updateStatus(tenantId, partyId, status) {
        const party = await this.getParty(tenantId, partyId);
        party.status = status;
        return party;
    }
    async softDelete(tenantId, partyId) {
        const party = await this.getParty(tenantId, partyId);
        if (party)
            party.deletedAt = new Date();
    }
    async findPotentialDuplicates() { return []; }
}
describe('Party Application Use Cases', () => {
    let repo;
    let txManager;
    let createInd;
    let createOrg;
    let deleteParty;
    let changeStatus;
    let getParty;
    beforeEach(() => {
        repo = new MockRepo();
        txManager = new MockTxManager();
        createInd = new CreateIndividualParty_1.CreateIndividualParty(repo, txManager);
        createOrg = new CreateOrganizationParty_1.CreateOrganizationParty(repo, txManager);
        deleteParty = new DeleteParty_1.DeleteParty(repo);
        changeStatus = new ChangePartyStatus_1.ChangePartyStatus(repo);
        getParty = new GetParty_1.GetParty(repo);
    });
    test('CreateIndividualParty - Success', async () => {
        const ind = await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        expect(ind.id).toBeDefined();
        expect(ind.partyType).toBe(PartyTypes_1.PartyType.INDIVIDUAL);
        expect(repo.parties.length).toBe(1);
    });
    test('CreateIndividualParty - Missing fields', async () => {
        await expect(createInd.execute('T1', { firstName: 'John' })).rejects.toThrow(PartyErrors_1.ValidationError);
    });
    test('CreateOrganizationParty - Success', async () => {
        const org = await createOrg.execute('T1', { legalName: 'Acme Corp' });
        expect(org.partyType).toBe(PartyTypes_1.PartyType.ORGANIZATION);
        expect(repo.parties.length).toBe(1);
    });
    test('GetParty - Tenant Isolation', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await expect(getParty.execute('T2', '1')).rejects.toThrow(PartyErrors_1.PartyNotFoundError);
    });
    test('SoftDeleteParty - Success', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await deleteParty.execute('T1', '1');
        await expect(getParty.execute('T1', '1')).rejects.toThrow(PartyErrors_1.PartyNotFoundError);
    });
    test('ChangeStatus - Valid Transition', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        const party = await changeStatus.execute('T1', '1', PartyTypes_1.PartyStatus.SUSPENDED);
        expect(party.status).toBe(PartyTypes_1.PartyStatus.SUSPENDED);
    });
    test('ChangeStatus - Invalid Transition', async () => {
        await createInd.execute('T1', { firstName: 'John', lastName: 'Doe' });
        await changeStatus.execute('T1', '1', PartyTypes_1.PartyStatus.TERMINATED);
        // Terminated is terminal, cannot go back to ACTIVE
        await expect(changeStatus.execute('T1', '1', PartyTypes_1.PartyStatus.ACTIVE)).rejects.toThrow(PartyErrors_1.InvalidPartyStateTransitionError);
    });
});
