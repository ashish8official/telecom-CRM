import { ValidationError } from '../../domain/common/errors/ValidationError';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from '../../domain/common/transaction/ITransactionManager';
import { CreateIndividualInput, Individual, PartyType } from '../../domain/party/PartyTypes';
import { InvalidPartyTypeError } from '../../domain/party/PartyErrors';

export class CreateIndividualParty {
    constructor(
        private readonly partyRepository: IPartyRepository,
        private readonly transactionManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: CreateIndividualInput): Promise<Individual> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.firstName || data.firstName.trim().length === 0) throw new ValidationError("First name is required");
        if (!data.lastName || data.lastName.trim().length === 0) throw new ValidationError("Last name is required");
        

        const tx = await this.transactionManager.beginTransaction();
        try {
            // Duplicate detection hook (informational only for Phase 1)
            const duplicates = await this.partyRepository.findPotentialDuplicates(tenantId, 'INDIVIDUAL', {
                firstName: data.firstName,
                lastName: data.lastName
            }, tx);
            if (duplicates.length > 0) {
                console.warn(`[DuplicateHook] Potential duplicate Individual found for ${data.firstName} ${data.lastName}`);
            }

            const individual = await this.partyRepository.createIndividual(tenantId, data, tx);
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
