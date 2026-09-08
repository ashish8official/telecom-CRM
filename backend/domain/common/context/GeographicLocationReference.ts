/**
 * Represents a stable, system-independent reference to a geographic location.
 * 
 * In a multi-country telecom architecture, the CRM holds factual geographic data
 * (e.g., where a customer lives, where a service is installed) but does NOT own 
 * the commercial "Market" definition (which is owned by the Product Catalogue).
 * 
 * The CRM will use stable string references (e.g., ISO country codes, postal codes,
 * or standard administrative area codes) to represent geographic facts. These facts
 * can be passed to external systems (like a Product Catalogue) to evaluate 
 * commercial eligibility.
 */
export interface GeographicLocationReference {
    /**
     * E.g., 'COUNTRY', 'REGION', 'PROVINCE', 'DISTRICT', 'CITY', 'POSTAL_AREA'
     * Using a flexible string or enum allows progressive enrichment and 
     * variability across different countries.
     */
    level: string;

    /**
     * A stable, externally recognizable identifier for this location.
     * Examples: 'CM' (Cameroon), 'CM-CE' (Centre Region), '75001' (Paris Postal)
     */
    code: string;

    /**
     * Optional human-readable name of the location.
     */
    name?: string;

    /**
     * An optional stable identifier corresponding to an external Master Data system
     * or a specific recognized hierarchy ID.
     */
    externalId?: string;
}
