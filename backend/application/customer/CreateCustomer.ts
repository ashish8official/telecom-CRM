import { ICustomerRepository } from '../../domain/customer/CustomerRepository';
import { IPartyRepository } from '../../domain/party/PartyRepository';
import { ITransactionManager } from '../party/ITransactionManager';
import { CreateCustomerInput, Customer, CustomerStatus } from '../../domain/customer/CustomerTypes';
import { 
    CustomerAlreadyExistsError, 
    InvalidTemporalDatesError, 
    PartyNotEligibleForCustomerError 
} from '../../domain/customer/CustomerErrors';
import { ValidationError, PartyNotFoundError } from '../../domain/party/PartyErrors';

export class CreateCustomer {
    constructor(
        private customerRepo: ICustomerRepository,
        private partyRepo: IPartyRepository,
        private txManager: ITransactionManager
    ) {}

    async execute(tenantId: string, data: CreateCustomerInput): Promise<Customer> {
        if (!tenantId) throw new ValidationError("Tenant ID is required");
        if (!data.partyId) throw new ValidationError("Party ID is required");

        if (data.effectiveFrom && data.effectiveTo && new Date(data.effectiveTo) < new Date(data.effectiveFrom)) {
            throw new InvalidTemporalDatesError();
        }

        const tx = await this.txManager.beginTransaction();
        try {
            // Validate Party eligibility
            const party = await this.partyRepo.getParty(tenantId, data.partyId, tx);
            if (!party) {
                throw new PartyNotFoundError(data.partyId, tenantId);
            }
            if (party.deletedAt) {
                throw new PartyNotEligibleForCustomerError(data.partyId, 'Party is soft-deleted');
            }

            // Check existing Active/Suspended Customer relationship for the same Party
            const existing = await this.customerRepo.findExistingActiveCustomer(tenantId, data.partyId, tx);
            if (existing) {
                throw new CustomerAlreadyExistsError(data.partyId, tenantId);
            }

            const customer = await this.customerRepo.createCustomer(tenantId, data, tx);
            await tx.commit();
            return customer;
        } catch (err) {
            await tx.rollback();
            throw err;
        } finally {
            tx.release();
        }
    }
}
