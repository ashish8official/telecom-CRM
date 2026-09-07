export enum CustomerStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED'
}

export interface Customer {
    id: string;
    tenantId: string;
    partyId: string;
    status: CustomerStatus;
    customerCategory?: string;
    customerSegment?: string;
    effectiveFrom: Date;
    effectiveTo?: Date;
    createdAt: Date;
    createdBy?: string;
    updatedAt: Date;
    updatedBy?: string;
}

export interface CreateCustomerInput {
    partyId: string;
    status?: CustomerStatus;
    customerCategory?: string;
    customerSegment?: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    createdBy?: string;
}

export interface UpdateCustomerInput {
    customerCategory?: string;
    customerSegment?: string;
    effectiveTo?: Date;
    updatedBy?: string;
}
