"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateParty = void 0;
const PartyTypes_1 = require("../../domain/party/PartyTypes");
const PartyErrors_1 = require("../../domain/party/PartyErrors");
class UpdateParty {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(tenantId, partyId, partyType, data) {
        if (!tenantId)
            throw new PartyErrors_1.ValidationError("Tenant ID is required");
        if (!partyId)
            throw new PartyErrors_1.ValidationError("Party ID is required");
        const existingParty = await this.repo.getParty(tenantId, partyId);
        if (!existingParty) {
            throw new PartyErrors_1.PartyNotFoundError(partyId, tenantId);
        }
        if (existingParty.deletedAt) {
            throw new PartyErrors_1.PartyDeletedError(partyId);
        }
        if (existingParty.partyType !== partyType) {
            throw new PartyErrors_1.ValidationError(`Cannot update party as type ${partyType}. Existing type is ${existingParty.partyType}`);
        }
        if (partyType === PartyTypes_1.PartyType.INDIVIDUAL) {
            return await this.repo.updateIndividual(tenantId, partyId, data);
        }
        else {
            return await this.repo.updateOrganization(tenantId, partyId, data);
        }
    }
}
exports.UpdateParty = UpdateParty;
