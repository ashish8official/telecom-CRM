"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateOrganizationParty = void 0;
const PartyTypes_1 = require("../../domain/party/PartyTypes");
const PartyErrors_1 = require("../../domain/party/PartyErrors");
class CreateOrganizationParty {
    repo;
    txManager;
    constructor(repo, txManager) {
        this.repo = repo;
        this.txManager = txManager;
    }
    async execute(tenantId, data) {
        if (!tenantId)
            throw new PartyErrors_1.ValidationError("Tenant ID is required");
        if (!data.legalName)
            throw new PartyErrors_1.ValidationError("Legal name is required");
        if (data.partyType && data.partyType !== PartyTypes_1.PartyType.ORGANIZATION) {
            throw new PartyErrors_1.InvalidPartyTypeError(PartyTypes_1.PartyType.ORGANIZATION, data.partyType);
        }
        const tx = await this.txManager.beginTransaction();
        try {
            const duplicates = await this.repo.findPotentialDuplicates(tenantId, 'ORGANIZATION', {
                legalName: data.legalName
            }, tx);
            if (duplicates.length > 0) {
                console.warn(`[DuplicateHook] Potential duplicate Organization found for ${data.legalName}`);
            }
            const org = await this.repo.createOrganization(tenantId, data, tx);
            await tx.commit();
            return org;
        }
        catch (err) {
            await tx.rollback();
            throw err;
        }
        finally {
            tx.release();
        }
    }
}
exports.CreateOrganizationParty = CreateOrganizationParty;
