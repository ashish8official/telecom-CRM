"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteParty = void 0;
const PartyErrors_1 = require("../../domain/party/PartyErrors");
class DeleteParty {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(tenantId, partyId) {
        if (!tenantId)
            throw new PartyErrors_1.ValidationError("Tenant ID is required");
        if (!partyId)
            throw new PartyErrors_1.ValidationError("Party ID is required");
        const party = await this.repo.getParty(tenantId, partyId);
        if (!party) {
            throw new PartyErrors_1.PartyNotFoundError(partyId, tenantId);
        }
        if (party.deletedAt) {
            throw new PartyErrors_1.PartyDeletedError(partyId);
        }
        await this.repo.softDelete(tenantId, partyId);
    }
}
exports.DeleteParty = DeleteParty;
