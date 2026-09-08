import { ValidationError } from '../../domain/common/errors/ValidationError';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { Party } from '../../domain/party/PartyTypes';
import { PartyNotFoundError } from '../../domain/party/PartyErrors';
import { } from '../../domain/party/PartyErrors';

export class GetParty {
    constructor(private repo: IPartyRepository) {}

    async execute(tenantId: string, partyId: string): Promise<Party> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!partyId) throw new ValidationError("Party ID is required");

        const party = await this.repo.getParty(tenantId, partyId);
        if (!party) {
            throw new PartyNotFoundError(partyId, tenantId);
        }
        return party;
    }
}
