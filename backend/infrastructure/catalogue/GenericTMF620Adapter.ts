import { CataloguePort } from '../../domain/catalogue/CataloguePort';
import { 
    CatalogueCapabilities, 
    CustomerDiscoveryContext, 
    CatalogueDiscoveryResult, 
    CatalogueOffering, 
    DiscoveryMode, 
    EligibilityStatus, 
    PriceResolutionStatus, 
    CatalogueDiscoveryStatus 
} from '../../domain/catalogue/CatalogueTypes';
import { CircuitBreaker, withBoundedRetry } from './Resilience';
import { ExternalServiceUnavailableError, ExternalServiceContractViolationError } from '../../domain/catalogue/CatalogueErrors';

export class GenericTMF620Adapter implements CataloguePort {
    private capabilities: CatalogueCapabilities = {
        supportsBasicOfferingDiscovery: true,
        supportsOfferingDetails: true,
        supportsPriceLookup: false, // TMF620 standard doesn't necessarily evaluate contextual price dynamically in discovery
        supportsContextualEligibility: false, // Basic TMF620 just lists catalog items
        supportsBundleResolution: true
    };

    constructor(
        private baseUrl: string, 
        private circuitBreaker: CircuitBreaker,
        private httpClient: any // injected mock or actual axios instance
    ) {}

    getCapabilities(): CatalogueCapabilities {
        return this.capabilities;
    }

    async discoverOfferings(context: CustomerDiscoveryContext): Promise<CatalogueDiscoveryResult> {
        try {
            const rawResponse = await this.circuitBreaker.execute(() => 
                withBoundedRetry(() => this.fetchTMF620Offerings(context))
            );

            const offerings = this.normalizeResponse(rawResponse);

            return {
                status: offerings.length > 0 ? CatalogueDiscoveryStatus.SUCCESS : CatalogueDiscoveryStatus.NO_RESULTS,
                discoveryMode: DiscoveryMode.BASIC_CATALOGUE_DISCOVERY,
                eligibilityStatus: EligibilityStatus.NOT_EVALUATED,
                priceResolutionStatus: PriceResolutionStatus.PRICE_LISTED,
                capabilitiesUsed: {
                    supportsBasicOfferingDiscovery: true
                },
                offerings
            };

        } catch (e: any) {
            if (e instanceof ExternalServiceUnavailableError) {
                throw e; // Handled by App layer for graceful degradation
            }
            if (e instanceof ExternalServiceContractViolationError) {
                return {
                    status: CatalogueDiscoveryStatus.CONTRACT_ERROR,
                    discoveryMode: DiscoveryMode.BASIC_CATALOGUE_DISCOVERY,
                    eligibilityStatus: EligibilityStatus.NOT_EVALUATED,
                    priceResolutionStatus: PriceResolutionStatus.PRICE_UNAVAILABLE,
                    capabilitiesUsed: {},
                    offerings: [],
                    message: e.message
                };
            }
            throw e;
        }
    }

    async getOffering(tenantId: string, offeringId: string, context?: CustomerDiscoveryContext): Promise<CatalogueOffering | null> {
        try {
            const rawResponse = await this.circuitBreaker.execute(() => 
                withBoundedRetry(() => this.fetchTMF620OfferingDetail(tenantId, offeringId))
            );

            if (!rawResponse) return null;
            return this.mapToCatalogueOffering(rawResponse);
        } catch (e: any) {
            if (e.status === 404) return null;
            throw e;
        }
    }

    private async fetchTMF620Offerings(context: CustomerDiscoveryContext): Promise<any[]> {
        // TMF620 calls don't take complex contextual logic natively unless extended.
        // We might just pass category filters if we had them.
        const headers = { 'x-tenant-id': context.tenantId };
        const response = await this.httpClient.get(`${this.baseUrl}/productOffering`, { headers });
        return response.data;
    }

    private async fetchTMF620OfferingDetail(tenantId: string, offeringId: string): Promise<any> {
        const headers = { 'x-tenant-id': tenantId };
        const response = await this.httpClient.get(`${this.baseUrl}/productOffering/${offeringId}`, { headers });
        return response.data;
    }

    private normalizeResponse(rawData: any): CatalogueOffering[] {
        if (!Array.isArray(rawData)) {
            throw new ExternalServiceContractViolationError('TMF620', 'Expected array of product offerings');
        }

        return rawData.map(item => this.mapToCatalogueOffering(item));
    }

    private mapToCatalogueOffering(item: any): CatalogueOffering {
        if (!item.id || !item.name) {
            throw new ExternalServiceContractViolationError('TMF620', 'Offering missing required id or name');
        }

        return {
            id: item.id,
            name: item.name,
            description: item.description,
            lifecycleStatus: item.lifecycleStatus || 'Active',
            prices: (item.productOfferingPrice || []).map((pop: any) => ({
                type: pop.priceType || 'UNKNOWN',
                amount: pop.price?.value || 0,
                currency: pop.price?.unit || 'XXX'
            })),
            bundledOfferings: (item.bundledProductOffering || []).map((bpo: any) => bpo.id)
        };
    }
}
