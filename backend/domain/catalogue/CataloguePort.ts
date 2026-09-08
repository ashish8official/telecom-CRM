import { 
    CatalogueCapabilities, 
    CustomerDiscoveryContext, 
    CatalogueDiscoveryResult, 
    CatalogueOffering 
} from './CatalogueTypes';

export interface CataloguePort {
    getCapabilities(): CatalogueCapabilities;

    discoverOfferings(
        context: CustomerDiscoveryContext
    ): Promise<CatalogueDiscoveryResult>;

    getOffering(
        tenantId: string,
        offeringId: string,
        context?: CustomerDiscoveryContext
    ): Promise<CatalogueOffering | null>;
}
