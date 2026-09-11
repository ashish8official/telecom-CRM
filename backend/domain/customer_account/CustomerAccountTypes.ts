export enum AccountLevel {
    MASTER = 'MASTER',
    CHILD = 'CHILD'
}

export enum AccountStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    CLOSED = 'CLOSED'
}

export interface CustomerAccount {
    id: string;
    tenantId: string;
    customerId: string;
    parentAccountId?: string | null;
    accountLevel: AccountLevel;
    status: AccountStatus;
    billingResponsibleFlag: boolean;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    version: number;
    createdAt: Date;
    createdBy?: string;
    updatedAt: Date;
    updatedBy?: string;
}

export interface CustomerAccountStatusHistory {
    id: string;
    tenantId: string;
    customerAccountId: string;
    previousStatus?: AccountStatus;
    newStatus: AccountStatus;
    reasonCode: string;
    reasonDescription?: string;
    changedAt: Date;
    changedBy?: string;
}

export interface ChangeCustomerAccountStatusInput {
    newStatus: AccountStatus;
    reasonCode: string;
    reasonDescription?: string;
    version: number;
    updatedBy?: string;
}

export interface CustomerAccountHierarchy extends CustomerAccount {
    children: CustomerAccountHierarchy[];
}

export interface CreateMasterAccountInput {
    customerId: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    createdBy?: string;
}

export interface CreateChildAccountInput {
    customerId: string;
    parentAccountId: string;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    createdBy?: string;
}

export interface UpdateCustomerAccountInput {
    effectiveTo?: Date;
    updatedBy?: string;
}
