import { GeographicLocationReference } from '../../domain/common/context/GeographicLocationReference';

/**
 * TenantContext provides the isolated tenant boundary.
 */
export interface TenantContext {
    id: string;
}

/**
 * CustomerContext provides factual data about the customer requesting products.
 */
export interface CustomerContext {
    id: string;
    status: string;
    customerCategory?: string;
    customerSegment?: string;
    
    // CRM owns language preference (communication fact).
    // It is NOT a geographic fact or a commercial market definition.
    preferredLanguage?: string;
}

/**
 * AccountContext provides facts about the billing or structural hierarchy
 * relevant to the purchase.
 */
export interface AccountContext {
    id: string;
    accountLevel: string; // e.g., 'MASTER', 'CHILD'
}

/**
 * CustomerEligibilityContext is the canonical internal CRM DTO passed to a 
 * Catalogue Port.
 * 
 * It contains ONLY factual state owned by the CRM. It does NOT contain 
 * commercial inclusion/exclusion rules, bundle compatibility logic, or 
 * price overrides. 
 * 
 * CRM supplies FACTS. The external Product Catalogue will evaluate these 
 * facts against its RULES.
 */
export interface CustomerEligibilityContext {
    tenant: TenantContext;
    customer: CustomerContext;
    account?: AccountContext;
    
    // Geographic context is optional to support progressive enrichment 
    // (e.g., Prospect vs. Provisioned Subscriber).
    geographic?: GeographicLocationReference;
}
