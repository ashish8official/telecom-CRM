"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangePartyStatus = void 0;
const PartyErrors_1 = require("../../domain/party/PartyErrors");
const PartyTypes_1 = require("../../domain/party/PartyTypes");
class ChangePartyStatus {
    repo;
    constructor(repo) {
        this.repo = repo;
    }
    async execute(tenantId, partyId, newStatus, updatedBy) {
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
        this.validateTransition(party.status, newStatus);
        return await this.repo.updateStatus(tenantId, partyId, newStatus, updatedBy);
    }
    validateTransition(current, next) {
        if (current === next)
            return; // No-op
        const validTransitions = {
            [PartyTypes_1.PartyStatus.ACTIVE]: [PartyTypes_1.PartyStatus.SUSPENDED, PartyTypes_1.PartyStatus.TERMINATED],
            [PartyTypes_1.PartyStatus.SUSPENDED]: [PartyTypes_1.PartyStatus.ACTIVE, PartyTypes_1.PartyStatus.TERMINATED],
            [PartyTypes_1.PartyStatus.TERMINATED]: [] // Terminal state
        };
        if (!validTransitions[current].includes(next)) {
            throw new PartyErrors_1.InvalidPartyStateTransitionError(current, next);
        }
    }
}
exports.ChangePartyStatus = ChangePartyStatus;
