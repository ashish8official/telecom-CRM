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
        supportsPriceLookup: true,
        supportsContextualEligibility: false, // Our catalogue doesn't have a dedicated eligibility endpoint yet
        supportsBundleResolution: true
    };

    constructor(
        private baseUrl: string, 
        private circuitBreaker: CircuitBreaker,
        private catalogueTenantId: string = '17000000-0000-4000-a000-000000000000'
    ) {}

    getCapabilities(): CatalogueCapabilities {
        return this.capabilities;
    }

    async discoverOfferings(context: CustomerDiscoveryContext): Promise<CatalogueDiscoveryResult> {
        try {
            const rawOfferings = await this.circuitBreaker.execute(() => 
                withBoundedRetry(() => this.fetchOfferings())
            );

            const offerings = this.normalizeResponse(rawOfferings);

            // Attempt to fetch prices for each offering
            let priceStatus = PriceResolutionStatus.PRICE_UNAVAILABLE;
            try {
                const rawPrices = await this.circuitBreaker.execute(() => 
                    withBoundedRetry(() => this.fetchPrices())
                );
                if (Array.isArray(rawPrices) && rawPrices.length > 0) {
                    priceStatus = PriceResolutionStatus.PRICE_RESOLVED;
                    // Attach prices to offerings
                    for (const offering of offerings) {
                        const matchingPrices = rawPrices.filter((p: any) => 
                            p.productOfferingRef?.id === offering.id
                        );
                        if (matchingPrices.length > 0) {
                            offering.prices = matchingPrices.map((p: any) => ({
                                type: p.priceType || 'UNKNOWN',
                                amount: p.price?.taxIncludedAmount?.value || 0,
                                currency: p.price?.taxIncludedAmount?.unit || 'INR'
                            }));
                        }
                    }
                }
            } catch {
                // Prices unavailable is fine — graceful degradation
            }

            return {
                status: offerings.length > 0 ? CatalogueDiscoveryStatus.SUCCESS : CatalogueDiscoveryStatus.NO_RESULTS,
                discoveryMode: DiscoveryMode.BASIC_CATALOGUE_DISCOVERY,
                eligibilityStatus: EligibilityStatus.NOT_EVALUATED,
                priceResolutionStatus: priceStatus,
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
                withBoundedRetry(() => this.fetchOfferingDetail(offeringId))
            );

            if (!rawResponse) return null;
            return this.mapToCatalogueOffering(rawResponse);
        } catch (e: any) {
            if (e.status === 404) return null;
            throw e;
        }
    }

    private async fetchOfferings(): Promise<any[]> {
        // Call the real TMF620 endpoint on the Product Catalogue
        const url = `${this.baseUrl}/productCatalogManagement/v5/productOffering`;
        const res = await fetch(url, {
            headers: { 'x-tenant-id': this.catalogueTenantId }
        });
        if (!res.ok) {
            throw new ExternalServiceUnavailableError('InternalCatalogue', `HTTP ${res.status} from ${url}`);
        }
        return res.json();
    }

    private async fetchPrices(): Promise<any[]> {
        const url = `${this.baseUrl}/productCatalogManagement/v5/productOfferingPrice`;
        const res = await fetch(url, {
            headers: { 'x-tenant-id': this.catalogueTenantId }
        });
        if (!res.ok) return [];
        return res.json();
    }

    private async fetchOfferingDetail(offeringId: string): Promise<any> {
        const url = `${this.baseUrl}/productCatalogManagement/v5/productOffering/${offeringId}`;
        const res = await fetch(url, {
            headers: { 'x-tenant-id': this.catalogueTenantId }
        });
        if (!res.ok) return null;
        return res.json();
    }

    private normalizeResponse(rawData: any): CatalogueOffering[] {
        if (!Array.isArray(rawData)) {
            throw new ExternalServiceContractViolationError('InternalCatalogue', 'Expected array of product offerings');
        }
        return rawData.map(item => this.mapToCatalogueOffering(item));
    }

    private mapToCatalogueOffering(item: any): CatalogueOffering {
        // Map from TMF620 ProductOffering shape
        const id = item.id || item.offering_id;
        const name = item.name || item.offering_name;

        if (!id || !name) {
            throw new ExternalServiceContractViolationError('InternalCatalogue', 'Offering missing required id or name');
        }

        return {
            id,
            name,
            description: item.description || '',
            lifecycleStatus: item.lifecycleStatus || item.status || 'Active',
            prices: (item.productOfferingPrice || []).map((p: any) => ({
                type: p.priceType || 'UNKNOWN',
                amount: p.price?.taxIncludedAmount?.value || 0,
                currency: p.price?.taxIncludedAmount?.unit || 'INR'
            })),
            bundledOfferings: item.bundledProductOffering || []
        };
    }
}
