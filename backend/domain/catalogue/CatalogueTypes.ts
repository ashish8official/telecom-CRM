import { GeographicLocationReference } from '../common/context/GeographicLocationReference';
import { SubscriberStatus } from '../subscriber/SubscriberTypes';

export interface CatalogueCapabilities {
    supportsBasicOfferingDiscovery: boolean;
    supportsOfferingDetails: boolean;
    supportsPriceLookup: boolean;
    supportsContextualEligibility: boolean;
    supportsBundleResolution: boolean;
}

export interface CustomerDiscoveryContext {
    tenantId: string;
    
    // Customer Facts
    customerId?: string;
    customerType?: string;
    customerCategory?: string;
    
    // Account Facts
    accountId?: string;
    accountLevel?: string;
    
    // Subscriber Facts
    subscriberId?: string;
    subscriberStatus?: SubscriberStatus;
    serviceCategory?: string;
    serviceMode?: string;
    
    // Geographic/Market Context
    geographicContext?: GeographicLocationReference;
    
    // Temporal Context
    effectiveAt: Date;
}

export enum DiscoveryMode {
    BASIC_CATALOGUE_DISCOVERY = 'BASIC_CATALOGUE_DISCOVERY',
    CONTEXTUAL_ELIGIBILITY = 'CONTEXTUAL_ELIGIBILITY'
}

export enum EligibilityStatus {
    NOT_EVALUATED = 'NOT_EVALUATED',
    EVALUATED = 'EVALUATED'
}

export enum PriceResolutionStatus {
    PRICE_RESOLVED = 'PRICE_RESOLVED',
    PRICE_LISTED = 'PRICE_LISTED',
    PRICE_UNAVAILABLE = 'PRICE_UNAVAILABLE'
}

export enum CatalogueDiscoveryStatus {
    SUCCESS = 'SUCCESS',
    NO_RESULTS = 'NO_RESULTS',
    UNAVAILABLE = 'UNAVAILABLE',
    PARTIAL = 'PARTIAL',
    CONTRACT_ERROR = 'CONTRACT_ERROR'
}

export interface CataloguePrice {
    type: string; // e.g. RECURRING, ONE_TIME, USAGE
    amount: number;
    currency: string;
    period?: string; // e.g. MONTH, YEAR
}

export interface CatalogueOffering {
    id: string;
    name: string;
    description?: string;
    lifecycleStatus: string;
    validFor?: {
        startDateTime: Date;
        endDateTime?: Date;
    };
    productSpecificationReference?: {
        id: string;
        name?: string;
    };
    prices: CataloguePrice[];
    bundledOfferings?: string[];
    categoryReferences?: string[];
}

export interface CatalogueDiscoveryResult {
    status: CatalogueDiscoveryStatus;
    discoveryMode: DiscoveryMode;
    eligibilityStatus: EligibilityStatus;
    priceResolutionStatus: PriceResolutionStatus;
    capabilitiesUsed: Partial<CatalogueCapabilities>;
    offerings: CatalogueOffering[];
    message?: string;
}

export interface CataloguePriceResult {
    status: PriceResolutionStatus;
    prices: CataloguePrice[];
    message?: string;
}
