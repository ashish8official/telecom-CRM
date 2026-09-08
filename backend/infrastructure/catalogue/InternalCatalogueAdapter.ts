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

export class InternalCatalogueAdapter implements CataloguePort {
    private capabilities: CatalogueCapabilities = {
        supportsBasicOfferingDiscovery: true,
        supportsOfferingDetails: true,
        supportsPriceLookup: true, // Internal evaluates price overrides
        supportsContextualEligibility: true, // Internal evaluates market mapping and restrictions
        supportsBundleResolution: true
    };

    constructor(
        private baseUrl: string, 
        private circuitBreaker: CircuitBreaker,
        private httpClient: any
    ) {}

    getCapabilities(): CatalogueCapabilities {
        return this.capabilities;
    }

    async discoverOfferings(context: CustomerDiscoveryContext): Promise<CatalogueDiscoveryResult> {
        try {
            const rawResponse = await this.circuitBreaker.execute(() => 
                withBoundedRetry(() => this.fetchInternalOfferings(context))
            );

            const offerings = this.normalizeResponse(rawResponse);

            return {
                status: offerings.length > 0 ? CatalogueDiscoveryStatus.SUCCESS : CatalogueDiscoveryStatus.NO_RESULTS,
                discoveryMode: DiscoveryMode.CONTEXTUAL_ELIGIBILITY,
                eligibilityStatus: EligibilityStatus.EVALUATED,
                priceResolutionStatus: PriceResolutionStatus.PRICE_RESOLVED,
                capabilitiesUsed: this.capabilities,
                offerings
            };

        } catch (e: any) {
            if (e instanceof ExternalServiceUnavailableError) {
                throw e; 
            }
            if (e instanceof ExternalServiceContractViolationError) {
                return {
                    status: CatalogueDiscoveryStatus.CONTRACT_ERROR,
                    discoveryMode: DiscoveryMode.CONTEXTUAL_ELIGIBILITY,
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
                withBoundedRetry(() => this.fetchInternalOfferingDetail(tenantId, offeringId, context))
            );

            if (!rawResponse) return null;
            return this.mapToCatalogueOffering(rawResponse);
        } catch (e: any) {
            if (e.status === 404) return null;
            throw e;
        }
    }

    private async fetchInternalOfferings(context: CustomerDiscoveryContext): Promise<any[]> {
        const headers = { 'x-tenant-id': context.tenantId };
        // Internal catalogue takes the full context to perform eligibility and price resolution
        const response = await this.httpClient.post(`${this.baseUrl}/api/v1/discovery/eligible-offerings`, context, { headers });
        return response.data;
    }

    private async fetchInternalOfferingDetail(tenantId: string, offeringId: string, context?: CustomerDiscoveryContext): Promise<any> {
        const headers = { 'x-tenant-id': tenantId };
        const url = `${this.baseUrl}/api/v1/offerings/${offeringId}`;
        const response = context ? 
            await this.httpClient.post(`${url}/evaluate`, context, { headers }) : 
            await this.httpClient.get(url, { headers });
            
        return response.data;
    }

    private normalizeResponse(rawData: any): CatalogueOffering[] {
        if (!Array.isArray(rawData)) {
            throw new ExternalServiceContractViolationError('InternalCatalogue', 'Expected array of product offerings');
        }
        return rawData.map(item => this.mapToCatalogueOffering(item));
    }

    private mapToCatalogueOffering(item: any): CatalogueOffering {
        if (!item.id || !item.name) {
            throw new ExternalServiceContractViolationError('InternalCatalogue', 'Offering missing required id or name');
        }

        return {
            id: item.id,
            name: item.name,
            description: item.description,
            lifecycleStatus: item.status || 'Active',
            prices: (item.resolvedPrices || []).map((p: any) => ({
                type: p.chargeType || 'UNKNOWN',
                amount: p.amount || 0,
                currency: p.currencyCode || 'XXX'
            })),
            bundledOfferings: item.bundleContents || []
        };
    }
}
