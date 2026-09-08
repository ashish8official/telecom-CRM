import { ITransaction } from '../common/transaction/ITransaction';
import { Individual, Organization, Party, PartyStatus, UpdateIndividualInput, UpdateOrganizationInput, CreateIndividualInput, CreateOrganizationInput, DuplicateCriteria } from './PartyTypes';

export interface IPartyRepository {
    createIndividual(tenantId: string, individual: CreateIndividualInput, tx?: ITransaction): Promise<Individual>;
    createOrganization(tenantId: string, organization: CreateOrganizationInput, tx?: ITransaction): Promise<Organization>;
    
    getParty(tenantId: string, partyId: string, tx?: ITransaction): Promise<Party | Individual | Organization | null>;
    
    updateIndividual(tenantId: string, partyId: string, data: UpdateIndividualInput, tx?: ITransaction): Promise<Individual>;
    updateOrganization(tenantId: string, partyId: string, data: UpdateOrganizationInput, tx?: ITransaction): Promise<Organization>;
    
    updateStatus(tenantId: string, partyId: string, status: PartyStatus, updatedBy?: string, tx?: ITransaction): Promise<Party>;
    
    softDelete(tenantId: string, partyId: string, tx?: ITransaction): Promise<void>;
    
    // Duplicate hook
    findPotentialDuplicates(tenantId: string, type: 'INDIVIDUAL' | 'ORGANIZATION', criteria: DuplicateCriteria, tx?: ITransaction): Promise<Party[]>;
}
