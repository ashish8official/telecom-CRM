"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetParty = void 0;
const PartyErrors_1 = require("../../domain/party/PartyErrors");
const PartyErrors_2 = require("../../domain/party/PartyErrors");
class GetParty {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(tenantId, partyId) {
        if (!tenantId)
            throw new PartyErrors_2.ValidationError("Tenant ID is required");
        if (!partyId)
            throw new PartyErrors_2.ValidationError("Party ID is required");
        const party = await this.repo.getParty(tenantId, partyId);
        if (!party) {
            throw new PartyErrors_1.PartyNotFoundError(partyId, tenantId);
        }
        return party;
    }
}
exports.GetParty = GetParty;
