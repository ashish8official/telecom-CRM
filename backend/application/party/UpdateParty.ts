import { IPartyRepository } from '../../domain/party/PartyRepository';
import { PartyType, UpdateIndividualInput, UpdateOrganizationInput, Party } from '../../domain/party/PartyTypes';
import { PartyNotFoundError, ValidationError, PartyDeletedError } from '../../domain/party/PartyErrors';

export class UpdateParty {
    constructor(private repo: IPartyRepository) {}

    async execute(tenantId: string, partyId: string, partyType: PartyType, data: UpdateIndividualInput | UpdateOrganizationInput): Promise<Party> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!partyId) throw new ValidationError("Party ID is required");

        const existingParty = await this.repo.getParty(tenantId, partyId);
        if (!existingParty) {
            throw new PartyNotFoundError(partyId, tenantId);
        }
        if (existingParty.deletedAt) {
            throw new PartyDeletedError(partyId);
        }
        if (existingParty.partyType !== partyType) {
            throw new ValidationError(`Cannot update party as type ${partyType}. Existing type is ${existingParty.partyType}`);
        }

        if (partyType === PartyType.INDIVIDUAL) {
            return await this.repo.updateIndividual(tenantId, partyId, data as UpdateIndividualInput);
        } else {
            return await this.repo.updateOrganization(tenantId, partyId, data as UpdateOrganizationInput);
        }
    }
}
