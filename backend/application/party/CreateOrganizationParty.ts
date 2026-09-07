import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from './ITransactionManager';
import { Organization, PartyType } from '../../domain/party/PartyTypes';
import { ValidationError, InvalidPartyTypeError } from '../../domain/party/PartyErrors';

export class CreateOrganizationParty {
    constructor(
        private repo: IPartyRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: Partial<Organization>): Promise<Organization> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.legalName) throw new ValidationError("Legal name is required");
        if (data.partyType && data.partyType !== PartyType.ORGANIZATION) {
            throw new InvalidPartyTypeError(PartyType.ORGANIZATION, data.partyType);
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
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }
}
