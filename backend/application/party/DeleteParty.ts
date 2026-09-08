import { ValidationError } from '../../domain/common/errors/ValidationError';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { PartyNotFoundError, PartyDeletedError } from '../../domain/party/PartyErrors';

export class DeleteParty {
    constructor(private repo: IPartyRepository) {}

    async execute(tenantId: string, partyId: string): Promise<void> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!partyId) throw new ValidationError("Party ID is required");

        const party = await this.repo.getParty(tenantId, partyId);
        if (!party) {
            throw new PartyNotFoundError(partyId, tenantId);
        }
        if (party.deletedAt) {
            throw new PartyDeletedError(partyId);
        }

        await this.repo.softDelete(tenantId, partyId);
    }
}
