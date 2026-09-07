import { Individual, Organization, Party, PartyStatus, UpdateIndividualInput, UpdateOrganizationInput } from './PartyTypes';

export interface ITransaction {
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
    // Internal driver-specific object, intentionally kept any/unknown in base interface to avoid exposing driver specifics
    getConnection(): any; 
}

export interface IPartyRepository {
    createIndividual(tenantId: string, individual: Partial<Individual>, tx?: ITransaction): Promise<Individual>;
    createOrganization(tenantId: string, organization: Partial<Organization>, tx?: ITransaction): Promise<Organization>;
    
    getParty(tenantId: string, partyId: string, tx?: ITransaction): Promise<Party | Individual | Organization | null>;
    
    updateIndividual(tenantId: string, partyId: string, data: UpdateIndividualInput, tx?: ITransaction): Promise<Individual>;
    updateOrganization(tenantId: string, partyId: string, data: UpdateOrganizationInput, tx?: ITransaction): Promise<Organization>;
    
    updateStatus(tenantId: string, partyId: string, status: PartyStatus, updatedBy?: string, tx?: ITransaction): Promise<Party>;
    
    softDelete(tenantId: string, partyId: string, tx?: ITransaction): Promise<void>;
    
    // Duplicate hook
    findPotentialDuplicates(tenantId: string, type: 'INDIVIDUAL' | 'ORGANIZATION', criteria: any, tx?: ITransaction): Promise<Party[]>;
}
