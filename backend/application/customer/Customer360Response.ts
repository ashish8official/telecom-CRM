import { GeographicLocationReference } from '../../domain/common/context/GeographicLocationReference';
import { CatalogueDiscoveryResult } from '../../domain/catalogue/CatalogueTypes';

export interface ComponentStatus<T> {
    status: 'SUCCESS' | 'UNAVAILABLE' | 'NOT_IMPLEMENTED';
    data: T;
    error?: string;
}

export interface Customer360Customer {
    id: string;
    customerCode?: string; // Using whatever is available
    status: string;
    customerCategory?: string;
    customerSegment?: string;
    partyId: string;
    version: number;
}

export interface Customer360Subscriber {
    id: string;
    subscriberCode: string;
    status: string;
    serviceCategory: string;
    serviceMode: string;
    directAccountId: string;
    billingAccountId: string;
    geographicContext?: GeographicLocationReference;
}

export interface Customer360Account {
    id: string;
    accountCode?: string; // Whatever is available
    accountType: string; // e.g. MASTER, CHILD
    status: string;
    parentAccountId?: string | null;
    billingAccountId: string;
    billingResponsibleFlag: boolean;
    subscribers: Customer360Subscriber[];
}

export interface Customer360Response {
    customer: ComponentStatus<Customer360Customer>;
    accounts: ComponentStatus<Customer360Account[]>;
    contacts: ComponentStatus<any[]>;
    preferences: ComponentStatus<any[]>;
    consents: ComponentStatus<any[]>;
    productDiscovery: ComponentStatus<CatalogueDiscoveryResult | null>;
}
