import { GeographicLocationReference } from '../common/context/GeographicLocationReference';

export enum SubscriberStatus {
    PENDING = 'PENDING',
    ACTIVE = 'ACTIVE',
    SUSPENDED = 'SUSPENDED',
    BARRED = 'BARRED',
    DISCONNECTED = 'DISCONNECTED',
    TERMINATED = 'TERMINATED'
}

export interface Subscriber {
    id: string;
    tenantId: string;
    subscriberCode: string;
    customerAccountId: string;
    serviceCategory: string; // e.g. GSM, M2M
    serviceMode: string; // e.g. PREPAID, POSTPAID
    status: SubscriberStatus;
    geographic?: GeographicLocationReference;
    version: number;
    createdAt: Date;
    createdBy?: string;
    updatedAt: Date;
    updatedBy?: string;
}

export interface SubscriberStatusHistory {
    id: string;
    tenantId: string;
    subscriberId: string;
    previousStatus?: SubscriberStatus;
    newStatus: SubscriberStatus;
    reasonCode: string;
    reasonDescription?: string;
    changedAt: Date;
    changedBy?: string;
}

export interface CreateSubscriberInput {
    subscriberCode?: string; // Made optional so app layer can auto-generate it if not provided
    customerAccountId: string;
    serviceCategory: string;
    serviceMode: string;
    geographic?: GeographicLocationReference;
    createdBy?: string;
}

export interface ChangeSubscriberStatusInput {
    newStatus: SubscriberStatus;
    reasonCode: string;
    reasonDescription?: string;
    version: number; // Concurrency check
    updatedBy?: string;
}
