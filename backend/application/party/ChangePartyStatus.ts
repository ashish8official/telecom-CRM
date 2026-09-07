import { IPartyRepository } from '../../domain/party/PartyRepository';
import { PartyNotFoundError, ValidationError, InvalidPartyStateTransitionError, PartyDeletedError } from '../../domain/party/PartyErrors';
import { PartyStatus, Party } from '../../domain/party/PartyTypes';

export class ChangePartyStatus {
    constructor(private repo: IPartyRepository) {}

    async execute(tenantId: string, partyId: string, newStatus: PartyStatus, updatedBy?: string): Promise<Party> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!partyId) throw new ValidationError("Party ID is required");
        
        const party = await this.repo.getParty(tenantId, partyId);
        if (!party) {
            throw new PartyNotFoundError(partyId, tenantId);
        }
        if (party.deletedAt) {
            throw new PartyDeletedError(partyId);
        }

        this.validateTransition(party.status, newStatus);

        return await this.repo.updateStatus(tenantId, partyId, newStatus, updatedBy);
    }

    private validateTransition(current: PartyStatus, next: PartyStatus) {
        if (current === next) return; // No-op
        
        const validTransitions: Record<PartyStatus, PartyStatus[]> = {
            [PartyStatus.ACTIVE]: [PartyStatus.SUSPENDED, PartyStatus.TERMINATED],
            [PartyStatus.SUSPENDED]: [PartyStatus.ACTIVE, PartyStatus.TERMINATED],
            [PartyStatus.TERMINATED]: [] // Terminal state
        };

        if (!validTransitions[current].includes(next)) {
            throw new InvalidPartyStateTransitionError(current, next);
        }
    }
}
