"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateIndividualParty = void 0;
const PartyTypes_1 = require("../../domain/party/PartyTypes");
const PartyErrors_1 = require("../../domain/party/PartyErrors");
class CreateIndividualParty {
    repo;
    txManager;
    constructor(repo, txManager) {
        this.repo = repo;
        this.txManager = txManager;
    }
    async execute(tenantId, data) {
        if (!tenantId)
            throw new PartyErrors_1.ValidationError("Tenant ID is required");
        if (!data.firstName)
            throw new PartyErrors_1.ValidationError("First name is required");
        if (!data.lastName)
            throw new PartyErrors_1.ValidationError("Last name is required");
        if (data.partyType && data.partyType !== PartyTypes_1.PartyType.INDIVIDUAL) {
            throw new PartyErrors_1.InvalidPartyTypeError(PartyTypes_1.PartyType.INDIVIDUAL, data.partyType);
        }
        const tx = await this.txManager.beginTransaction();
        try {
            // Duplicate detection hook (informational only for Phase 1)
            const duplicates = await this.repo.findPotentialDuplicates(tenantId, 'INDIVIDUAL', {
                firstName: data.firstName,
                lastName: data.lastName
            }, tx);
            if (duplicates.length > 0) {
                console.warn(`[DuplicateHook] Potential duplicate Individual found for ${data.firstName} ${data.lastName}`);
            }
            const individual = await this.repo.createIndividual(tenantId, data, tx);
            await tx.commit();
            return individual;
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
exports.CreateIndividualParty = CreateIndividualParty;
