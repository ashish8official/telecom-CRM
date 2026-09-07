import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from './ITransactionManager';
import { Individual, PartyType } from '../../domain/party/PartyTypes';
import { ValidationError, InvalidPartyTypeError } from '../../domain/party/PartyErrors';

export class CreateIndividualParty {
    constructor(
        private repo: IPartyRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: Partial<Individual>): Promise<Individual> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.firstName) throw new ValidationError("First name is required");
        if (!data.lastName) throw new ValidationError("Last name is required");
        if (data.partyType && data.partyType !== PartyType.INDIVIDUAL) {
            throw new InvalidPartyTypeError(PartyType.INDIVIDUAL, data.partyType);
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
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }
}
