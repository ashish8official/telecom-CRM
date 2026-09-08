export enum PartyType {
    INDIVIDUAL = 'INDIVIDUAL',
    ORGANIZATION = 'ORGANIZATION'
}

export enum PartyStatus {
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    TERMINATED = 'TERMINATED'
}

export interface Party {
    id: string;
    tenantId: string;
    partyType: PartyType;
    status: PartyStatus;
    createdAt?: Date;
    createdBy?: string;
    updatedAt?: Date;
    updatedBy?: string;
    deletedAt?: Date | null;
}

export interface Individual extends Party {
    firstName: string;
    middleName?: string;
    lastName: string;
    title?: string;
    gender?: string;
    dateOfBirth?: Date;
}

export interface Organization extends Party {
    legalName: string;
    tradingName?: string;
    registrationNumber?: string;
    establishedDate?: Date;
}

export interface UpdateIndividualInput {
    firstName?: string;
    middleName?: string;
    lastName?: string;
    title?: string;
    gender?: string;
    dateOfBirth?: Date;
    updatedBy?: string;
}

export interface UpdateOrganizationInput {
    legalName?: string;
    tradingName?: string;
    registrationNumber?: string;
    establishedDate?: Date;
    updatedBy?: string;
}

export interface CreateIndividualInput {
    firstName: string;
    middleName?: string;
    lastName: string;
    title?: string;
    gender?: string;
    dateOfBirth?: Date;
    createdBy?: string;
}

export interface CreateOrganizationInput {
    legalName: string;
    tradingName?: string;
    registrationNumber?: string;
    establishedDate?: Date;
    createdBy?: string;
}

export interface IndividualDuplicateCriteria {
    firstName: string;
    lastName: string;
}

export interface OrganizationDuplicateCriteria {
    legalName: string;
}

export type DuplicateCriteria = IndividualDuplicateCriteria | OrganizationDuplicateCriteria;
