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
    version: number;
    createdAt: Date;
    createdBy?: string;
    updatedAt: Date;
    updatedBy?: string;
}

export interface CustomerStatusHistory {
    id: string;
    tenantId: string;
    customerId: string;
    previousStatus?: CustomerStatus;
    newStatus: CustomerStatus;
    reasonCode: string;
    reasonDescription?: string;
    changedAt: Date;
    changedBy?: string;
}

export interface ChangeCustomerStatusInput {
    newStatus: CustomerStatus;
    reasonCode: string;
    reasonDescription?: string;
    version: number;
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
